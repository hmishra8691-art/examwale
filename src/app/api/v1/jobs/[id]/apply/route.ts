import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { jobPostings, skills as skillsTable, userProfiles, userSkills } from "@/db/schema";
import { created, ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { NotFoundError } from "@/modules/shared/errors";
import { applyToJob, isLiveJob, matchJob } from "@/modules/jobs/service";
import { latestResume } from "@/modules/documents/service";
import { recordAudit } from "@/modules/shared/audit";

const bodySchema = z.object({
  coverLetter: z.string().max(2000).optional(),
});

type Context = { params: Promise<{ id: string }> };

export const POST = route(async (request: Request, context: Context) => {
  const session = await requireSession();
  await consume(`apply:${session.sub}`, 30, 60 * 60);

  const { id } = await context.params;
  const body = bodySchema.parse(await readJson(request));

  const job = await db.query.jobPostings.findFirst({ where: eq(jobPostings.id, id) });
  // Status *and* expiry. The status check was here; the expiry check was not, so
  // a posting past its deadline kept accepting applications that no employer was
  // still reading.
  if (!job || !isLiveJob(job)) {
    throw new NotFoundError("That job isn't accepting applications.");
  }

  const [profile, skillRows, resume] = await Promise.all([
    db.query.userProfiles.findFirst({ where: eq(userProfiles.userId, session.sub) }),
    db
      .select({ name: skillsTable.name })
      .from(userSkills)
      .innerJoin(skillsTable, eq(userSkills.skillId, skillsTable.id))
      .where(eq(userSkills.userId, session.sub)),
    latestResume(session.sub),
  ]);

  const match = matchJob({
    userSkills: skillRows.map((row) => row.name),
    yearsExperience: profile?.yearsExperience ?? null,
    job: {
      skillsRequired: (job.skillsRequired ?? []) as string[],
      skillsPreferred: (job.skillsPreferred ?? []) as string[],
      experienceMinYears: job.experienceMinYears,
      experienceMaxYears: job.experienceMaxYears,
    },
  });

  const application = await applyToJob({
    userId: session.sub,
    jobPostingId: job.id,
    resumeDocumentId: resume?.document.id ?? null,
    coverLetter: body.coverLetter ?? null,
    match,
  });

  await recordAudit({
    actorType: "user",
    actorId: session.sub,
    action: "job.applied",
    entityType: "job_posting",
    entityId: job.id,
  });

  return created({ application, match });
});

export const GET = route(async (_request: Request, context: Context) => {
  const session = await requireSession();
  const { id } = await context.params;

  const existing = await db.query.jobApplications.findFirst({
    where: (table, { and, eq: equals }) =>
      and(equals(table.userId, session.sub), equals(table.jobPostingId, id)),
  });

  return ok({ applied: Boolean(existing), application: existing ?? null });
});
