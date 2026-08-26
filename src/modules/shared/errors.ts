/** Domain errors carry an HTTP status so route handlers stay thin. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, status = 400, code = "bad_request", details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, "validation_error", details);
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "You need to sign in to do that.") {
    super(message, 401, "unauthorized");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You don't have access to that.") {
    super(message, 403, "forbidden");
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "We couldn't find that.") {
    super(message, 404, "not_found");
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "conflict");
    this.name = "ConflictError";
  }
}

export class RateLimitError extends AppError {
  readonly retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds = 60) {
    super(message, 429, "rate_limited");
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * The Postgres error code behind a thrown error, if there is one.
 *
 * Drizzle wraps a driver error in its own `Error` and hangs the original off
 * `cause`, so `(error as {code}).code` — the obvious thing to write, and what
 * two call sites here did write — is always undefined. The unique-violation
 * branch guarding those inserts therefore never ran: a genuine race for a
 * mentorship slot returned a 500 with a Postgres constraint name in the
 * response instead of "that slot has just been taken".
 *
 * Walks the cause chain rather than checking one level, because a wrapper may
 * itself be wrapped, and stops at a small depth so a cyclic cause cannot spin.
 */
export function postgresErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Postgres 23505: unique constraint violated. */
export const PG_UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(error: unknown): boolean {
  return postgresErrorCode(error) === PG_UNIQUE_VIOLATION;
}
