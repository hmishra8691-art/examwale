import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { route } from "@/modules/shared/http";
import { env } from "@/modules/shared/env";
import { AppError } from "@/modules/shared/errors";
import { safeRedirectPath } from "@/modules/auth/redirect";

export const GET = route(async (request: Request) => {
  if (!env.googleEnabled) {
    throw new AppError(
      "Google sign-in isn't configured on this deployment. Use email and password.",
      501,
      "not_configured",
    );
  }

  const next = safeRedirectPath(new URL(request.url).searchParams.get("next"));
  const state = randomBytes(16).toString("base64url");

  const jar = await cookies();
  jar.set("ew_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
    secure: env.isProduction,
  });
  jar.set("ew_oauth_next", next, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
    secure: env.isProduction,
  });

  const authorise = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorise.searchParams.set("client_id", env.googleClientId);
  authorise.searchParams.set("redirect_uri", env.googleRedirectUri);
  authorise.searchParams.set("response_type", "code");
  authorise.searchParams.set("scope", "openid email profile");
  authorise.searchParams.set("state", state);
  authorise.searchParams.set("prompt", "select_account");

  return NextResponse.redirect(authorise.toString());
});
