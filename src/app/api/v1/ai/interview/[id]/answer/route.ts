import { z } from "zod";
import { ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { ValidationError } from "@/modules/shared/errors";
import { assertWithinQuota, logUsage } from "@/modules/ai/usage";
import {
  getSessionForUser,
  gradeAnswer,
  listAnswers,
  saveAnswer,
} from "@/modules/ai/interview";

const bodySchema = z.object({
  questionIndex: z.number().int().min(0).max(20),
  answer: z.string().min(1).max(8000),
});

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, context: Context) => {
  const session = await requireSession();
  const { id } = await context.params;
  // Ownership is asserted before any answer is read.
  const practice = await getSessionForUser(id, session.sub);
  return ok({ session: practice, answers: await listAnswers(id) });
});

export const POST = route(async (request: Request, context: Context) => {
  const session = await requireSession();
  await consume(`interview-answer:${session.sub}`, 60, 60 * 60);
  await assertWithinQuota(session.sub, session.plan);

  const { id } = await context.params;
  const body = bodySchema.parse(await readJson(request));
  const practice = await getSessionForUser(id, session.sub);

  const question = practice.questions[body.questionIndex];
  if (!question) throw new ValidationError("That question isn't part of this practice session.");

  const started = Date.now();
  const { feedback, provider } = await gradeAnswer({
    question,
    answer: body.answer,
    targetLabel: practice.targetLabel,
  });

  const [saved] = await Promise.all([
    saveAnswer({
      sessionId: id,
      userId: session.sub,
      questionIndex: body.questionIndex,
      answer: body.answer,
      feedback,
      provider,
    }),
    logUsage({
      userId: session.sub,
      mode: "INTERVIEW",
      provider,
      latencyMs: Date.now() - started,
    }),
  ]);

  return ok({ id: saved?.id ?? null, feedback, provider });
});
