import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes } from "node:crypto";
import { env } from "@/modules/shared/env";

export type AccessClaims = {
  sub: string;
  email: string;
  role: "SEEKER" | "ORG_MEMBER" | "ADMIN" | "SUPER_ADMIN";
  plan: "FREE" | "PREMIUM" | "B2B";
  name?: string | null;
};

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.authSecret);
}

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  return new SignJWT({
    email: claims.email,
    role: claims.role,
    plan: claims.plan,
    name: claims.name ?? null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer("examwale")
    .setAudience("examwale-web")
    .setExpirationTime(`${env.accessTtlSeconds}s`)
    .sign(secretKey());
}

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: "examwale",
      audience: "examwale-web",
    });
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      email: String(payload.email ?? ""),
      role: (payload.role as AccessClaims["role"]) ?? "SEEKER",
      plan: (payload.plan as AccessClaims["plan"]) ?? "FREE",
      name: (payload.name as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

/** Refresh tokens are opaque; only their hash is stored, so a DB leak is not a session leak. */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(48).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
