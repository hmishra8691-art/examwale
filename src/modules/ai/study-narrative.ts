/**
 * Model commentary over a computed study plan.
 *
 * `exams/service.ts#buildStudyPlan` does the arithmetic: total hours, month
 * buckets, and a feasibility verdict that will tell someone their target date
 * does not work. Those numbers are the authority and this file cannot touch
 * them. It adds the thing arithmetic cannot produce — how to actually approach
 * *this* syllabus at *this* pace, and what usually goes wrong.
 *
 * The separation is not stylistic. Someone plans a year of their life around
 * the feasibility verdict. A model that could soften "HIGHLY_UNLIKELY" into
 * something encouraging would break the single most useful thing the planner
 * does, so it is never shown the opportunity: it receives the verdict as a
 * fixed input and is told to write *with* it.
 */
import type { Feasibility, StudyPlanShape } from "@/db/schema";
import { getProvider } from "@/modules/ai/provider";

const NARRATIVE_SCHEMA = {
  type: "object",
  properties: {
    approach: {
      type: "string",
      description: "One paragraph on how to approach this specific plan at this pace.",
    },
    months: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer", description: "Must match a month index in the plan." },
          focus: { type: "string", description: "What this month is really for, beyond the topic list." },
          watchFor: { type: "string", description: "The specific way this month goes wrong." },
        },
        required: ["index", "focus", "watchFor"],
      },
    },
    pitfalls: {
      type: "array",
      maxItems: 5,
      items: { type: "string" },
      description: "What derails candidates on this syllabus at this pace.",
    },
  },
  required: ["approach", "months", "pitfalls"],
} as const;

const VERDICT_INSTRUCTION: Record<Feasibility["verdict"], string> = {
  ACHIEVABLE:
    "The arithmetic says this fits with some slack. Do not turn that into complacency — say what the slack is for.",
  DIFFICULT:
    "The arithmetic says this fits with almost no margin. Write as though one bad fortnight breaks it, because it does.",
  NEEDS_ADJUSTMENT:
    "The arithmetic says this does not fit. Do not write around that. The approach paragraph should open with what has to change — later date, more hours, or fewer topics — before any month-by-month guidance.",
  HIGHLY_UNLIKELY:
    "The arithmetic says this is not achievable at this pace. Say so in the first sentence. Then give the version that would work. Do not offer encouragement in place of the correction; it would cost them the year.",
};

export async function addStudyNarrative(input: {
  plan: StudyPlanShape;
  feasibility: Feasibility;
  examName: string;
  hoursPerDay: number;
}): Promise<StudyPlanShape> {
  const provider = getProvider();
  if (!provider.isModelBacked) return input.plan;

  const monthBlock = input.plan.months
    .map((month) => `Month ${month.index} (${month.label}) — ${month.hours}h: ${month.topics.join("; ") || "no topics allocated"}`)
    .join("\n");

  const result = await provider.structured<NonNullable<StudyPlanShape["narrative"]>>({
    schemaName: "study_narrative",
    schema: NARRATIVE_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 2500,
    system: `You are writing guidance over an already-computed study plan for ${input.examName}.

The numbers below were calculated and are fixed. You cannot change them, argue with them, or imply a different conclusion.

Feasibility: ${input.feasibility.verdict}
${input.feasibility.note}

Required hours: about ${input.feasibility.impliedHoursPerWeek} per week.
Available hours: about ${input.feasibility.availableHoursPerWeek} per week (${input.hoursPerDay}/day).
Total: ${input.plan.totalHours} hours across ${input.plan.totalTopics} topics.

${VERDICT_INSTRUCTION[input.feasibility.verdict]}

The month allocation:
${monthBlock}

Rules:
- One entry per month above, using the same index numbers. Do not invent months.
- 'focus' is what the month is *for* — building a base, closing gaps, switching to volume practice. Not a restatement of the topic list.
- 'watchFor' is the specific failure mode of that month. Month one is usually over-planning; the middle months are usually silent drift; the last month is usually panic-starting new topics.
- Do not state exam dates, vacancy counts, cut-offs or fees. You do not have them.
- Never predict a result. Not a rank, not a selection, not a mark.
- Write to someone doing this alongside other obligations, not to a full-time aspirant, unless the hours say otherwise.`,
    messages: [
      {
        role: "user",
        content: `Write the approach, per-month guidance and pitfalls for this ${input.plan.months.length}-month plan.`,
      },
    ],
    fallback: () => ({ provider: "fallback", approach: "", months: [], pitfalls: [] }),
  });

  if (result.usedFallback || !result.value.approach) return input.plan;

  const valid = new Set(input.plan.months.map((month) => month.index));

  return {
    ...input.plan,
    narrative: {
      provider: result.provider,
      approach: result.value.approach,
      // A month index the plan doesn't have would render as orphaned advice.
      months: (result.value.months ?? []).filter((entry) => valid.has(entry.index)),
      pitfalls: (result.value.pitfalls ?? []).slice(0, 5),
    },
  };
}
