/**
 * Personalised recommendations.
 *
 * The shortlist is produced by `recommendations/assessment.ts` — a scored,
 * auditable pass over real career rows. This module does not replace it and
 * cannot add to it. The model receives the shortlist and is allowed exactly
 * two things: to reorder the candidates within it, and to explain each one
 * against what the platform knows about this user.
 *
 * That boundary is the whole design. A model asked "what career suits this
 * person" will happily name occupations with no guide, no salary data and no
 * verified eligibility route — and the user then hits a dead end on a
 * recommendation the product cannot actually support. Restricting it to rows
 * that exist means every recommendation is clickable.
 *
 * Reordering is capped so the model cannot promote a candidate the rules
 * ranked eighth to the top: it can adjust, not overrule.
 */
import { db } from "@/db/client";
import { assessments, type AssessmentResult } from "@/db/schema";
import { getProvider } from "@/modules/ai/provider";
import { loadProfileContext } from "@/modules/ai/context";
import { renderProfile } from "@/modules/ai/prompts";
import { scoreCareers, type AssessmentAnswers } from "@/modules/recommendations/assessment";
import { formatMoneyRange } from "@/modules/shared/format";

export type GuidedRecommendation = AssessmentResult & {
  /** Why this fits *this* person. Null when running without a model. */
  fit: string | null;
  /** The honest reason it might not. Null when running without a model. */
  against: string | null;
  /** One thing to do this week. */
  firstStep: string | null;
  /** How far the model moved it, for transparency in the UI. */
  movedBy: number;
};

export type GuidanceResult = {
  recommendations: GuidedRecommendation[];
  /** Model-written framing of the shortlist as a whole. */
  overview: string | null;
  provider: string;
  /** True when the ordering is purely the rulebook's. */
  rulesOnly: boolean;
  /** What the ranking could not take into account. */
  caveats: string[];
};

const MAX_MOVE = 3;

const GUIDANCE_SCHEMA = {
  type: "object",
  properties: {
    overview: {
      type: "string",
      description: "Two or three sentences on what this shortlist has in common and what the real decision is.",
    },
    picks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          careerSlug: { type: "string", description: "Must be one of the slugs supplied." },
          rank: { type: "integer", description: "1 is best. Every supplied slug must appear exactly once." },
          fit: { type: "string", description: "Why this suits this specific person, citing what they told us." },
          against: { type: "string", description: "The honest reason it might not suit them." },
          firstStep: { type: "string", description: "One concrete thing to do this week." },
        },
        required: ["careerSlug", "rank", "fit", "against", "firstStep"],
      },
    },
  },
  required: ["overview", "picks"],
} as const;

const CAVEATS = [
  "Ranking uses what you have told the platform. It cannot see your marks, your family situation, or how much you would actually enjoy the work.",
  "Salary figures are researched planning ranges for the country you are browsing, not offers.",
  "A career that ranks low here is not closed to you. It means the answers you gave point elsewhere first.",
];

