/** Edit a service, or move it through the states its provider controls. */
import { z } from "zod";
import { ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import {
  setAcceptingRequests,
  setServiceState,
  submitService,
  updateService,
} from "@/modules/services/service";

const patchSchema = z.object({
  title: z.string().trim().min(6).max(140).optional(),
  summary: z.string().trim().min(20).max(300).optional(),
  description: z.string().trim().min(100).max(8000).optional(),
  deliverables: z.array(z.string().trim().min(3).max(200)).max(12).optional().nullable(),
  delivery: z.enum(["LIVE_SESSION", "ASYNC_REVIEW", "WRITTEN_DELIVERABLE", "PROGRAMME"]).optional(),
  price: z.number().int().min(0).max(10_000_000).optional().nullable(),
  priceOnRequest: z.boolean().optional(),
  durationMinutes: z.number().int().min(5).max(2400).optional().nullable(),
  turnaroundDays: z.number().int().min(0).max(180).optional().nullable(),
  languages: z.array(z.string().trim().min(1).max(40)).max(12).optional().nullable(),
});

const actionSchema = z.object({
  action: z.enum(["submit", "pause", "resume", "archive", "restore", "accepting", "not_accepting"]),
});

type Context = { params: Promise<{ id: string }> };

export const PATCH = route(async (request: Request, context: Context) => {
  const session = await requireSession();
  await consume(`service:update:${session.sub}`, 120, 60 * 60);
  const { id } = await context.params;
  const data = patchSchema.parse(await readJson(request));
  return ok(await updateService({ serviceId: id, userId: session.sub, data }));
});

export const POST = route(async (request: Request, context: Context) => {
  const session = await requireSession();
  await consume(`service:action:${session.sub}`, 120, 60 * 60);
  const { id } = await context.params;
  const { action } = actionSchema.parse(await readJson(request));

  switch (action) {
    case "submit":
      return ok(await submitService(id, session.sub));
    case "pause":
      return ok(await setServiceState({ serviceId: id, userId: session.sub, to: "PAUSED" }));
    case "resume":
      return ok(await setServiceState({ serviceId: id, userId: session.sub, to: "ACTIVE" }));
    case "archive":
      return ok(await setServiceState({ serviceId: id, userId: session.sub, to: "ARCHIVED" }));
    case "restore":
      return ok(await setServiceState({ serviceId: id, userId: session.sub, to: "DRAFT" }));
    case "accepting":
      await setAcceptingRequests({ serviceId: id, userId: session.sub, accepting: true });
      return ok({ acceptingRequests: true });
    case "not_accepting":
      await setAcceptingRequests({ serviceId: id, userId: session.sub, accepting: false });
      return ok({ acceptingRequests: false });
  }
});
