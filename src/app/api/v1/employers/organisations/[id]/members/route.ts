import { z } from "zod";
import { created, ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { inviteMember, listOrganisationMembers } from "@/modules/employers/service";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "recruiter"]).optional(),
});

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, context: Context) => {
  const session = await requireSession();
  const { id } = await context.params;
  return ok({ members: await listOrganisationMembers(id, session.sub) });
});

export const POST = route(async (request: Request, context: Context) => {
  const session = await requireSession();
  consume(`org:invite:${session.sub}`, 20, 24 * 60 * 60);

  const { id } = await context.params;
  const body = inviteSchema.parse(await readJson(request));

  const { invite, token } = await inviteMember({
    organisationId: id,
    userId: session.sub,
    email: body.email,
    role: body.role,
  });

  /**
   * The raw token is returned exactly once, here, because no mail provider is
   * wired up yet and the inviter otherwise has no way to pass it on. When one
   * is configured this should become a send, and the token should stop
   * crossing the API boundary at all.
   */
  return created({
    invite: { id: invite.id, email: invite.email, role: invite.role, expiresAt: invite.expiresAt },
    token,
    deliveryNote:
      "No email provider is configured, so pass this invitation link on yourself. It expires in 7 days.",
  });
});
