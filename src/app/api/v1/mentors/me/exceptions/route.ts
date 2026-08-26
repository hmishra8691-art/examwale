/** Dated departures from a mentor's weekly pattern. */
import { z } from "zod";
import { created, ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { NotFoundError } from "@/modules/shared/errors";
import { consume } from "@/modules/shared/rate-limit";
import {
  addAvailabilityException,
  getMentorForUser,
  listAvailabilityExceptions,
} from "@/modules/mentors/service";

const bodySchema = z.object({
  kind: z.enum(["UNAVAILABLE", "EXTRA"]),
  onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date in YYYY-MM-DD form."),
  startMinute: z.number().int().min(0).max(1440).nullish(),
  endMinute: z.number().int().min(0).max(1440).nullish(),
  note: z.string().trim().max(200).nullish(),
});

export const GET = route(async () => {
  const session = await requireSession();
  const mentor = await getMentorForUser(session.sub);
  if (!mentor) throw new NotFoundError("You haven't applied to be a mentor yet.");
  return ok({ exceptions: await listAvailabilityExceptions(mentor.id) });
});

export const POST = route(async (request: Request) => {
  const session = await requireSession();
  await consume(`mentor:exception:${session.sub}`, 100, 24 * 60 * 60);
  const body = bodySchema.parse(await readJson(request));
  return created({ exception: await addAvailabilityException({ userId: session.sub, ...body }) });
});
