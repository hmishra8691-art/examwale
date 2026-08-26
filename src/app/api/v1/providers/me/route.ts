/**
 * The signed-in user's provider profile.
 *
 * One endpoint for one identity: a person has exactly one professional profile
 * here, so this is a GET and a PUT rather than a collection.
 */
import { z } from "zod";
import { ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { getProviderContext, saveProviderProfile } from "@/modules/providers/service";

const linkSchema = z.object({
  label: z.string().trim().min(1, "Every link needs a label.").max(40),
  url: z.string().trim().url("That isn't a valid URL.").max(500),
});

const certificationSchema = z.object({
  title: z.string().trim().min(2).max(160),
  issuer: z.string().trim().max(160).optional(),
  year: z.number().int().min(1950).max(2100).optional(),
});

/*
 * Messages spelled out rather than left to zod's defaults. The service layer has
 * the same rules with prose attached, but zod runs first, so without these the
 * person sees "Invalid input" against a field and has to guess what is wrong
 * with it.
 */
const bodySchema = z.object({
  displayName: z.string().trim().min(2, "A display name needs at least two characters.").max(120),
  headline: z
    .string()
    .trim()
    .min(10, "A headline needs to say something — at least ten characters.")
    .max(200, "Keep the headline under 200 characters."),
  bio: z
    .string()
    .trim()
    .min(40, "A bio under forty characters tells a seeker nothing. Say what you actually help with.")
    .max(4000, "Keep the bio under 4000 characters."),
  professionalTitle: z.string().trim().max(160).optional().nullable(),
  currentRole: z.string().trim().max(160).optional().nullable(),
  currentOrganisation: z.string().trim().max(160).optional().nullable(),
  yearsExperience: z.number().int().min(0).max(70).optional(),
  languages: z
    .array(z.string().trim().min(1).max(40))
    .min(1, "List at least one language you can work in.")
    .max(12, "Twelve languages is plenty."),
  city: z.string().trim().max(120).optional().nullable(),
  countryId: z.string().trim().max(40).optional().nullable(),
  timezone: z.string().trim().max(64).optional().nullable(),
  links: z.array(linkSchema).max(8, "At most eight links.").optional().nullable(),
  certifications: z
    .array(certificationSchema)
    .max(20, "At most twenty certifications.")
    .optional()
    .nullable(),
  visibility: z.enum(["PUBLIC", "LIMITED", "HIDDEN"]).optional(),
});

export const GET = route(async () => {
  const session = await requireSession();
  return ok(await getProviderContext(session.sub));
});

export const PUT = route(async (request: Request) => {
  const session = await requireSession();
  await consume(`provider:profile:${session.sub}`, 30, 60 * 60);
  const body = bodySchema.parse(await readJson(request));
  const profile = await saveProviderProfile(session.sub, body);
  return ok({ profile });
});
