import { z } from "zod";
import { created, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { addCredential } from "@/modules/mentors/service";

const bodySchema = z.object({
  kind: z.enum(["exam_result", "employment", "education", "licence", "other"]),
  title: z.string().trim().min(3).max(200),
  issuer: z.string().trim().max(160).nullish(),
  evidenceUrl: z.string().url().max(500).nullish(),
});

export const POST = route(async (request: Request) => {
  const session = await requireSession();
  consume(`mentor:credential:${session.sub}`, 20, 24 * 60 * 60);

  const body = bodySchema.parse(await readJson(request));
  const credential = await addCredential({ userId: session.sub, ...body });

  return created({ credential });
});
