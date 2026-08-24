/**
 * The publish gate.
 *
 * A career, exam or scheme record that people make decisions on must not go
 * live without a source and a verification event behind it. That rule is
 * enforced here — one function every publish path must go through — rather
 * than as a note in a style guide that a rushed release ignores.
 */
import { and, desc, eq, gt, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  careerProfiles,
  examEditions,
  exams,
  scholarships,
  sources,
  verificationRecords,
} from "@/db/schema";
import { AppError, NotFoundError } from "@/modules/shared/errors";
import { recordAudit } from "@/modules/shared/audit";

export type PublishableEntity = "career" | "exam" | "exam_edition" | "scholarship";

const TABLES = {
  career: careerProfiles,
  exam: exams,
  exam_edition: examEditions,
  scholarship: scholarships,
} as const;

/** Entities whose facts expire and therefore need a live verification record. */
const REQUIRES_VERIFICATION: PublishableEntity[] = ["exam", "exam_edition", "scholarship", "career"];

export async function assertPublishable(
  entityType: PublishableEntity,
  entityId: string,
): Promise<{ ok: true } | never> {
  const table = TABLES[entityType];
  const [row] = await db.select().from(table).where(eq(table.id, entityId)).limit(1);
  if (!row) throw new NotFoundError("That record doesn't exist.");

  const record = row as { sourceId: string | null };

  if (REQUIRES_VERIFICATION.includes(entityType)) {
    if (!record.sourceId) {
      throw new AppError(
        "This record needs a source before it can be published. Add where the information came from.",
        422,
        "missing_source",
      );
    }

    const [verification] = await db
      .select()
      .from(verificationRecords)
      .where(
        and(
          eq(verificationRecords.entityType, entityType),
          eq(verificationRecords.entityId, entityId),
          eq(verificationRecords.status, "VERIFIED"),
          or(isNull(verificationRecords.expiresAt), gt(verificationRecords.expiresAt, new Date()))!,
        ),
      )
      .orderBy(desc(verificationRecords.verifiedAt))
      .limit(1);

    if (!verification) {
      throw new AppError(
        "This record has no current verification. Check it against the source and record the verification before publishing.",
        422,
        "missing_verification",
      );
    }
  }

  return { ok: true };
}

export async function publish(input: {
  entityType: PublishableEntity;
  entityId: string;
  adminId: string;
}) {
  await assertPublishable(input.entityType, input.entityId);
  const table = TABLES[input.entityType];

  const [before] = await db.select().from(table).where(eq(table.id, input.entityId)).limit(1);

  await db
    .update(table)
    .set({ status: "PUBLISHED", lastVerifiedAt: new Date() } as never)
    .where(eq(table.id, input.entityId));

  await recordAudit({
    actorType: "admin",
    actorId: input.adminId,
    action: `${input.entityType}.published`,
    entityType: input.entityType,
    entityId: input.entityId,
    before: { status: (before as { status: string }).status },
    after: { status: "PUBLISHED" },
  });
}

export async function unpublish(input: {
  entityType: PublishableEntity;
  entityId: string;
  adminId: string;
  reason?: string;
}) {
  const table = TABLES[input.entityType];
  await db
    .update(table)
    .set({ status: "NEEDS_REVIEW" } as never)
    .where(eq(table.id, input.entityId));

  await recordAudit({
    actorType: "admin",
    actorId: input.adminId,
    action: `${input.entityType}.unpublished`,
    entityType: input.entityType,
    entityId: input.entityId,
    after: { status: "NEEDS_REVIEW", reason: input.reason },
  });
}

export async function recordVerification(input: {
  entityType: PublishableEntity;
  entityId: string;
  sourceId: string;
  adminId: string;
  validForDays?: number;
  note?: string;
}) {
  const source = await db.query.sources.findFirst({ where: eq(sources.id, input.sourceId) });
  if (!source) throw new NotFoundError("That source doesn't exist.");

  const expiresAt = input.validForDays
    ? new Date(Date.now() + input.validForDays * 86_400_000)
    : null;

  await db.insert(verificationRecords).values({
    entityType: input.entityType,
    entityId: input.entityId,
    sourceId: input.sourceId,
    verifiedById: input.adminId,
    expiresAt,
    note: input.note ?? null,
  });

  const table = TABLES[input.entityType];
  await db
    .update(table)
    .set({ sourceId: input.sourceId, lastVerifiedAt: new Date() } as never)
    .where(eq(table.id, input.entityId));

  await recordAudit({
    actorType: "admin",
    actorId: input.adminId,
    action: `${input.entityType}.verified`,
    entityType: input.entityType,
    entityId: input.entityId,
    after: { sourceId: input.sourceId, expiresAt },
  });
}

/**
 * Records whose verification has lapsed. Nothing is deleted — a stale record
 * is hidden from "current" views and queued for a human to re-check.
 */
export async function findStaleRecords() {
  const now = new Date();
  const stale = await db
    .select({
      entityType: verificationRecords.entityType,
      entityId: verificationRecords.entityId,
      expiresAt: verificationRecords.expiresAt,
      sourceName: sources.name,
      sourceUrl: sources.url,
    })
    .from(verificationRecords)
    .innerJoin(sources, eq(verificationRecords.sourceId, sources.id))
    .where(and(eq(verificationRecords.status, "VERIFIED"), lt(verificationRecords.expiresAt, now)))
    .limit(100);

  return stale;
}
