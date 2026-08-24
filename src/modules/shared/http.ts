import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, RateLimitError, ValidationError } from "@/modules/shared/errors";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, { status: 200, ...init });
}

export function created<T>(data: T) {
  return NextResponse.json({ data }, { status: 201 });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

/**
 * Single place where an exception becomes an HTTP response, so every route
 * reports failures the same way and nothing leaks a stack trace to a client.
 */
export function fail(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Some fields need attention.",
          fields: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
      { status: 422 },
    );
  }

  if (error instanceof RateLimitError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
    );
  }

  if (error instanceof AppError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }

  console.error("[unhandled]", error);
  return NextResponse.json(
    { error: { code: "internal_error", message: "Something went wrong on our side." } },
    { status: 500 },
  );
}

/** Wraps a route handler so thrown domain errors become clean responses. */
export function route<A extends unknown[]>(
  handler: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (error) {
      return fail(error);
    }
  };
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }
}

/**
 * Best-effort client IP, used as a rate-limit key.
 *
 * `X-Forwarded-For` is client-supplied and trivially spoofed unless a proxy you
 * control overwrites it. Honouring it is therefore opt-in via TRUST_PROXY, so a
 * deployment that is directly reachable doesn't silently hand attackers a way
 * to rotate past every IP-keyed limit by varying a header.
 *
 * With TRUST_PROXY set to a hop count, we take the entry that many positions
 * from the right — the ones your own proxies appended — rather than the
 * leftmost, which is whatever the client claimed.
 */
export function clientIp(request: Request): string | undefined {
  const hops = Number(process.env.TRUST_PROXY ?? 0);

  if (Number.isFinite(hops) && hops > 0) {
    const chain = (request.headers.get("x-forwarded-for") ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (chain.length) {
      return chain[Math.max(0, chain.length - hops)] ?? chain[chain.length - 1];
    }
    const real = request.headers.get("x-real-ip");
    if (real) return real.trim();
  }

  // No trusted proxy configured: fall back to a constant so the limiter still
  // applies globally rather than being bypassed per forged header.
  return undefined;
}
