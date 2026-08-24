import { z } from "zod";
import { ok, readJson, route } from "@/modules/shared/http";
import { requireAdmin } from "@/modules/auth/session";
import { COVERAGE_SECTIONS } from "@/modules/geo/config";
import { launchReadiness, setCountryActive, setCoverage } from "@/modules/geo/service";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("activate") }),
  z.object({ action: z.literal("deactivate") }),
  z.object({
    action: z.literal("coverage"),
    section: z.enum(COVERAGE_SECTIONS),
    state: z.enum(["COVERED", "PARTIAL", "PLANNED", "NOT_APPLICABLE"]),
    note: z.string().trim().max(500).nullish(),
  }),
]);

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, context: Context) => {
  await requireAdmin();
  const { id } = await context.params;
  return ok(await launchReadiness(id));
});

export const POST = route(async (request: Request, context: Context) => {
  const admin = await requireAdmin();
  const { id } = await context.params;
  const body = bodySchema.parse(await readJson(request));

  if (body.action === "coverage") {
    const row = await setCoverage({
      countryId: id,
      section: body.section,
      state: body.state,
      note: body.note ?? null,
      adminId: admin.sub,
    });
    return ok({ coverage: row });
  }

  // assertLaunchable runs inside setCountryActive — the gate is checked at the
  // moment of activation, not trusted from an earlier readiness read.
  const country = await setCountryActive({
    countryId: id,
    isActive: body.action === "activate",
    adminId: admin.sub,
  });

  return ok({ country });
});
