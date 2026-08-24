import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clientIp, route } from "@/modules/shared/http";
import { env } from "@/modules/shared/env";
import { AppError } from "@/modules/shared/errors";
import { signInWithProvider } from "@/modules/auth/service";
import { setSessionCookies } from "@/modules/auth/cookies";
import { safeRedirectPath } from "@/modules/auth/redirect";

type GoogleTokenResponse = { access_token?: string; id_token?: string; error?: string };
type GoogleUserInfo = { sub: string; email?: string; name?: string; email_verified?: boolean };

export const GET = route(async (request: Request) => {
  if (!env.googleEnabled) {
    throw new AppError("Google sign-in isn't configured.", 501, "not_configured");
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const jar = await cookies();
  const expectedState = jar.get("ew_oauth_state")?.value;
  // Re-validated on the way out as well as on the way in: the cookie is
  // httpOnly, but revalidating costs nothing and removes the assumption.
  const next = safeRedirectPath(jar.get("ew_oauth_next")?.value);

  // CSRF protection: the state we issued must come back unchanged.
  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL("/login?error=oauth_state", env.appUrl));
  }

  jar.set("ew_oauth_state", "", { path: "/", maxAge: 0 });
  jar.set("ew_oauth_next", "", { path: "/", maxAge: 0 });

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      redirect_uri: env.googleRedirectUri,
      grant_type: "authorization_code",
    }),
  });

  const tokens = (await tokenResponse.json()) as GoogleTokenResponse;
  if (!tokenResponse.ok || !tokens.access_token) {
    return NextResponse.redirect(new URL("/login?error=oauth_exchange", env.appUrl));
  }

  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = (await profileResponse.json()) as GoogleUserInfo;

  if (!profile.email) {
    return NextResponse.redirect(new URL("/login?error=oauth_no_email", env.appUrl));
  }

  const session = await signInWithProvider({
    email: profile.email,
    name: profile.name ?? null,
    provider: "google",
    providerId: profile.sub,
    ip: clientIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  await setSessionCookies(session.accessToken, session.refreshToken);
  return NextResponse.redirect(new URL(next, env.appUrl));
});
