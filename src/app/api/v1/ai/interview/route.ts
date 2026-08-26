import { z } from "zod";
import { created, ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { assertWithinQuota, logUsage } from "@/modules/ai/usage";
import { generateInterview, listSessions, saveSession, INTERVIEW_ROUNDS } from "@/modules/ai/interview";

const roundSchema = z.enum(INTERVIEW_ROUNDS.map((entry) => entry.value) as [string, ...string[]]);

const bodySchema = z.object({
  targetSlug: z.string().max(160).nullable().optional(),
  targetLabel: z.string().max(120).optional(),
  round: roundSchema.default("MIXED"),
  count: z.number().int().min(3).max(10).default(6),
});

export const GET = route(async () => {
  const session = await requireSession();
  return ok({ sessions: await listSessions(session.sub) });
});

export const POST = route(async (request: Request) => {
  const session = await requireSession();
  await consume(`interview:${session.sub}`, 15, 60 * 60);
  await assertWithinQuota(session.sub, session.plan);

  const body = bodySchema.parse(await readJson(request));
  const started = Date.now();

  const generated = await generateInterview({
    targetSlug: body.targetSlug ?? null,
    targetLabel: body.targetLabel,
    round: body.round as "MIXED" | "HR" | "TECHNICAL" | "BEHAVIOURAL",
    count: body.count,
  });

  const [saved] = await Promise.all([
    saveSession({
      userId: session.sub,
      targetSlug: body.targetSlug ?? null,
      targetLabel: generated.label,
      round: body.round as "MIXED" | "HR" | "TECHNICAL" | "BEHAVIOURAL",
      questions: generated.questions,
      citations: generated.citations,
      provider: generated.provider,
    }),
    logUsage({
      userId: session.sub,
      mode: "INTERVIEW",
      provider: generated.provider,
      latencyMs: Date.now() - started,
    }),
  ]);

  return created({
    id: saved?.id ?? null,
    label: generated.label,
    round: body.round,
    questions: generated.questions,
    citations: generated.citations,
    provider: generated.provider,
    // Surfaced so the page can say plainly whether these questions were built
    // from a real guide or are the generic set.
    grounded: generated.grounded,
  });
});
