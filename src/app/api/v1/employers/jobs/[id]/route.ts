import { z } from "zod";
import { noContent, ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { closeJobPosting, updateJobPosting } from "@/modules/employers/service";
import { isRenderableUrl } from "@/modules/shared/params";

const patchSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().min(40).max(20_000).optional(),
  responsibilities: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
  employmentType: z
    .enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP", "APPRENTICESHIP", "FREELANCE"])
    .optional(),
  remoteType: z.enum(["ONSITE", "HYBRID", "REMOTE"]).optional(),
  city: z.string().trim().max(120).nullish(),
  regionId: z.string().nullish(),
  experienceMinYears: z.number().int().min(0).max(50).optional(),
  experienceMaxYears: z.number().int().min(0).max(60).nullish(),
  educationRequired: z.string().trim().max(200).nullish(),
  skillsRequired: z.array(z.string().trim().min(1).max(80)).min(1).max(30).optional(),
  skillsPreferred: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  salaryMin: z.number().int().min(0).max(100_000_000).nullish(),
  salaryMax: z.number().int().min(0).max(100_000_000).nullish(),
  isSalaryDisclosed: z.boolean().optional(),
  applyUrl: z
    .string()
    .url()
    .max(500)
    // Scheme too, not only shape: z.url() accepts javascript: and data:.
    .refine(isRenderableUrl, "Links must start with http:// or https://")
    .nullish(),
});

type Context = { params: Promise<{ id: string }> };

export const PATCH = route(async (request: Request, context: Context) => {
  const session = await requireSession();
  await consume(`job:update:${session.sub}`, 120, 60 * 60);

  const { id } = await context.params;
  const data = patchSchema.parse(await readJson(request));
  const posting = await updateJobPosting({ jobId: id, userId: session.sub, data });

  return ok({ posting });
});

export const DELETE = route(async (_request: Request, context: Context) => {
  const session = await requireSession();
  const { id } = await context.params;
  await closeJobPosting(id, session.sub);
  return noContent();
});
