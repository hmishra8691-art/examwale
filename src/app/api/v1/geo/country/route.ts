import { z } from "zod";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { userProfiles } from "@/db/schema";
import { ok, readJson, route } from "@/modules/shared/http";
import { getSession } from "@/modules/auth/session";
import { ValidationError } from "@/modules/shared/errors";
import { COUNTRY_COOKIE } from "@/modules/geo/config";
import { listActiveCountries } from "@/modules/geo/service";

const bodySchema = z.object({ isoCode: z.string().trim().length(2) });

/**
 * Switches the country this visitor is browsing.
 *
 * Validated against the *active* list rather than against the countries table,
 * so a code for a seeded-but-unlaunched country is refused even though the row
 * exists. Writes the cookie for immediate effect and, for a signed-in user,
 * the profile too — the same two-write reasoning as the locale route.
 */
export const POST = route(async (request: Request) => {
  const body = bodySchema.parse(await readJson(request));
  const isoCode = body.isoCode.toUpperCase();

  const active = await listActiveCountries();
  const country = active.find((entry) => entry.isoCode === isoCode);
  if (!country) {
    throw new ValidationError("We don't cover that country yet.");
  }

  const store = await cookies();
  store.set(COUNTRY_COOKIE, country.isoCode, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: false,
  });

  const session = await getSession();
  if (session) {
    await db
      .update(userProfiles)
      .set({ countryId: country.id })
      .where(eq(userProfiles.userId, session.sub));
  }

  return ok({ country });
});
