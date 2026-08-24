import { z } from "zod";
import { created, ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { createRoadmapForCareer, listRoadmaps } from "@/modules/roadmaps/service";

const bodySchema = z.object({
  careerSlug: z.string().min(1),
  timelineMonths: z.number().int().min(1).max(240).optional(),
  hoursPerDay: z.number().min(0.5).max(16).optional(),
  currentLevel: z.enum(["none", "beginner", "intermediate", "advanced"]).optional(),
  targetIncome: z.number().int().min(0).max(100_000_000).nullable().optional(),
});

export const GET = route(async () => {
  const session = await requireSession();
  return ok({ roadmaps: await listRoadmaps(session.sub) });
});

export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const body = bodySchema.parse(await readJson(request));
  const roadmap = await createRoadmapForCareer({ userId: session.sub, ...body });
  return created({ roadmap });
});
