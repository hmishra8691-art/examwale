/** Create a service. Requires the SERVICE_PROVIDER capability. */
import { z } from "zod";
import { created, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { createService } from "@/modules/services/service";

const bodySchema = z.object({
  kind: z.enum([
    "RESUME_REVIEW",
    "INTERVIEW_COACHING",
    "CAREER_COACHING",
    "CONSULTING",
    "TRAINING",
    "PORTFOLIO_REVIEW",
    "OTHER",
  ]),
  title: z.string().trim().min(6, "Give the service a title of at least six characters.").max(140),
  summary: z
    .string()
    .trim()
    .min(20, "The summary is the line people read in a list. Say what they get.")
    .max(300),
  description: z
    .string()
    .trim()
    .min(100, "A description under a hundred characters tells a buyer nothing.")
    .max(8000),
  deliverables: z.array(z.string().trim().min(3).max(200)).max(12).optional().nullable(),
  delivery: z.enum(["LIVE_SESSION", "ASYNC_REVIEW", "WRITTEN_DELIVERABLE", "PROGRAMME"]),
  price: z.number().int().min(0).max(10_000_000).optional().nullable(),
  priceOnRequest: z.boolean().optional(),
  currencyCode: z.string().length(3).optional(),
  durationMinutes: z.number().int().min(5).max(2400).optional().nullable(),
  turnaroundDays: z.number().int().min(0).max(180).optional().nullable(),
  languages: z.array(z.string().trim().min(1).max(40)).max(12).optional().nullable(),
});

export const POST = route(async (request: Request) => {
  const session = await requireSession();
  await consume(`service:create:${session.sub}`, 20, 24 * 60 * 60);
  const data = bodySchema.parse(await readJson(request));
  return created({ service: await createService({ userId: session.sub, data }) });
});
