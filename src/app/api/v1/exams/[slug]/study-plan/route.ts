import { z } from "zod";
import { db } from "@/db/client";
import { studyPlans } from "@/db/schema";
import { clientIp, ok, readJson, route } from "@/modules/shared/http";
import { getSession } from "@/modules/auth/session";
import { consume, consumeByClient } from "@/modules/shared/rate-limit";
import { ValidationError } from "@/modules/shared/errors";
import { buildStudyPlan, getExamBySlug } from "@/modules/exams/service";
import { addStudyNarrative } from "@/modules/ai/study-narrative";
import { assertWithinQuota, logUsage } from "@/modules/ai/usage";

const bodySchema = z.object({
  hoursPerDay: z.number().min(0.5).max(16),
  targetDate: z.string(),
  /**
   * Opt-in. The plan is complete without it, and a signed-out visitor or a
   * user at their daily limit still gets the full computed plan rather than an
   * error — the AI layer is an addition, never a gate.
   */
  withGuidance: z.boolean().optional().default(false),
});

type Context = { params: Promise<{ slug: string }> };

export const POST = route(async (request: Request, context: Context) => {
  const session = await getSession();
  if (session) consume(`study-plan:user:${session.sub}`, 30, 60 * 60);
  else consumeByClient("study-plan", clientIp(request), { perIp: 30, globalFallback: 2000 }, 60 * 60);

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

  // The narrative is best-effort by construction. If the quota is spent or the
  // provider fails, the user gets the computed plan — which is the part that
  // matters — rather than a failed request.
  let plan = computed;
  let guidanceNote: string | null = null;

  if (body.withGuidance && session) {
    try {
      await assertWithinQuota(session.sub, session.plan);
      const started = Date.now();
      plan = await addStudyNarrative({
        plan: computed,
        feasibility,
        examName: exam.exam.shortName ?? exam.exam.name,
        hoursPerDay: body.hoursPerDay,
      });
      if (plan.narrative) {
        await logUsage({
          userId: session.sub,
          mode: "EXAM",
          provider: plan.narrative.provider,
          latencyMs: Date.now() - started,
        });
      } else {
        guidanceNote =
          "Written guidance isn't available on this deployment — no language-model key is configured. The plan and the feasibility check below are computed and complete.";
      }
    } catch (error) {
      console.error("[study-plan] guidance skipped", error);
      guidanceNote = "Written guidance couldn't be generated this time. The computed plan below is unaffected.";
    }
  } else if (body.withGuidance && !session) {
    guidanceNote = "Sign in to add written guidance. The computed plan below doesn't need an account.";
  }

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
