import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  documentExtractions,
  jobApplications,
  skills as skillsTable,
  userDocuments,
  userSkills,
  type DocumentType,
  type ExtractedResume,
} from "@/db/schema";
import { slugify } from "@/db/id";
import { ForbiddenError, NotFoundError } from "@/modules/shared/errors";
import { recordAudit } from "@/modules/shared/audit";
import { buildStorageKey, getStore } from "@/modules/documents/storage";
import { validateUpload } from "@/modules/documents/validate";
import {
  classifyDocument,
  extractText,
  parseNotificationDeterministic,
  parseResume,
} from "@/modules/documents/extract";

export async function listDocuments(userId: string) {
  return db
    .select({
      id: userDocuments.id,
      type: userDocuments.type,
      originalName: userDocuments.originalName,
      sizeBytes: userDocuments.sizeBytes,
      status: userDocuments.status,
      failureReason: userDocuments.failureReason,
      uploadedAt: userDocuments.uploadedAt,
    })
    .from(userDocuments)
    .where(eq(userDocuments.userId, userId))
    .orderBy(desc(userDocuments.uploadedAt));
}

export async function getDocument(documentId: string, userId: string) {
  const document = await db.query.userDocuments.findFirst({
    where: eq(userDocuments.id, documentId),
  });
  if (!document) throw new NotFoundError("That document doesn't exist.");
  if (document.userId !== userId) throw new ForbiddenError("That document isn't yours.");

  const extraction = await db.query.documentExtractions.findFirst({
    where: eq(documentExtractions.documentId, documentId),
  });

  return { document, extraction: extraction ?? null };
}

/**
 * Full text of a stored document, re-read from storage.
 *
 * `textExcerpt` on the row is capped at 2,000 characters — enough to classify
 * a document, not enough to review one. Rather than widen that column and keep
 * a second copy of every résumé in the database, this reads the original file
 * back through the same extractor. Ownership is checked by `getDocument`
 * before anything is read from disk.
 */
export async function readDocumentText(
  documentId: string,
  userId: string,
): Promise<{ text: string; filename: string }> {
  const { document } = await getDocument(documentId, userId);

  try {
    const buffer = await getStore().get(document.storageKey);
    const { text } = await extractText({ buffer, mimeType: document.mimeType });
    if (text.trim()) return { text, filename: document.originalName };
  } catch (error) {
    console.error("[documents] re-read failed, falling back to excerpt", error);
  }

  // The stored excerpt is a genuine fallback, not a silent downgrade: callers
  // decide whether what they get back is long enough for their purpose.
  return { text: document.textExcerpt ?? "", filename: document.originalName };
}

/**
 * Upload → validate → store → extract text → classify → structured parse.
 *
 * Runs inline. Beyond a few hundred concurrent uploads this belongs on the
 * Redis-backed queue the architecture reserves for it; the seam is this
 * function, so moving it is a one-file change.
 */
export async function ingestDocument(input: {
  userId: string;
  file: File;
  declaredType?: DocumentType;
}) {
  const validated = await validateUpload(input.file);
  const storageKey = buildStorageKey(input.userId, validated.originalName);
  await getStore().put(storageKey, validated.buffer, validated.mimeType);

  const [document] = await db
    .insert(userDocuments)
    .values({
      userId: input.userId,
      type: input.declaredType ?? "OTHER",
      originalName: validated.originalName,
      mimeType: validated.mimeType,
      sizeBytes: validated.sizeBytes,
      storageKey,
      status: "PROCESSING",
    })
    .returning();

  try {
    const { text } = await extractText({
      buffer: validated.buffer,
      mimeType: validated.mimeType,
    });

    if (!text.trim()) {
      const reason = validated.mimeType.startsWith("image/")
        ? "We can't read text out of images on this deployment yet — upload a PDF or Word version and we'll analyse it."
        : "We couldn't read any text from that file. If it's a scanned document, try a version with selectable text.";

      await db
        .update(userDocuments)
        .set({ status: "FAILED", failureReason: reason })
        .where(eq(userDocuments.id, document.id));

      return { document: { ...document, status: "FAILED" as const, failureReason: reason }, extraction: null };
    }

    const classified = input.declaredType && input.declaredType !== "OTHER"
      ? { type: input.declaredType, confidence: 1 }
      : classifyDocument(text);

    const parsed = await runParser(classified.type, text);

    await db.insert(documentExtractions).values({
      documentId: document.id,
      extracted: parsed.value as never,
      confidence: { ...parsed.confidence, documentType: classified.confidence },
      modelVersion: "extract-v1",
      providerUsed: parsed.provider,
    });

    await db
      .update(userDocuments)
      .set({
        type: classified.type,
        status: "EXTRACTED",
        textExcerpt: text.slice(0, 2000),
      })
      .where(eq(userDocuments.id, document.id));

    await recordAudit({
      actorType: "user",
      actorId: input.userId,
      action: "document.uploaded",
      entityType: "user_document",
      entityId: document.id,
      after: { type: classified.type, sizeBytes: validated.sizeBytes },
    });

    return {
      document: { ...document, type: classified.type, status: "EXTRACTED" as const },
      extraction: parsed.value,
    };
  } catch (error) {
    console.error("[documents] extraction failed", error);
    await db
      .update(userDocuments)
      .set({
        status: "FAILED",
        failureReason: "Something went wrong while reading that file. Try re-uploading it.",
      })
      .where(eq(userDocuments.id, document.id));
    throw error;
  }
}

