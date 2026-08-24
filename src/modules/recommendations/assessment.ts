/**
 * Career suitability scoring.
 *
 * This is a transparent weighted model over the user's stated situation and the
 * career records — not a psychometric instrument. Every point it awards can be
 * traced to a rule below, and every recommendation ships with the reasons that
 * produced it, because a number a user can't interrogate is worse than no
 * number at all.
 *
 * The score answers "how well does this fit what you told us", not "how likely
 * are you to succeed". The UI must never imply otherwise.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  careerProfiles,
  countries,
  occupationGroups,
  occupationSkills,
  occupations,
  skills,
  type AssessmentResult,
} from "@/db/schema";
import { getCountryIso } from "@/modules/geo/service";

export type AssessmentAnswers = {
  interests: string[];
  workStyle?: "hands_on" | "analytical" | "creative" | "people" | "organising";
  environment?: "office" | "field" | "remote" | "mixed";
  riskTolerance?: "low" | "medium" | "high";
  incomePriority?: "stability" | "balanced" | "maximise";
  studyAppetite?: "short" | "medium" | "long";
  budget?: number | null;
  hoursPerDay?: number | null;
  currentSkills?: string[];
  educationLevel?: string | null;
  wantsSelfEmployment?: boolean;
  wantsRemote?: boolean;
  wantsGovernment?: boolean;
  yearsExperience?: number | null;
};

/** Interest tags map onto occupation groups; a career in a matching group scores. */
const INTEREST_TO_GROUP: Record<string, string[]> = {
  technology: ["technology"],
  ai: ["technology"],
  engineering: ["engineering"],
  medicine: ["healthcare"],
  healthcare: ["healthcare"],
  science: ["healthcare", "engineering"],
  business: ["business", "finance"],
  finance: ["finance"],
  law: ["legal"],
  government: ["government"],
  defence: ["government"],
  design: ["design"],
  creative: ["design"],
  education: ["education"],
  logistics: ["logistics"],
  trades: ["skilled-trades"],
  skilled_trades: ["skilled-trades"],
};

const WORK_STYLE_GROUPS: Record<string, string[]> = {
  hands_on: ["skilled-trades", "engineering", "healthcare"],
  analytical: ["technology", "finance", "engineering"],
  creative: ["design", "technology"],
  people: ["education", "healthcare", "business"],
  organising: ["logistics", "business", "government"],
};

const STUDY_APPETITE_MONTHS: Record<string, number> = {
  short: 18,
  medium: 48,
  long: 96,
};

type ScoringRow = {
  slug: string;
  name: string;
  groupSlug: string;
  groupName: string;
  summary: string;
  costMin: number | null;
  costMax: number | null;
  timeMin: number | null;
  timeMax: number | null;
  salaryEntryMin: number | null;
  salaryEntryMax: number | null;
  salarySeniorMax: number | null;
  currencyCode: string;
  demand: string;
  competition: string;
  difficulty: string;
  remote: boolean;
  selfEmployment: boolean;
  isRegulated: boolean;
  requiredSkills: string[];
};

const LEVEL_SCORE: Record<string, number> = {
  VERY_LOW: 0, LOW: 1, MEDIUM: 2, HIGH: 3, VERY_HIGH: 4,
};

