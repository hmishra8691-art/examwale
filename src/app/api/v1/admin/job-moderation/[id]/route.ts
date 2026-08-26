/**
 * Moderator decisions on one posting.
 *
 * Six actions on one endpoint rather than a route each: every one is "check the
 * caller may moderate, then ask the lifecycle module", and which transitions are
 * legal belongs in that module rather than spread across route files.
 *
 * Moderator *or* admin. Reviewing a posting should not require the ability to
 * edit country coverage, which is why MODERATOR exists as a role at all.
 *
 * `request_changes` is deliberately distinct from `reject`. The difference is the
 * whole point for the employer — one returns the posting to draft so they can
 * fix it and resubmit, the other closes it — and collapsing them into "rejected
 * with a note" makes them guess which they got.
 */
import { z } from "zod";
import { ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { ForbiddenError } from "@/modules/shared/errors";
import { consume } from "@/modules/shared/rate-limit";
import { approve, archive, refuse, startReview, suspend } from "@/modules/employers/lifecycle";

/*
 * The reason is required by the schema, not only by the service, and the message
 * says so in words the moderator can act on. Zod validates first, so a default
 * "Invalid input" here would hide the service's better wording — and this is a
 * field whose absence has a specific consequence: the employer receives a
 * decision they cannot do anything about.
 */
const reason = (verb: string) =>
  z
    .string({ message: `Say why. A ${verb} without a reason is not actionable.` })
    .trim()
    .min(5, `Say why. A ${verb} without a reason is not actionable.`)
    .max(2000);

const bodySchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("start_review") }),
  z.object({ decision: z.literal("approve"), note: z.string().trim().max(2000).optional() }),
  z.object({ decision: z.literal("request_changes"), reason: reason("change request") }),
  z.object({ decision: z.literal("reject"), reason: reason("refusal") }),
  z.object({ decision: z.literal("suspend"), reason: reason("suspension") }),
  z.object({ decision: z.literal("archive") }),
]);

type Context = { params: Promise<{ id: string }> };

export const POST = route(async (request: Request, context: Context) => {
  const session = await requireSession();
  if (!["MODERATOR", "ADMIN", "SUPER_ADMIN"].includes(session.role)) {
    throw new ForbiddenError("Moderator access is required.");
  }
  await consume(`admin:moderate:${session.sub}`, 300, 60 * 60);

  const { id } = await context.params;
  const body = bodySchema.parse(await readJson(request));

  switch (body.decision) {
    case "start_review":
      return ok(await startReview({ jobId: id, adminId: session.sub }));
    case "approve":
      return ok(await approve({ jobId: id, adminId: session.sub, note: body.note ?? null }));
    case "request_changes":
      return ok(
        await refuse({ jobId: id, adminId: session.sub, reason: body.reason, outcome: "DRAFT" }),
      );
    case "reject":
      return ok(
        await refuse({ jobId: id, adminId: session.sub, reason: body.reason, outcome: "REJECTED" }),
      );
    case "suspend":
      return ok(await suspend({ jobId: id, adminId: session.sub, reason: body.reason }));
    case "archive":
      return ok(await archive({ jobId: id, actorId: session.sub, actorType: "admin" }));
  }
});
