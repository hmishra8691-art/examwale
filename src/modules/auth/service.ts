import bcrypt from "bcryptjs";
import { and, eq, gt, isNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/db/client";
import { authSessions, passwordResetTokens, userProfiles, users } from "@/db/schema";
import { env } from "@/modules/shared/env";
import {
  ConflictError,
  UnauthorizedError,
  ValidationError,
} from "@/modules/shared/errors";
import { recordAudit } from "@/modules/shared/audit";
import {
  generateRefreshToken,
  hashToken,
  signAccessToken,
  type AccessClaims,
} from "@/modules/auth/tokens";

const BCRYPT_ROUNDS = 12;

/**
 * A real 12-round bcrypt hash of a value nobody knows, compared against when
 * the email doesn't exist so the endpoint takes the same time either way.
 *
 * It must be a *valid* 60-character hash: bcrypt rejects a malformed one on a
 * length check and returns immediately, which turns the login endpoint into a
 * user-enumeration timing oracle (~0 ms for unknown, ~300 ms for known).
 */
const DUMMY_PASSWORD_HASH = "$2b$12$ZV0mj9JzFC.hpCe0RlU1TuiMAy2WzNLvcn1X.uErv/k8vdLlydSgy";

export type SignedInSession = {
  accessToken: string;
  refreshToken: string;
  user: AccessClaims;
};

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Password rules kept deliberately short and explainable. Length does more for
 * real-world resistance than a thicket of character-class rules, and rules a
 * user can't predict just push them toward reusing a password they remember.
 */
export function assertPasswordStrength(password: string): void {
  if (password.length < 10) {
    throw new ValidationError("Use at least 10 characters for your password.");
  }
  if (password.length > 200) {
    throw new ValidationError("That password is too long — keep it under 200 characters.");
  }
  const common = ["password", "12345678", "qwertyui", "examwale"];
  if (common.some((entry) => password.toLowerCase().includes(entry))) {
    throw new ValidationError("That password is too easy to guess. Try something less common.");
  }
}

export async function signUp(input: {
  email: string;
  password: string;
  name?: string;
  ip?: string;
  userAgent?: string;
}): Promise<SignedInSession> {
  const email = normaliseEmail(input.email);
  assertPasswordStrength(input.password);

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) {
    throw new ConflictError("An account with that email already exists. Try signing in.");
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const [user] = await db
    .insert(users)
    .values({
      email,
      name: input.name?.trim() || null,
      passwordHash,
      authProvider: "password",
      lastLoginAt: new Date(),
    })
    .returning();

  // Every user gets a profile row immediately so the rest of the app can
  // assume it exists rather than defensively creating it on each write.
  await db
    .insert(userProfiles)
    .values({ userId: user.id, countryId: null })
    .onConflictDoNothing();

  await recordAudit({
    actorType: "user",
    actorId: user.id,
    action: "auth.signup",
    entityType: "user",
    entityId: user.id,
    ip: input.ip,
  });

  return issueSession(user, input);
}

export async function signIn(input: {
  email: string;
  password: string;
  ip?: string;
  userAgent?: string;
}): Promise<SignedInSession> {
  const email = normaliseEmail(input.email);
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });

  // Same error and comparable timing whether the account exists or not, so the
  // endpoint can't be used to enumerate registered email addresses.
  const hash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
  const valid = await bcrypt.compare(input.password, hash);

  if (!user || !user.passwordHash || !valid) {
    throw new UnauthorizedError("That email and password don't match an account.");
  }

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  await recordAudit({
    actorType: "user",
    actorId: user.id,
    action: "auth.signin",
    entityType: "user",
    entityId: user.id,
    ip: input.ip,
  });

  return issueSession(user, input);
}

