import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { readAccessCookie } from "@/modules/auth/cookies";
import { verifyAccessToken, type AccessClaims } from "@/modules/auth/tokens";
import { ForbiddenError, UnauthorizedError } from "@/modules/shared/errors";

export type SessionUser = AccessClaims;

/**
 * Current user for server components and route handlers.
 * `cache` dedupes within one request so a page with a dozen server components
 * verifies the token once.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const token = await readAccessCookie();
  if (!token) return null;
  return verifyAccessToken(token);
});

/** Reads the authoritative row — use when role/plan must be fresh, not as-of-token. */
export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  const user = await db.query.users.findFirst({ where: eq(users.id, session.sub) });
  return user ?? null;
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

/** For pages: bounces to the sign-in screen and comes back afterwards. */
export async function requirePage(returnTo: string): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return session;
}

const ADMIN_ROLES = new Set(["ADMIN", "SUPER_ADMIN"]);

export async function requireAdmin(): Promise<SessionUser> {
  const session = await requireSession();
  if (!ADMIN_ROLES.has(session.role)) throw new ForbiddenError("Admin access only.");
  return session;
}

export async function requireAdminPage(returnTo: string): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  if (!ADMIN_ROLES.has(session.role)) redirect("/dashboard?error=admin_only");
  return session;
}

export function isAdmin(session: SessionUser | null): boolean {
  return Boolean(session && ADMIN_ROLES.has(session.role));
}
