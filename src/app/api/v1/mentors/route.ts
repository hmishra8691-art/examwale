import { z } from "zod";
import { created, ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { flag, int, one } from "@/modules/shared/params";
import { applyAsMentor, listMentors } from "@/modules/mentors/service";

const applySchema = z.object({
  headline: z.string().trim().min(10).max(160),
  bio: z.string().trim().min(60).max(4000),
  countryId: z.string().min(1),
  city: z.string().trim().max(120).nullish(),
  languages: z.array(z.string().trim().min(2).max(40)).min(1).max(8),
  expertiseCareerSlugs: z.array(z.string().trim().max(120)).max(12).optional(),
  expertiseExamIds: z.array(z.string().trim().max(60)).max(12).optional(),
  yearsExperience: z.number().int().min(0).max(60),
  currentRole: z.string().trim().max(160).nullish(),
  currentOrganisation: z.string().trim().max(160).nullish(),
  sessionRate: z.number().int().min(0).max(100_000),
  sessionMinutes: z.number().int().min(15).max(120).optional(),
});

export const GET = route(async (request: Request) => {
  const url = new URL(request.url);
  const get = (key: string) => url.searchParams.getAll(key);

  const result = await listMentors({
    search: one(get("q")),
    careerSlug: one(get("career")),
    examId: one(get("exam")),
    language: one(get("language")),
    maxRate: int(get("maxRate"), { min: 0, max: 100_000 }),
    freeOnly: flag(get("free")),
    page: int(get("page"), { min: 1, max: 5000 }),
    perPage: int(get("perPage"), { min: 6, max: 48 }),
  });

  return ok(result);
});

export const POST = route(async (request: Request) => {
  const session = await requireSession();
  await consume(`mentor:apply:${session.sub}`, 3, 24 * 60 * 60);

  const body = applySchema.parse(await readJson(request));
  const mentor = await applyAsMentor({ userId: session.sub, ...body });

  return created({
    mentor,
    message:
      "Application received. Your profile isn't public yet — we verify at least one credential first, because people booking sessions are relying on what you've said about yourself.",
  });
});

