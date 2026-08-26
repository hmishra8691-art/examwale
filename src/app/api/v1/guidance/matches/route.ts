import { z } from "zod";
import { ok, readJson, route } from "@/modules/shared/http";
import { getSession } from "@/modules/auth/session";
import { clientIp } from "@/modules/shared/http";
import { consume, consumeByClient } from "@/modules/shared/rate-limit";
import { guidedRecommendations, saveGuidance } from "@/modules/guidance/matches";

const bodySchema = z.object({
  interests: z.array(z.string().max(40)).max(20).default([]),
  workStyle: z.enum(["hands_on", "analytical", "creative", "people", "organising"]).optional(),
  environment: z.enum(["office", "field", "remote", "mixed"]).optional(),
  studyAppetite: z.enum(["short", "medium", "long"]).optional(),
  incomePriority: z.enum(["stability", "balanced", "maximise"]).optional(),
  riskTolerance: z.enum(["low", "medium", "high"]).optional(),
  budget: z.number().int().min(0).max(100_000_000).nullable().optional(),
  hoursPerDay: z.number().min(0).max(16).nullable().optional(),
  currentSkills: z.array(z.string().max(60)).max(80).optional(),
  educationLevel: z.string().max(80).nullable().optional(),
  yearsExperience: z.number().int().min(0).max(60).nullable().optional(),
  wantsRemote: z.boolean().optional(),
  wantsSelfEmployment: z.boolean().optional(),
  wantsGovernment: z.boolean().optional(),
  limit: z.number().int().min(3).max(12).default(8),
});

/**
 * Open to signed-out visitors, like the assessment it builds on. The written
 * explanations need a model call, so those are quota-checked for signed-in
 * users and simply absent for anonymous ones — the ranked shortlist itself is
 * deterministic and always returned.
 */
export const POST = route(async (request: Request) => {
  const session = await getSession();
  if (session) await consume(`recommend:${session.sub}`, 25, 60 * 60);
  else await consumeByClient("recommend", clientIp(request), { perIp: 20, globalFallback: 2000 }, 60 * 60);

  const { limit, ...answers } = bodySchema.parse(await readJson(request));

  // Anonymous callers get the rules-only shortlist. Spending model tokens on
  // traffic with no account, no profile and no way to save the result is the
  // wrong trade.
  let allowGuidance = false;
  if (session) {
    try {
          allowGuidance = true;
    } catch {
      allowGuidance = false;
    }
  }

  const result = await guidedRecommendations({
    userId: allowGuidance ? session!.sub : null,
    answers,
    limit,
  });

  const stripped = allowGuidance
    ? result
    : {
        ...result,
        recommendations: result.recommendations.map((entry) => ({
          ...entry,
          fit: null,
          against: null,
          firstStep: null,
        })),
        overview: null,
        rulesOnly: true,
      };

  if (session) {
    await saveGuidance({ userId: session.sub, answers, result: stripped });
  }

  return ok({ ...stripped, saved: Boolean(session) });
});
