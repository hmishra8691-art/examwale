/** The inbox, and opening a conversation. */
import { z } from "zod";
import { created, ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { listConversations, openConversation } from "@/modules/messaging/service";

const bodySchema = z.object({
  withUserId: z.string().min(1).max(64),
  contextType: z.enum(["MENTORSHIP", "JOB_APPLICATION", "COURSE_ENQUIRY"]),
  contextId: z.string().min(1).max(64).nullish(),
});

export const GET = route(async () => {
  const session = await requireSession();
  return ok({ conversations: await listConversations(session.sub) });
});

export const POST = route(async (request: Request) => {
  const session = await requireSession();
  // Opening threads is cheap for the sender and costly for the recipient, so
  // the limit is on starts rather than on messages within an existing thread.
  await consume(`messaging:open:${session.sub}`, 30, 24 * 60 * 60);

  const body = bodySchema.parse(await readJson(request));
  const result = await openConversation({
    userId: session.sub,
    withUserId: body.withUserId,
    contextType: body.contextType,
    contextId: body.contextId ?? null,
  });
  return created(result);
});
