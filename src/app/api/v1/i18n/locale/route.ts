import { z } from "zod";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { userProfiles } from "@/db/schema";
import { ok, readJson, route } from "@/modules/shared/http";
import { getSession } from "@/modules/auth/session";
import { LOCALES, LOCALE_COOKIE } from "@/modules/i18n/config";

const bodySchema = z.object({ locale: z.enum(LOCALES) });

/**
 * Sets the display language.
 *
 * Two writes on purpose: the cookie makes it take effect immediately and works
 * for signed-out visitors, and the profile column makes it survive signing in
 * on another device. Neither alone is sufficient.
 */
export const POST = route(async (request: Request) => {
  const body = bodySchema.parse(await readJson(request));

  const store = await cookies();
  store.set(LOCALE_COOKIE, body.locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: false,
  });

  const session = await getSession();
  if (session) {
    await db
      .update(userProfiles)
      .set({ preferredLanguage: body.locale })
      .where(eq(userProfiles.userId, session.sub));
  }

  return ok({ locale: body.locale });
});
