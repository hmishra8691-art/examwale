import { cookies } from "next/headers";
import { env } from "@/modules/shared/env";

export const ACCESS_COOKIE = "ew_at";
export const REFRESH_COOKIE = "ew_rt";

const baseOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: env.isProduction,
};

export async function setSessionCookies(accessToken: string, refreshToken: string) {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, accessToken, { ...baseOptions, maxAge: env.accessTtlSeconds });
  jar.set(REFRESH_COOKIE, refreshToken, { ...baseOptions, maxAge: env.refreshTtlSeconds });
}

export async function clearSessionCookies() {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, "", { ...baseOptions, maxAge: 0 });
  jar.set(REFRESH_COOKIE, "", { ...baseOptions, maxAge: 0 });
}

export async function readAccessCookie(): Promise<string | undefined> {
  return (await cookies()).get(ACCESS_COOKIE)?.value;
}

export async function readRefreshCookie(): Promise<string | undefined> {
  return (await cookies()).get(REFRESH_COOKIE)?.value;
}
