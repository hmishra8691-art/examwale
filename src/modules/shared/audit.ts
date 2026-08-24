import { db } from "@/db/client";
import { auditLogs } from "@/db/schema";

export type AuditInput = {
  actorType: "admin" | "system" | "user";
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
};

/**
 * Append-only record of who changed what. Never throws into the caller: an
 * audit failure must not roll back the action the user actually asked for,
 * but it must be visible in the logs.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: (input.before ?? null) as never,
      after: (input.after ?? null) as never,
      ip: input.ip ?? null,
    });
  } catch (error) {
    console.error("[audit] failed to write audit log", input.action, error);
  }
}
