import { z } from "zod";
import { ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { ValidationError } from "@/modules/shared/errors";
import { assertWithinQuota, logUsage } from "@/modules/ai/usage";
import { resolveTarget, reviewResumeText, saveReview } from "@/modules/ai/resume-review";
import { latestResume, readDocumentText } from "@/modules/documents/service";

const bodySchema = z
  .object({
    /** Paste path. */
    text: z.string().max(60_000).optional(),
    /** Stored-document path. */
    documentId: z.string().max(64).optional(),
    /** Career profile slug to score relevance against. */
    targetSlug: z.string().max(160).nullable().optional(),
  })
  .refine((value) => Boolean(value.text?.trim() || value.documentId), {
    message: "Paste your résumé or pick one you've already uploaded.",
  });

export const POST = route(async (request: Request) => {
  const session = await requireSession();
  consume(`resume-review:${session.sub}`, 12, 60 * 60);
  await assertWithinQuota(session.sub, session.plan);

  const body = bodySchema.parse(await readJson(request));

  // A document id is resolved through the ownership-checked service; the
  // client never gets to name a file it doesn't own.
  let text = body.text?.trim() ?? "";
  let documentId: string | null = null;

  if (body.documentId) {
    const stored = await readDocumentText(body.documentId, session.sub);
    documentId = body.documentId;
    text = stored.text.trim();
    if (!text) {
      throw new ValidationError(
        "We couldn't read any text out of that file. If it's a scanned image, paste the text instead.",
      );
    }
  }

  if (text.length < 120) {
    throw new ValidationError(
      "That's too short to review usefully — paste the whole résumé, not a summary of it.",
    );
  }

  const target = await resolveTarget(body.targetSlug ?? null);
  const started = Date.now();
  const { review, provider } = await reviewResumeText({ text, target });

  const [saved] = await Promise.all([
    saveReview({ userId: session.sub, documentId, target, review, provider }),
    logUsage({
      userId: session.sub,
      mode: "RESUME",
      provider,
      latencyMs: Date.now() - started,
    }),
  ]);

  return ok({
    id: saved?.id ?? null,
    review,
    provider,
    target: { kind: target.kind, slug: target.slug, label: target.label },
  });
});

/** Convenience for the page: which résumé would we review if you said go? */
export const GET = route(async () => {
  const session = await requireSession();
  const resume = await latestResume(session.sub);
  return ok({
    document: resume
      ? {
          id: resume.document.id,
          filename: resume.document.originalName,
          uploadedAt: resume.document.uploadedAt,
        }
      : null,
  });
});
