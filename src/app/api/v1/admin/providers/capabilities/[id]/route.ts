/**
 * Decide one capability application.
 *
 * Admin or moderator — this is the first endpoint that distinguishes them, and
 * the reason MODERATOR was added to the role enum: reviewing a provider
 * application should not require the ability to edit country coverage.
 */
import { z } from "zod";
import { ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { ForbiddenError } from "@/modules/shared/errors";
import { consume } from "@/modules/shared/rate-limit";
import { decideCapability } from "@/modules/providers/service";

const bodySchema = z.object({
  status: z.enum(["ACTIVE", "REJECTED", "SUSPENDED"]),
  note: z.string().trim().max(1000).optional().nullable(),
});

type Context = { params: Promise<{ id: string }> };

export const PATCH = route(async (request: Request, context: Context) => {
  const session = await requireSession();
  if (!["MODERATOR", "ADMIN", "SUPER_ADMIN"].includes(session.role)) {
    throw new ForbiddenError("Moderator access is required.");
  }
  await consume(`admin:capability:${session.sub}`, 200, 60 * 60);

  const { id } = await context.params;
  const body = bodySchema.parse(await readJson(request));

  const capability = await decideCapability({
    capabilityId: id,
    adminId: session.sub,
    status: body.status,
    note: body.note ?? null,
  });

  return ok({ capability });
});
