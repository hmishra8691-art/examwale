import { z } from "zod";
import { clientIp, created, readJson, route } from "@/modules/shared/http";
import { getSession } from "@/modules/auth/session";
import { consume, consumeByClient } from "@/modules/shared/rate-limit";
import { SHAREABLE_FIELDS, createEnquiry } from "@/modules/courses/service";

const bodySchema = z.object({
  batchId: z.string().nullish(),
  name: z.string().trim().min(2).max(120),
  email: z.string().email(),
  phone: z.string().trim().max(30).nullish(),
  message: z.string().trim().max(2000).nullish(),
  sharedFields: z.array(z.enum(SHAREABLE_FIELDS)).max(SHAREABLE_FIELDS.length).default([]),
});

type Context = { params: Promise<{ id: string }> };

/**
 * Open to signed-out visitors, like the assessment: someone comparing coaching
 * centres should not have to make an account before asking a question. Signed
 * in, the enquiry is linked to the account so it shows in their history.
 */
export const POST = route(async (request: Request, context: Context) => {
  const session = await getSession();
  if (session) consume(`course:enquiry:user:${session.sub}`, 20, 24 * 60 * 60);
  else
    consumeByClient(
      "course:enquiry",
      clientIp(request),
      { perIp: 10, globalFallback: 400 },
      24 * 60 * 60,
    );

  const { id } = await context.params;
  const body = bodySchema.parse(await readJson(request));

  const enquiry = await createEnquiry({
    courseId: id,
    batchId: body.batchId ?? null,
    userId: session?.sub ?? null,
    name: body.name,
    email: body.email,
    phone: body.phone ?? null,
    message: body.message ?? null,
    sharedFields: body.sharedFields,
  });

  return created({
    enquiry: { id: enquiry.id, sharedFields: enquiry.sharedFields },
    message: "Sent. The provider will contact you using the details you shared.",
  });
});
