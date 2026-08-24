import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  careerProfiles,
  occupations,
  roadmapSteps,
  roadmapTemplates,
  roadmaps,
  type RealityCheck,
  type RoadmapTemplateStep,
} from "@/db/schema";
import { ForbiddenError, NotFoundError } from "@/modules/shared/errors";
import { runRealityCheck } from "@/modules/roadmaps/reality-check";

export async function listRoadmaps(userId: string) {
  const rows = await db
    .select({
      id: roadmaps.id,
      title: roadmaps.title,
      goalDescription: roadmaps.goalDescription,
      targetCareerSlug: roadmaps.targetCareerSlug,
      createdAt: roadmaps.createdAt,
      realityCheck: roadmaps.realityCheck,
    })
    .from(roadmaps)
    .where(eq(roadmaps.userId, userId))
    .orderBy(desc(roadmaps.createdAt));

  const withProgress = await Promise.all(
    rows.map(async (row) => {
      const steps = await db
        .select({ status: roadmapSteps.status })
        .from(roadmapSteps)
        .where(eq(roadmapSteps.roadmapId, row.id));
      const done = steps.filter((step) => step.status === "DONE").length;
      return {
        ...row,
        totalSteps: steps.length,
        doneSteps: done,
        progress: steps.length ? Math.round((done / steps.length) * 100) : 0,
      };
    }),
  );

  return withProgress;
}

export async function getRoadmap(roadmapId: string, userId: string) {
  const roadmap = await db.query.roadmaps.findFirst({ where: eq(roadmaps.id, roadmapId) });
  if (!roadmap) throw new NotFoundError("That roadmap doesn't exist.");
  if (roadmap.userId !== userId) throw new ForbiddenError("That roadmap isn't yours.");

  const steps = await db
    .select()
    .from(roadmapSteps)
    .where(eq(roadmapSteps.roadmapId, roadmapId))
    .orderBy(asc(roadmapSteps.sequence));

  const done = steps.filter((step) => step.status === "DONE").length;
  return {
    roadmap,
    steps,
    progress: steps.length ? Math.round((done / steps.length) * 100) : 0,
  };
}

/**
 * Builds a roadmap from the career's template, spacing target dates by the
 * typical duration of each step so the plan has real dates, not just an order.
 */
