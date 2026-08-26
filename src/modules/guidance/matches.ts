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
import { scoreCareers, type AssessmentAnswers } from "@/modules/recommendations/assessment";

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



const CAVEATS = [
  "Ranking uses what you have told the platform. It cannot see your marks, your family situation, or how much you would actually enjoy the work.",
  "Salary figures are researched planning ranges for the country you are browsing, not offers.",
  "A career that ranks low here is not closed to you. It means the answers you gave point elsewhere first.",
];

/**
 * Rank the careers that fit these answers.
 *
 * `scoreCareers` does the whole job: it scores every published career profile
 * against the answers and returns them ordered, each with the reasons it scored
 * for and the gaps it scored against.
 *
 * A model used to sit after this, allowed to reorder the shortlist within three
 * places and write a sentence about each pick. It could never add a career or
 * remove one — that constraint existed because, asked openly, a model names
 * occupations this platform has no guide, no verified pay range and no
 * eligibility route for, and the reader hits a dead end on the suggestion it
 * was most enthusiastic about.
 *
 * That layer is gone. The ordering is the rulebook's, the reasons are the
 * rulebook's, and the question the model was answering — "why this one, for
 * me?" — now goes to a mentor, who can ask about the things an assessment form
 * never captured.
 */
export async function guidedRecommendations(input: {
  userId: string | null;
  answers: AssessmentAnswers;
  limit?: number;
}): Promise<GuidanceResult> {
  const ranked = await scoreCareers(input.answers, { limit: input.limit ?? 8 });

  return {
    recommendations: ranked.map((entry) => ({
      ...entry,
      fit: null,
      against: null,
      firstStep: null,
      movedBy: 0,
    })),
    overview: null,
    provider: "rulebook",
    rulesOnly: true,
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
