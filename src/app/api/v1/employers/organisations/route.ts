import { z } from "zod";
import { ok, created, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { listMemberships, registerOrganisation } from "@/modules/employers/service";
import { isRenderableUrl } from "@/modules/shared/params";

const bodySchema = z.object({
  name: z.string().trim().min(2).max(160),
  type: z.enum(["company", "institution", "coaching", "government", "ngo"]),
  countryId: z.string().min(1),
  contactEmail: z.string().email(),
  website: z
    .string()
    .url()
    .max(500)
    // Scheme as well as shape: z.url() accepts javascript: and data:.
    .refine(isRenderableUrl, "Links must start with http:// or https://")
    .nullish(),
  about: z.string().trim().max(2000).nullish(),
});

export const GET = route(async () => {
  const session = await requireSession();
  return ok({ organisations: await listMemberships(session.sub) });
});

export const POST = route(async (request: Request) => {
  const session = await requireSession();
  // Registering organisations is cheap to abuse and expensive to moderate.
  await consume(`org:register:${session.sub}`, 3, 24 * 60 * 60);

  const body = bodySchema.parse(await readJson(request));
  const organisation = await registerOrganisation({ userId: session.sub, ...body });

  return created({ organisation });
});