export async function createRoadmapForCareer(input: {
  userId: string;
  careerSlug: string;
  timelineMonths?: number;
  hoursPerDay?: number;
  currentLevel?: "none" | "beginner" | "intermediate" | "advanced";
  targetIncome?: number | null;
}) {
  const [career] = await db
    .select({
      id: careerProfiles.id,
      slug: careerProfiles.slug,
      name: occupations.name,
      timeMin: careerProfiles.timeRequiredMonthsMin,
      timeMax: careerProfiles.timeRequiredMonthsMax,
      salaryEntryMax: careerProfiles.salaryEntryMax,
      currencyCode: careerProfiles.currencyCode,
      isRegulated: careerProfiles.isRegulated,
      nextSteps: careerProfiles.nextSteps,
    })
    .from(careerProfiles)
    .innerJoin(occupations, eq(careerProfiles.occupationId, occupations.id))
    .where(eq(careerProfiles.slug, input.careerSlug))
    .limit(1);

  if (!career) throw new NotFoundError("We don't have that career on file.");

  const [template] = await db
    .select()
    .from(roadmapTemplates)
    .where(eq(roadmapTemplates.careerProfileId, career.id))
    .limit(1);

  const templateSteps: RoadmapTemplateStep[] =
    template?.steps ??
    (career.nextSteps as string[]).map((step, index) => ({
      title: step,
      description: "",
      kind: "milestone",
      typicalMonths: Math.max(1, Math.round((career.timeMin ?? 24) / Math.max(1, (career.nextSteps as string[]).length))),
      refType: undefined,
      refSlug: undefined,
    }));

  const hasExamStep = templateSteps.some((step) => step.kind === "exam");

  let realityCheck: RealityCheck | null = null;
  if (input.timelineMonths && input.hoursPerDay) {
    realityCheck = runRealityCheck({
      goalLabel: `Become a ${career.name}`,
      timelineMonths: input.timelineMonths,
      hoursPerDay: input.hoursPerDay,
      typicalMonthsMin: career.timeMin,
      typicalMonthsMax: career.timeMax,
      currentLevel: input.currentLevel,
      targetIncome: input.targetIncome ?? null,
      realisticEntryIncomeMax: career.salaryEntryMax,
      currencyCode: career.currencyCode,
      isRegulated: career.isRegulated,
      requiresExam: hasExamStep,
    });
  }

  const [roadmap] = await db
    .insert(roadmaps)
    .values({
      userId: input.userId,
      title: `Becoming a ${career.name}`,
      goalDescription:
        input.timelineMonths != null
          ? `Reach ${career.name} in about ${input.timelineMonths} months at ${input.hoursPerDay ?? "?"} hours a day.`
          : `Reach ${career.name}.`,
      generatedBy: "template",
      targetCareerSlug: career.slug,
      realityCheck,
    })
    .returning();

  let cursor = new Date();
  const values = templateSteps.map((step, index) => {
    cursor = new Date(cursor.getTime() + (step.typicalMonths ?? 3) * 30 * 86_400_000);
    return {
      roadmapId: roadmap.id,
      sequence: index + 1,
      title: step.title,
      description: step.description,
      kind: step.kind,
      refType: step.refType ?? null,
      refSlug: step.refSlug ?? null,
      targetDate: new Date(cursor),
    };
  });

  if (values.length) await db.insert(roadmapSteps).values(values);

  return roadmap;
}

export async function updateStepStatus(input: {
  userId: string;
  stepId: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "DONE";
}) {
  const [step] = await db
    .select({ step: roadmapSteps, ownerId: roadmaps.userId })
    .from(roadmapSteps)
    .innerJoin(roadmaps, eq(roadmapSteps.roadmapId, roadmaps.id))
    .where(eq(roadmapSteps.id, input.stepId))
    .limit(1);

  if (!step) throw new NotFoundError("That step doesn't exist.");
  if (step.ownerId !== input.userId) throw new ForbiddenError("That roadmap isn't yours.");

  await db
    .update(roadmapSteps)
    .set({
      status: input.status,
      completedAt: input.status === "DONE" ? new Date() : null,
    })
    .where(eq(roadmapSteps.id, input.stepId));

  await db.update(roadmaps).set({ updatedAt: new Date() }).where(eq(roadmaps.id, step.step.roadmapId));
}

export async function deleteRoadmap(roadmapId: string, userId: string) {
  const roadmap = await db.query.roadmaps.findFirst({ where: eq(roadmaps.id, roadmapId) });
  if (!roadmap) return;
  if (roadmap.userId !== userId) throw new ForbiddenError("That roadmap isn't yours.");

  // Steps first — no foreign key means no cascade.
  await db.delete(roadmapSteps).where(eq(roadmapSteps.roadmapId, roadmapId));
  await db.delete(roadmaps).where(eq(roadmaps.id, roadmapId));
}

export async function activeRoadmap(userId: string) {
  const [roadmap] = await db
    .select()
    .from(roadmaps)
    .where(eq(roadmaps.userId, userId))
    .orderBy(desc(roadmaps.updatedAt))
    .limit(1);
  if (!roadmap) return null;

  const steps = await db
    .select()
    .from(roadmapSteps)
    .where(eq(roadmapSteps.roadmapId, roadmap.id))
    .orderBy(asc(roadmapSteps.sequence));

  const done = steps.filter((step) => step.status === "DONE").length;
  const next = steps.find((step) => step.status !== "DONE") ?? null;

  return {
    roadmap,
    steps,
    nextStep: next,
    progress: steps.length ? Math.round((done / steps.length) * 100) : 0,
  };
}