export async function guidedRecommendations(input: {
  userId: string | null;
  answers: AssessmentAnswers;
  limit?: number;
}): Promise<GuidanceResult> {
  const limit = input.limit ?? 8;
  const ranked = await scoreCareers(input.answers, { limit });
  const provider = getProvider();

  const base: GuidedRecommendation[] = ranked.map((entry) => ({
    ...entry,
    fit: null,
    against: null,
    firstStep: null,
    movedBy: 0,
  }));

  if (!provider.isModelBacked || ranked.length < 2) {
    return {
      recommendations: base,
      overview: null,
      provider: provider.name,
      rulesOnly: true,
      caveats: [
        ...CAVEATS,
        "This deployment is running without a language-model key, so this ordering is the rulebook's and carries no written explanation.",
      ],
    };
  }

  const profile = await loadProfileContext(input.userId);

  const candidateBlock = ranked
    .map((entry, index) => {
      const pay = formatMoneyRange(entry.salaryEntryMin, entry.salaryEntryMax, entry.currencyCode);
      return [
        `[${index + 1}] ${entry.name} (slug: ${entry.careerSlug}, group: ${entry.groupName})`,
        `    rule score: ${entry.score}`,
        `    entry pay: ${pay}`,
        entry.reasons.length ? `    scored for: ${entry.reasons.join("; ")}` : "",
        entry.gaps.length ? `    scored against: ${entry.gaps.join("; ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const result = await provider.structured<{
    overview: string;
    picks: { careerSlug: string; rank: number; fit: string; against: string; firstStep: string }[];
  }>({
    schemaName: "guide_recommendations",
    schema: GUIDANCE_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 3000,
    system: `You are explaining a career shortlist for ExamWale.

A deterministic scorer has already produced this shortlist from the platform's career database. You may reorder it and you must explain it. You may NOT add a career that is not listed, remove one that is, or invent facts about any of them.

<user_profile>
${renderProfile(profile)}
</user_profile>

<their_answers>
${JSON.stringify(input.answers, null, 2)}
</their_answers>

<candidates>
${candidateBlock}
</candidates>

Rules:
- Every candidate slug above must appear exactly once in 'picks', with ranks 1..${ranked.length}.
- Reorder only where you have a reason from what the user told you. Small adjustments; the scorer saw the underlying data and you did not.
- 'fit' must cite something specific the user said — their budget, their hours, their stated goal, their experience. A sentence that would apply to anyone is a wasted sentence.
- 'against' is required and must be real. Every one of these has a downside for this person: cost, competition, time, location, a skill they do not have. If you cannot find one, you have not thought about it.
- 'firstStep' is something doable this week for free or nearly free. Not "research the field".
- Do not state salary, cost or eligibility figures beyond what is listed above.
- Never say they will succeed at any of these.`,
    messages: [
      {
        role: "user",
        content: `Rank and explain these ${ranked.length} careers for this person.`,
      },
    ],
    fallback: () => ({ overview: "", picks: [] }),
  });

  if (result.usedFallback || !result.value.picks?.length) {
    return { recommendations: base, overview: null, provider: result.provider, rulesOnly: true, caveats: CAVEATS };
  }

  const bySlug = new Map(ranked.map((entry, index) => [entry.careerSlug, index]));
  const seen = new Set<string>();
  const picked: GuidedRecommendation[] = [];

  for (const pick of [...result.value.picks].sort((a, b) => a.rank - b.rank)) {
    const originalIndex = bySlug.get(pick.careerSlug);
    // A slug the model invented, or repeated, is dropped rather than surfaced.
    if (originalIndex === undefined || seen.has(pick.careerSlug)) continue;
    seen.add(pick.careerSlug);
    picked.push({
      ...ranked[originalIndex],
      fit: pick.fit,
      against: pick.against,
      firstStep: pick.firstStep,
      movedBy: originalIndex - picked.length,
    });
  }

  // Anything the model failed to mention keeps its rule position at the end,
  // so a dropped candidate is never silently lost from the shortlist.
  for (const [slug, index] of bySlug) {
    if (seen.has(slug)) continue;
    picked.push({ ...ranked[index], fit: null, against: null, firstStep: null, movedBy: 0 });
  }

  // Clamp: a candidate cannot climb more than MAX_MOVE places past the rules.
  const clamped = picked
    .map((entry, position) => ({ entry, position, origin: bySlug.get(entry.careerSlug) ?? position }))
    .sort((a, b) => {
      const aPos = Math.abs(a.position - a.origin) > MAX_MOVE
        ? a.origin + Math.sign(a.position - a.origin) * MAX_MOVE
        : a.position;
      const bPos = Math.abs(b.position - b.origin) > MAX_MOVE
        ? b.origin + Math.sign(b.position - b.origin) * MAX_MOVE
        : b.position;
      return aPos - bPos;
    })
    .map(({ entry, origin }, finalPosition) => ({ ...entry, movedBy: origin - finalPosition }));

  return {
    recommendations: clamped,
    overview: result.value.overview || null,
    provider: result.provider,
    rulesOnly: false,
    caveats: CAVEATS,
  };
}

export async function saveGuidance(input: {
  userId: string;
  answers: AssessmentAnswers;
  result: GuidanceResult;
}) {
  await db.insert(assessments).values({
    userId: input.userId,
    answers: input.answers,
    results: input.result.recommendations,
    method: input.result.rulesOnly ? "rules" : `rules+${input.result.provider}`,
  });
}
