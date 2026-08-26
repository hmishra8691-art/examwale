/**
 * Ask for a service, or respond to a request.
 *
 * A request, not a purchase: no money moves through this platform, and the
 * arrangement is made in the conversation this opens.
 */
import { z } from "zod";
import { created, ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { decideServiceRequest, requestService } from "@/modules/services/service";

const askSchema = z.object({ message: z.string().trim().max(2000).optional().nullable() });
const decideSchema = z.object({
  requestId: z.string().min(1).max(64),
  status: z.enum(["ACCEPTED", "DECLINED", "COMPLETED", "CANCELLED"]),
  note: z.string().trim().max(1000).optional().nullable(),
});

type Context = { params: Promise<{ id: string }> };

export const POST = route(async (request: Request, context: Context) => {
  const session = await requireSession();
  await consume(`service:request:${session.sub}`, 30, 24 * 60 * 60);
  const { id } = await context.params;
  const body = askSchema.parse(await readJson(request));
  return created(
    await requestService({ serviceId: id, requesterId: session.sub, message: body.message ?? null }),
  );
});

export const PATCH = route(async (request: Request) => {
  const session = await requireSession();
  const body = decideSchema.parse(await readJson(request));
  return ok(
    await decideServiceRequest({
      requestId: body.requestId,
      userId: session.sub,
      status: body.status,
      note: body.note ?? null,
    }),
  );
});
