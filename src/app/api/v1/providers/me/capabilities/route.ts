/**
 * Apply for a capability.
 *
 * MENTOR and EMPLOYER are not accepted here: both have their own application
 * flows that collect things this endpoint does not know about — a session rate
 * and expertise for mentoring, an organisation for hiring. Routing them here
 * would create a capability with nothing behind it, which then fails
 * confusingly at the point of use.
 */
import { z } from "zod";
import { created, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { ValidationError } from "@/modules/shared/errors";
import { CAPABILITIES, requestCapability } from "@/modules/providers/service";

const bodySchema = z.object({
  kind: z.enum(["COURSE_PROVIDER", "SERVICE_PROVIDER"]),
});

export const POST = route(async (request: Request) => {
  const session = await requireSession();
  await consume(`provider:capability:${session.sub}`, 10, 24 * 60 * 60);

  const parsed = z
    .object({ kind: z.string() })
    .parse(await readJson(request));

  if (parsed.kind === "MENTOR" || parsed.kind === "EMPLOYER") {
    throw new ValidationError(
      `${CAPABILITIES[parsed.kind].label} has its own application: ${CAPABILITIES[parsed.kind].applyHref}`,
    );
  }

  const body = bodySchema.parse(parsed);
  const capability = await requestCapability({ userId: session.sub, kind: body.kind });
  return created({ capability });
});
