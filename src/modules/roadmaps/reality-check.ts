/**
 * The Reality Check Engine.
 *
 * A typed function, not a chat prompt. Given a goal, a timeline and the hours a
 * person actually has, it compares those against the workload the career or
 * exam record says the path takes, and returns a verdict with the arithmetic
 * attached.
 *
 * The point is structural: because the verdict is computed rather than
 * generated, the product cannot drift into telling someone their impossible
 * plan is fine — regardless of how the prompt around it is edited later.
 */
import type { RealityCheck } from "@/db/schema";

export type RealityCheckInput = {
  goalLabel: string;
  /** Months the person is giving themselves. */
  timelineMonths: number;
  hoursPerDay: number;
  /** Typical months the path takes, from the career/exam record. */
  typicalMonthsMin: number | null;
  typicalMonthsMax?: number | null;
  /** Typical weekly commitment the path assumes (default: full-time study). */
  typicalHoursPerWeek?: number;
  currentLevel?: "none" | "beginner" | "intermediate" | "advanced";
  targetIncome?: number | null;
  realisticEntryIncomeMax?: number | null;
  currencyCode?: string;
  isRegulated?: boolean;
  requiresExam?: boolean;
};

const LEVEL_MULTIPLIER: Record<string, number> = {
  none: 1.0,
  beginner: 0.85,
  intermediate: 0.6,
  advanced: 0.4,
};

export function runRealityCheck(input: RealityCheckInput): RealityCheck {
  const reasoning: string[] = [];

  const typicalMonths = input.typicalMonthsMin ?? input.typicalMonthsMax ?? null;
  const typicalHoursPerWeek = input.typicalHoursPerWeek ?? 35;
  const multiplier = LEVEL_MULTIPLIER[input.currentLevel ?? "none"];

  const availableHoursPerWeek = Math.round(input.hoursPerDay * 7 * 10) / 10;

  let verdict: RealityCheck["verdict"] = "ACHIEVABLE";
  let impliedHoursPerWeek: number | undefined;

  if (typicalMonths != null) {
    const totalHoursNeeded = typicalMonths * 4.33 * typicalHoursPerWeek * multiplier;
    const weeksAvailable = Math.max(1, input.timelineMonths * 4.33);
    impliedHoursPerWeek = Math.round((totalHoursNeeded / weeksAvailable) * 10) / 10;

    const ratio = impliedHoursPerWeek / Math.max(0.5, availableHoursPerWeek);

    if (ratio <= 0.8) verdict = "ACHIEVABLE";
    else if (ratio <= 1.05) verdict = "DIFFICULT";
    else if (ratio <= 2) verdict = "NEEDS_ADJUSTMENT";
    else verdict = "HIGHLY_UNLIKELY";

    reasoning.push(
      `This path typically takes around ${formatMonths(typicalMonths)} at roughly ${typicalHoursPerWeek} hours a week — about ${Math.round(totalHoursNeeded).toLocaleString("en-IN")} hours of work in total${multiplier < 1 ? `, adjusted down for your existing background` : ""}.`,
    );
    reasoning.push(
      `Compressed into ${formatMonths(input.timelineMonths)}, that works out to roughly ${impliedHoursPerWeek} hours a week. You told us you have about ${availableHoursPerWeek}.`,
    );
  } else {
    verdict = "NEEDS_ADJUSTMENT";
    reasoning.push(
      "We don't have a reliable duration on record for this path, so we can't check your timeline against it. Treat any schedule you build here as provisional.",
    );
  }

  // A hard structural gate beats any amount of effort — surface it as such.
  if (input.requiresExam && input.timelineMonths < 6) {
    verdict = verdict === "ACHIEVABLE" ? "DIFFICULT" : verdict;
    reasoning.push(
      "This path runs through a competitive entrance exam held on a fixed calendar. Effort doesn't move the exam date — check when the next cycle actually falls before committing to this timeline.",
    );
  }

  if (input.isRegulated) {
    reasoning.push(
      "This is a regulated profession. Registration or licensing sits between qualifying and practising, and that step has its own timeline you don't control.",
    );
  }

  if (input.targetIncome != null && input.realisticEntryIncomeMax != null) {
    if (input.targetIncome > input.realisticEntryIncomeMax * 1.6) {
      verdict = verdict === "ACHIEVABLE" || verdict === "DIFFICULT" ? "NEEDS_ADJUSTMENT" : verdict;
      reasoning.push(
        `Your income target is well above what this field typically pays at entry level. That number is usually reached after several years, not on the first job. Planning for the entry range and treating the target as a 4–6 year goal is the version that holds up.`,
      );
    }
  }

  const headline = HEADLINES[verdict];
  const alternative = buildAlternative(verdict, input, impliedHoursPerWeek, availableHoursPerWeek);

  return {
    verdict,
    headline,
    reasoning,
    impliedHoursPerWeek,
    typicalHoursPerWeek: availableHoursPerWeek,
    alternative,
  };
}

const HEADLINES: Record<RealityCheck["verdict"], string> = {
  ACHIEVABLE: "This looks achievable at the pace you've described",
  DIFFICULT: "Possible, but with no room for a bad month",
  NEEDS_ADJUSTMENT: "The numbers don't work as stated — here's what to change",
  HIGHLY_UNLIKELY: "This isn't realistic on this timeline, and we won't pretend otherwise",
};

function buildAlternative(
  verdict: RealityCheck["verdict"],
  input: RealityCheckInput,
  implied: number | undefined,
  available: number,
): string | undefined {
  if (verdict === "ACHIEVABLE") {
    return "Build in a buffer anyway — most people lose two or three weeks a year to illness, family or work pressure, and a plan with zero slack becomes a plan you abandon.";
  }

  if (!implied) {
    return "Start with a shorter, verifiable milestone — one certification or one exam stage — and re-plan once you know your real pace.";
  }

  const neededMonths = Math.ceil((implied / Math.max(0.5, available)) * input.timelineMonths);
  const neededHoursPerDay = Math.round((implied / 7) * 10) / 10;

  const options = [
    `Extend the timeline to about ${formatMonths(neededMonths)} at your current ${input.hoursPerDay} hours a day.`,
    `Or raise your daily commitment to roughly ${neededHoursPerDay} hours to hold the original date.`,
  ];

  if (verdict === "HIGHLY_UNLIKELY") {
    options.push(
      "Or pick a nearer target first — an entry-level role or a single certification in the same field — and use it to fund and de-risk the longer path.",
    );
  }

  return options.join(" ");
}

function formatMonths(months: number): string {
  if (months < 12) return `${Math.round(months)} month${Math.round(months) === 1 ? "" : "s"}`;
  const years = months / 12;
  const rounded = Math.round(years * 10) / 10;
  return `${rounded} year${rounded === 1 ? "" : "s"}`;
}

export const VERDICT_TONE: Record<RealityCheck["verdict"], "good" | "warn" | "bad"> = {
  ACHIEVABLE: "good",
  DIFFICULT: "warn",
  NEEDS_ADJUSTMENT: "warn",
  HIGHLY_UNLIKELY: "bad",
};