/** Used by the Google callback; creates the account on first sign-in. */
export async function signInWithProvider(input: {
  email: string;
  name?: string | null;
  provider: string;
  providerId: string;
  ip?: string;
  userAgent?: string;
}): Promise<SignedInSession> {
  const email = normaliseEmail(input.email);
  let user = await db.query.users.findFirst({ where: eq(users.email, email) });

  if (!user) {
    const [inserted] = await db
      .insert(users)
      .values({
        email,
        name: input.name ?? null,
        authProvider: input.provider,
        providerId: input.providerId,
        emailVerified: true,
        lastLoginAt: new Date(),
      })
      .returning();
    user = inserted;
    await db.insert(userProfiles).values({ userId: user.id }).onConflictDoNothing();
  } else {
    await db
      .update(users)
      .set({ lastLoginAt: new Date(), emailVerified: true })
      .where(eq(users.id, user.id));
  }

  await recordAudit({
    actorType: "user",
    actorId: user.id,
    action: `auth.signin.${input.provider}`,
    entityType: "user",
    entityId: user.id,
    ip: input.ip,
  });

  return issueSession(user, input);
}

async function issueSession(
  user: typeof users.$inferSelect,
  meta: { ip?: string; userAgent?: string },
): Promise<SignedInSession> {
  const claims: AccessClaims = {
    sub: user.id,
    email: user.email,
    role: user.role,
    plan: user.plan,
    name: user.name,
  };

  const accessToken = await signAccessToken(claims);
  const { token: refreshToken, hash } = generateRefreshToken();

  await db.insert(authSessions).values({
    userId: user.id,
    refreshTokenHash: hash,
    userAgent: meta.userAgent ?? null,
    ip: meta.ip ?? null,
    expiresAt: new Date(Date.now() + env.refreshTtlSeconds * 1000),
  });

  return { accessToken, refreshToken, user: claims };
}

/** Rotates the refresh token on every use, so a stolen token is single-use. */
export async function refreshSession(refreshToken: string): Promise<SignedInSession> {
  const hash = hashToken(refreshToken);
  const session = await db.query.authSessions.findFirst({
    where: and(
      eq(authSessions.refreshTokenHash, hash),
      isNull(authSessions.revokedAt),
      gt(authSessions.expiresAt, new Date()),
    ),
  });
  if (!session) throw new UnauthorizedError("Your session has expired. Please sign in again.");

  const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) });
  if (!user) throw new UnauthorizedError("Your session has expired. Please sign in again.");

  await db
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(eq(authSessions.id, session.id));

  return issueSession(user, { ip: session.ip ?? undefined, userAgent: session.userAgent ?? undefined });
}

export async function revokeSession(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  await db
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(eq(authSessions.refreshTokenHash, hashToken(refreshToken)));
}

/**
 * Always resolves, whether or not the address is registered — the caller shows
 * the same "check your inbox" message either way, so the endpoint can't be used
 * to discover which addresses have accounts.
 */
export async function requestPasswordReset(email: string): Promise<{ token?: string }> {
  const user = await db.query.users.findFirst({ where: eq(users.email, normaliseEmail(email)) });
  if (!user) return {};

  const token = randomBytes(32).toString("base64url");
  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  // Wiring an email provider is a deployment concern; the token is returned to
  // the caller so a dev environment can complete the flow without one.
  return { token };
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  assertPasswordStrength(newPassword);
  const record = await db.query.passwordResetTokens.findFirst({
    where: and(
      eq(passwordResetTokens.tokenHash, hashToken(token)),
      isNull(passwordResetTokens.usedAt),
      gt(passwordResetTokens.expiresAt, new Date()),
    ),
  });
  if (!record) throw new ValidationError("That reset link is invalid or has expired.");

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await db.update(users).set({ passwordHash }).where(eq(users.id, record.userId));
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, record.id));

  // A password change invalidates every existing session.
  await db
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(eq(authSessions.userId, record.userId));

  await recordAudit({
    actorType: "user",
    actorId: record.userId,
    action: "auth.password_reset",
    entityType: "user",
    entityId: record.userId,
  });
}
