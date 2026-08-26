import { z } from "zod";
import { ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { ValidationError } from "@/modules/shared/errors";
import {
  getSessionForUser,
  gradeAnswer,
  listAnswers,
  saveAnswer,
} from "@/modules/guidance/interview";

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

  const { id } = await context.params;
  const body = bodySchema.parse(await readJson(request));
  const practice = await getSessionForUser(id, session.sub);

  const question = practice.questions[body.questionIndex];
  if (!question) throw new ValidationError("That question isn't part of this practice session.");

  const { feedback, provider } = gradeAnswer({
    question,
    answer: body.answer,
    targetLabel: practice.targetLabel,
  });

  const saved = await saveAnswer({
    sessionId: id,
    userId: session.sub,
    questionIndex: body.questionIndex,
    answer: body.answer,
    feedback,
    provider,
  });

  return ok({ id: saved?.id ?? null, feedback, provider });
});
