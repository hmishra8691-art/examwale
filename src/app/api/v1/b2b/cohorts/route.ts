import { z } from "zod";
import { created, ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { ValidationError } from "@/modules/shared/errors";
import { createCohort, listCohorts } from "@/modules/b2b/service";

const createSchema = z.object({
  organisationId: z.string().min(1),
  name: z.string().trim().min(2).max(160),
  academicYear: z.string().trim().max(40).nullish(),
  description: z.string().trim().max(1000).nullish(),
});

export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organisationId = new URL(request.url).searchParams.get("organisationId");
  if (!organisationId) throw new ValidationError("An organisation is required.");
  return ok({ cohorts: await listCohorts(organisationId, session.sub) });
});

export const POST = route(async (request: Request) => {
  const session = await requireSession();
  consume(`cohort:create:${session.sub}`, 20, 24 * 60 * 60);

  const body = createSchema.parse(await readJson(request));
  const result = await createCohort({ userId: session.sub, ...body });

  return created({
    cohort: result.cohort,
    joinCode: result.joinCode,
    note: "Share this code with your students. It isn't shown again.",
  });
});
