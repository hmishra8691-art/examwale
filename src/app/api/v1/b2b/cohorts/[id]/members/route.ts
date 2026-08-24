import { z } from "zod";
import { ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { inviteToCohort, listCohortMembers, removeCohortMember } from "@/modules/b2b/service";

const inviteSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(200),
});

const removeSchema = z.object({ memberId: z.string().min(1) });

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, context: Context) => {
  const session = await requireSession();
  const { id } = await context.params;
  return ok({ members: await listCohortMembers(id, session.sub) });
});

export const POST = route(async (request: Request, context: Context) => {
  const session = await requireSession();
  consume(`cohort:invite:${session.sub}`, 40, 24 * 60 * 60);

  const { id } = await context.params;
  const body = inviteSchema.parse(await readJson(request));
  const result = await inviteToCohort({ cohortId: id, userId: session.sub, emails: body.emails });

  return ok({
    ...result,
    note: "Invitations recorded. Nobody counts towards your figures until they accept.",
  });
});

export const DELETE = route(async (request: Request, context: Context) => {
  const session = await requireSession();
  const { id } = await context.params;
  const body = removeSchema.parse(await readJson(request));
  await removeCohortMember({ cohortId: id, memberId: body.memberId, userId: session.sub });
  return ok({ removed: true });
});
