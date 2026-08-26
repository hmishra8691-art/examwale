import { z } from "zod";
import { db } from "@/db/client";
import { studyPlans } from "@/db/schema";
import { clientIp, ok, readJson, route } from "@/modules/shared/http";
import { getSession } from "@/modules/auth/session";
import { consume, consumeByClient } from "@/modules/shared/rate-limit";
import { ValidationError } from "@/modules/shared/errors";
import { buildStudyPlan, getExamBySlug } from "@/modules/exams/service";

const bodySchema = z.object({
  hoursPerDay: z.number().min(0.5).max(16),
  targetDate: z.string(),
  /**
   * Accepted and ignored.
   *
   * This used to add a written narrative around the computed plan. The plan was
   * always the real output and the prose was always an addition; the addition
   * is gone. The field stays so that a client still sending it gets its plan
   * rather than a validation error — the flag can be dropped once nothing sends
   * it.
   */
  withGuidance: z.boolean().optional().default(false),
});

type Context = { params: Promise<{ slug: string }> };

export const POST = route(async (request: Request, context: Context) => {
  const session = await getSession();
  if (session) await consume(`study-plan:user:${session.sub}`, 30, 60 * 60);
  else await consumeByClient("study-plan", clientIp(request), { perIp: 30, globalFallback: 2000 }, 60 * 60);

  const { slug } = await context.params;
  const body = bodySchema.parse(await readJson(request));

  const targetDate = new Date(body.targetDate);
  if (Number.isNaN(targetDate.getTime())) {
    throw new ValidationError("That target date isn't valid.");
  }
  if (targetDate.getTime() <= Date.now()) {
    throw new ValidationError("Pick a target date in the future.");
  }
  // Bounded because the planner allocates one bucket per month: an absurd date
  // would otherwise build millions of objects on the request thread.
  const MAX_HORIZON_MS = 10 * 365 * 86_400_000;
  if (targetDate.getTime() - Date.now() > MAX_HORIZON_MS) {
    throw new ValidationError(
      "Pick a target date within the next ten years — beyond that a study plan isn't meaningful.",
    );
  }

  const exam = await getExamBySlug(slug);
  if (!exam.topics.length) {
    throw new ValidationError(
      "We don't have a syllabus breakdown for this exam yet, so we can't build a workload estimate.",
    );
  }

  const { plan: computed, feasibility } = buildStudyPlan({
    topics: exam.topics.map((topic) => ({
      subject: topic.subject,
      topic: topic.topic,
      weightEstimate: topic.weightEstimate,
    })),
    hoursPerDay: body.hoursPerDay,
    targetDate,
  });

  const plan = computed;
  const guidanceNote = body.withGuidance
    ? "The written commentary that used to accompany this plan has been removed. The schedule and the feasibility check below are computed from the syllabus and are the part that mattered."
    : null;

  if (session) {
    await db.insert(studyPlans).values({
      userId: session.sub,
      examId: exam.exam.id,
      hoursPerDay: body.hoursPerDay,
      targetDate,
      plan,
      feasibility,
    });
  }

  return ok({ plan, feasibility, saved: Boolean(session), guidanceNote });
});