async function runParser(type: DocumentType, text: string) {
  switch (type) {
    case "RESUME":
      return parseResume(text);
    case "EXAM_NOTIFICATION": {
      const parsed = parseNotificationDeterministic(text);
      return { ...parsed, provider: "rules" };
    }
    default: {
      // Nothing type-specific to extract; keep an excerpt and be honest.
      return {
        value: {
          summary: text.slice(0, 1200),
          note: "We stored this document but don't have a structured reader for this type yet.",
        },
        confidence: { summary: 0.3 },
        provider: "rules",
      };
    }
  }
}

/**
 * The confirmation step.
 *
 * Extracted skills reach the profile only when the user accepts them, and are
 * marked `ai_extracted` so their origin stays visible afterwards. Nothing is
 * written to the profile before this call.
 */
export async function confirmExtraction(input: {
  userId: string;
  documentId: string;
  acceptedSkills: string[];
}) {
  const { document } = await getDocument(input.documentId, input.userId);

  const names = [...new Set(input.acceptedSkills.map((skill) => skill.trim()).filter(Boolean))];
  if (names.length) {
    const slugs = names.map((name) => slugify(name));

    const existing = await db
      .select({ id: skillsTable.id, slug: skillsTable.slug })
      .from(skillsTable)
      .where(inArray(skillsTable.slug, slugs));

    const bySlug = new Map(existing.map((row) => [row.slug, row.id]));
    const missing = names.filter((name) => !bySlug.has(slugify(name)));

    if (missing.length) {
      const inserted = await db
        .insert(skillsTable)
        .values(missing.map((name) => ({ name, slug: slugify(name), category: "extracted" })))
        .onConflictDoNothing()
        .returning({ id: skillsTable.id, slug: skillsTable.slug });
      for (const row of inserted) bySlug.set(row.slug, row.id);
    }

    const values = names
      .map((name) => bySlug.get(slugify(name)))
      .filter((id): id is string => Boolean(id))
      .map((skillId) => ({
        userId: input.userId,
        skillId,
        proficiency: 3,
        source: "ai_extracted",
        confirmed: true,
      }));

    if (values.length) {
      await db.insert(userSkills).values(values).onConflictDoNothing();
    }
  }

  await db
    .update(documentExtractions)
    .set({ reviewedByUser: true })
    .where(eq(documentExtractions.documentId, input.documentId));

  await db
    .update(userDocuments)
    .set({ status: "CONFIRMED" })
    .where(eq(userDocuments.id, input.documentId));

  await recordAudit({
    actorType: "user",
    actorId: input.userId,
    action: "document.extraction_confirmed",
    entityType: "user_document",
    entityId: document.id,
    after: { skillsAccepted: names.length },
  });

  return { skillsAdded: names.length };
}

/**
 * Deletes a document and everything derived from it.
 *
 * The extraction row holds the parsed résumé — name, phone, employers,
 * education. A user who deletes a document is asking for that gone too, so the
 * child row is removed explicitly. (The schema declares no foreign keys, so
 * there is no ON DELETE CASCADE to rely on; keeping the deletes here means the
 * intent is visible at the call site rather than buried in DDL.)
 */
export async function deleteDocument(documentId: string, userId: string) {
  const { document } = await getDocument(documentId, userId);

  await getStore().remove(document.storageKey);
  await db.delete(documentExtractions).where(eq(documentExtractions.documentId, documentId));
  await db
    .update(jobApplications)
    .set({ resumeDocumentId: null })
    .where(eq(jobApplications.resumeDocumentId, documentId));
  await db.delete(userDocuments).where(eq(userDocuments.id, documentId));
  await recordAudit({
    actorType: "user",
    actorId: userId,
    action: "document.deleted",
    entityType: "user_document",
    entityId: documentId,
  });
}

export async function latestResume(userId: string) {
  const [row] = await db
    .select({
      document: userDocuments,
      extraction: documentExtractions,
    })
    .from(userDocuments)
    .leftJoin(documentExtractions, eq(documentExtractions.documentId, userDocuments.id))
    .where(eq(userDocuments.userId, userId))
    .orderBy(desc(userDocuments.uploadedAt))
    .limit(10);

  if (!row) return null;
  if (row.document.type !== "RESUME") {
    const resumes = await db
      .select({ document: userDocuments, extraction: documentExtractions })
      .from(userDocuments)
      .leftJoin(documentExtractions, eq(documentExtractions.documentId, userDocuments.id))
      .where(eq(userDocuments.userId, userId))
      .orderBy(desc(userDocuments.uploadedAt));
    const resume = resumes.find((entry) => entry.document.type === "RESUME");
    if (!resume) return null;
    return {
      document: resume.document,
      extracted: (resume.extraction?.extracted ?? null) as ExtractedResume | null,
    };
  }

  return {
    document: row.document,
    extracted: (row.extraction?.extracted ?? null) as ExtractedResume | null,
  };
}
