import { z } from "zod";
import { db } from "@/db/client";
import { assessments } from "@/db/schema";
import { ok, readJson, route } from "@/modules/shared/http";
import { getSession } from "@/modules/auth/session";
import { consume, consumeByClient } from "@/modules/shared/rate-limit";
import { clientIp } from "@/modules/shared/http";
import { scoreCareers } from "@/modules/recommendations/assessment";

const bodySchema = z.object({
  interests: z.array(z.string()).max(20).default([]),
  workStyle: z.enum(["hands_on", "analytical", "creative", "people", "organising"]).optional(),
  studyAppetite: z.enum(["short", "medium", "long"]).optional(),
  budget: z.number().int().min(0).max(100_000_000).nullable().optional(),
  incomePriority: z.enum(["stability", "balanced", "maximise"]).optional(),
  riskTolerance: z.enum(["low", "medium", "high"]).optional(),
  wantsRemote: z.boolean().optional(),
  wantsSelfEmployment: z.boolean().optional(),
  wantsGovernment: z.boolean().optional(),
  currentSkills: z.array(z.string()).max(80).optional(),
  yearsExperience: z.number().int().min(0).max(60).nullable().optional(),
});

/**
 * Open to signed-out visitors: the assessment is the product's front door, and
 * gating it behind signup would mean asking for an account before showing
 * anyone what the account is for. Results are only *saved* when signed in.
 */
export const POST = route(async (request: Request) => {
  const session = await getSession();
  // Signed-in users get a per-account limit; anonymous traffic falls back to
  // the per-IP / global pair so one visitor can't be blocked by another's use.
  if (session) consume(`assess:user:${session.sub}`, 20, 60 * 60);
  else consumeByClient("assess", clientIp(request), { perIp: 20, globalFallback: 2000 }, 60 * 60);

  const answers = bodySchema.parse(await readJson(request));
  const results = await scoreCareers(answers, { limit: 8 });

  if (session) {
    await db.insert(assessments).values({
      userId: session.sub,
      answers,
      results,
      method: "rules",
    });
  }

  return ok({ results, saved: Boolean(session) });
});
