/**
 * Employer-side lifecycle actions on one posting.
 *
 * One endpoint taking an action name rather than four near-identical routes:
 * every one of these is "check you own it, then ask the lifecycle module", and
 * the interesting logic — which transitions are legal, what happens to the
 * publication period — belongs in that module rather than spread across route
 * files.
 *
 * Moderator actions are deliberately not here. Suspending and approving are not
 * things an employer may do to their own posting, so they live behind the admin
 * gate instead of behind a branch in this handler.
 */
import { z } from "zod";
import { ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import {
  archiveJobPosting,
  closeJobPosting,
  restoreJobPosting,
  reviveJobPosting,
} from "@/modules/employers/service";

const bodySchema = z.object({
  action: z.enum(["close", "revive", "archive", "restore"]),
});

type Context = { params: Promise<{ id: string }> };

export const POST = route(async (request: Request, context: Context) => {
  const session = await requireSession();
  // Reviving republishes to the public board, so the limit is tighter than an
  // edit's — this is the action that could be used to keep bumping a posting.
  await consume(`job:lifecycle:${session.sub}`, 60, 60 * 60);

  const { id } = await context.params;
  const { action } = bodySchema.parse(await readJson(request));

  switch (action) {
    case "close":
      return ok(await closeJobPosting(id, session.sub));
    case "revive":
      return ok(await reviveJobPosting(id, session.sub));
    case "archive":
      return ok(await archiveJobPosting(id, session.sub));
    case "restore":
      return ok(await restoreJobPosting(id, session.sub));
  }
});
