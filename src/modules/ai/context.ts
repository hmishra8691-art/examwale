import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  countries,
  educationStages,
  exams,
  careerProfiles,
  occupations,
  regions,
  skills,
  userGoals,
  userInterests,
  userProfiles,
  userSkills,
} from "@/db/schema";
import type { ProfileContext } from "@/modules/ai/prompts";

const GOAL_LABELS: Record<string, string> = {
  get_job: "get a job",
  change_career: "change career",
  government_job: "get a government job",
  study_abroad: "study abroad",
  start_business: "start a business",
  freelance: "become a freelancer",
  increase_salary: "increase salary",
  learn_skill: "learn a skill",
  prepare_exam: "prepare for an exam",
  become_professional: "qualify as a professional",
};

/**
 * Assembles the compact profile block the prompt layer needs.
 *
 * Deliberately bounded: a rolling summary of who the user is, not their entire
 * history. Prompt size stays predictable, and unrelated past conversations
 * don't leak into the current one.
 */
export async function loadProfileContext(userId: string | null): Promise<ProfileContext | null> {
  if (!userId) return null;

  const [profile] = await db
    .select({
      age: userProfiles.age,
      city: userProfiles.city,
      degree: userProfiles.degree,
      major: userProfiles.major,
      employmentStatus: userProfiles.employmentStatus,
      yearsExperience: userProfiles.yearsExperience,
      budget: userProfiles.availableBudget,
      hoursPerDay: userProfiles.availableHoursPerDay,
      regionName: regions.name,
      countryName: countries.name,
      currencyCode: countries.currencyCode,
      stageName: educationStages.name,
    })
    .from(userProfiles)
    .leftJoin(regions, eq(userProfiles.regionId, regions.id))
    .leftJoin(countries, eq(userProfiles.countryId, countries.id))
    .leftJoin(educationStages, eq(userProfiles.educationStageId, educationStages.id))
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  const [interests, skillRows, goals] = await Promise.all([
    db.select({ tag: userInterests.tag }).from(userInterests).where(eq(userInterests.userId, userId)),
    db
      .select({ name: skills.name })
      .from(userSkills)
      .innerJoin(skills, eq(userSkills.skillId, skills.id))
      .where(eq(userSkills.userId, userId)),
    db
      .select({
        goalType: userGoals.goalType,
        careerName: occupations.name,
        examName: exams.shortName,
        note: userGoals.note,
      })
      .from(userGoals)
      .leftJoin(careerProfiles, eq(userGoals.targetCareerProfileId, careerProfiles.id))
      .leftJoin(occupations, eq(careerProfiles.occupationId, occupations.id))
      .leftJoin(exams, eq(userGoals.targetExamId, exams.id))
      .where(eq(userGoals.userId, userId))
      .orderBy(desc(userGoals.priority))
      .limit(5),
  ]);

  if (!profile && !interests.length && !skillRows.length && !goals.length) return null;

  return {
    age: profile?.age,
    city: profile?.city,
    regionName: profile?.regionName,
    countryName: profile?.countryName,
    educationStage: profile?.stageName,
    degree: profile?.degree,
    major: profile?.major,
    employmentStatus: profile?.employmentStatus,
    yearsExperience: profile?.yearsExperience,
    budget: profile?.budget,
    hoursPerDay: profile?.hoursPerDay,
    currencyCode: profile?.currencyCode ?? "INR",
    interests: interests.map((row) => row.tag),
    skills: skillRows.map((row) => row.name),
    goals: goals.map((goal) => {
      const base = GOAL_LABELS[goal.goalType] ?? goal.goalType.replace(/_/g, " ");
      const target = goal.careerName ?? goal.examName;
      return target ? `${base} — ${target}` : base;
    }),
  };
}