export async function scoreCareers(
  answers: AssessmentAnswers,
  options: { countryIso?: string; limit?: number } = {},
): Promise<AssessmentResult[]> {
  const countryIso = options.countryIso ?? (await getCountryIso());
  const limit = options.limit ?? 8;

  const rows = await db
    .select({
      slug: careerProfiles.slug,
      name: occupations.name,
      occupationId: occupations.id,
      groupSlug: occupationGroups.slug,
      groupName: occupationGroups.name,
      summary: careerProfiles.summary,
      costMin: careerProfiles.costMin,
      costMax: careerProfiles.costMax,
      timeMin: careerProfiles.timeRequiredMonthsMin,
      timeMax: careerProfiles.timeRequiredMonthsMax,
      salaryEntryMin: careerProfiles.salaryEntryMin,
      salaryEntryMax: careerProfiles.salaryEntryMax,
      salarySeniorMax: careerProfiles.salarySeniorMax,
      currencyCode: careerProfiles.currencyCode,
      demand: careerProfiles.futureDemandLevel,
      competition: careerProfiles.competitionLevel,
      difficulty: careerProfiles.difficultyLevel,
      remote: careerProfiles.remotePossible,
      selfEmployment: careerProfiles.selfEmploymentPossible,
      isRegulated: careerProfiles.isRegulated,
    })
    .from(careerProfiles)
    .innerJoin(occupations, eq(careerProfiles.occupationId, occupations.id))
    .innerJoin(occupationGroups, eq(occupations.groupId, occupationGroups.id))
    .innerJoin(countries, eq(careerProfiles.countryId, countries.id))
    .where(and(eq(careerProfiles.status, "PUBLISHED"), eq(countries.isoCode, countryIso)));

  const skillRows = await db
    .select({ occupationId: occupationSkills.occupationId, name: skills.name })
    .from(occupationSkills)
    .innerJoin(skills, eq(occupationSkills.skillId, skills.id));

  const skillsByOccupation = new Map<string, string[]>();
  for (const row of skillRows) {
    const list = skillsByOccupation.get(row.occupationId) ?? [];
    list.push(row.name.toLowerCase());
    skillsByOccupation.set(row.occupationId, list);
  }

  const candidates: ScoringRow[] = rows.map((row) => ({
    ...row,
    requiredSkills: skillsByOccupation.get(row.occupationId) ?? [],
  }));

  const userSkills = new Set((answers.currentSkills ?? []).map((s) => s.toLowerCase()));

  const interestGroups = new Set<string>();
  for (const interest of answers.interests ?? []) {
    for (const group of INTEREST_TO_GROUP[interest] ?? []) interestGroups.add(group);
  }
  const styleGroups = new Set(WORK_STYLE_GROUPS[answers.workStyle ?? ""] ?? []);

  const scored = candidates.map((career) => {
    let score = 0;
    const reasons: string[] = [];
    const gaps: string[] = [];

    // --- Interest alignment (max 26) -------------------------------------
    if (interestGroups.has(career.groupSlug)) {
      score += 22;
      reasons.push(`Matches your stated interest in ${career.groupName.toLowerCase()}.`);
    }
    if (styleGroups.has(career.groupSlug)) {
      score += 4;
      reasons.push("Fits the kind of work you said you prefer.");
    }

    // --- Skill overlap (max 20) ------------------------------------------
    if (career.requiredSkills.length && userSkills.size) {
      const overlap = career.requiredSkills.filter((skill) => userSkills.has(skill));
      const ratio = overlap.length / career.requiredSkills.length;
      score += Math.round(ratio * 20);
      if (overlap.length >= 2) {
        reasons.push(`You already have ${overlap.slice(0, 3).join(", ")}.`);
      }
      const missing = career.requiredSkills.filter((skill) => !userSkills.has(skill));
      if (missing.length) gaps.push(...missing.slice(0, 4));
    } else if (career.requiredSkills.length) {
      gaps.push(...career.requiredSkills.slice(0, 4));
    }

    // --- Budget fit (max 16, can go negative) -----------------------------
    if (answers.budget != null && career.costMin != null) {
      if (answers.budget >= (career.costMax ?? career.costMin)) {
        score += 16;
        reasons.push("Comfortably inside the budget you gave us.");
      } else if (answers.budget >= career.costMin) {
        score += 9;
        reasons.push("The lower-cost route fits your budget; the premium one doesn't.");
      } else {
        score -= 12;
        gaps.push("Costs more than your stated budget — check the financial assistance options.");
      }
    }

    // --- Time appetite (max 14) -------------------------------------------
    const appetite = STUDY_APPETITE_MONTHS[answers.studyAppetite ?? "medium"];
    if (career.timeMin != null) {
      if (career.timeMin <= appetite) {
        score += 14;
      } else if (career.timeMin <= appetite * 1.5) {
        score += 6;
        gaps.push("Takes longer than the study time you said you're willing to give.");
      } else {
        score -= 8;
        gaps.push(
          `Typically takes ${Math.round(career.timeMin / 12)}+ years — well beyond your stated appetite.`,
        );
      }
    }

    // --- Market outlook (max 14) ------------------------------------------
    score += LEVEL_SCORE[career.demand] * 2.5;
    if (career.demand === "VERY_HIGH" || career.demand === "HIGH") {
      reasons.push("Demand for this is currently rated high in our data.");
    }
    score -= LEVEL_SCORE[career.competition] * 1.0;
    if (career.competition === "VERY_HIGH") {
      gaps.push("Very competitive — expect a long selection process.");
    }

    // --- Stated preferences (max 12) ---------------------------------------
    if (answers.wantsRemote && career.remote) {
      score += 6;
      reasons.push("Remote work is realistic in this field.");
    } else if (answers.wantsRemote && !career.remote) {
      score -= 5;
      gaps.push("Rarely remote — this is mostly on-site work.");
    }

    if (answers.wantsSelfEmployment && career.selfEmployment) {
      score += 6;
      reasons.push("You can practise independently or freelance in this field.");
    } else if (answers.wantsSelfEmployment && !career.selfEmployment) {
      score -= 4;
      gaps.push("Usually salaried employment rather than self-employment.");
    }

    if (answers.wantsGovernment && career.groupSlug === "government") {
      score += 8;
      reasons.push("This is a government career, which is what you said you're aiming for.");
    }

    // --- Income priority (max 10) ------------------------------------------
    if (answers.incomePriority === "maximise" && career.salarySeniorMax) {
      const ceiling = career.salarySeniorMax;
      if (ceiling >= 2_500_000) {
        score += 10;
        reasons.push("High earning ceiling for experienced people in this field.");
      } else if (ceiling >= 1_200_000) {
        score += 5;
      }
    }
    if (answers.incomePriority === "stability" && career.groupSlug === "government") {
      score += 6;
      reasons.push("Government roles offer the job security you said you value.");
    }

    // --- Risk tolerance ----------------------------------------------------
    if (answers.riskTolerance === "low" && career.competition === "VERY_HIGH") {
      score -= 6;
    }
    if (answers.riskTolerance === "high" && career.selfEmployment) {
      score += 3;
    }

    // Regulated professions get a standing caveat rather than a score penalty.
    if (career.isRegulated) {
      gaps.push("Regulated profession — licensing and registration rules apply and vary by state.");
    }

    if (!reasons.length) {
      reasons.push("Included because it broadly matches your profile; the fit is weaker than the options above.");
    }

    return {
      careerSlug: career.slug,
      name: career.name,
      score: Math.max(0, Math.min(99, Math.round(score))),
      reasons: reasons.slice(0, 4),
      gaps: [...new Set(gaps)].slice(0, 4),
      groupName: career.groupName,
      salaryEntryMin: career.salaryEntryMin,
      salaryEntryMax: career.salaryEntryMax,
      currencyCode: career.currencyCode,
    } satisfies AssessmentResult;
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

export const INTEREST_OPTIONS = [
  { value: "technology", label: "Technology & software" },
  { value: "ai", label: "AI & data" },
  { value: "engineering", label: "Engineering" },
  { value: "healthcare", label: "Medicine & healthcare" },
  { value: "finance", label: "Finance & accounts" },
  { value: "business", label: "Business & management" },
  { value: "law", label: "Law & compliance" },
  { value: "government", label: "Government & civil services" },
  { value: "defence", label: "Defence & police" },
  { value: "design", label: "Design & creative" },
  { value: "education", label: "Teaching & education" },
  { value: "logistics", label: "Logistics & transport" },
  { value: "skilled_trades", label: "Skilled trades" },
  { value: "science", label: "Science & research" },
];
