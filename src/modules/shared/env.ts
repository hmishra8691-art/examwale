/**
 * Typed environment access.
 *
 * Reads lazily so the module graph can be imported at build time without a
 * populated environment, and fails loudly at first use instead of silently
 * falling back to a wrong default.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get authSecret() {
    return required("AUTH_SECRET");
  },
  get accessTtlSeconds() {
    return num("AUTH_ACCESS_TTL_SECONDS", 900);
  },
  get refreshTtlSeconds() {
    return num("AUTH_REFRESH_TTL_SECONDS", 2_592_000);
  },
  get googleClientId() {
    return optional("GOOGLE_CLIENT_ID");
  },
  get googleClientSecret() {
    return optional("GOOGLE_CLIENT_SECRET");
  },
  get googleRedirectUri() {
    return optional("GOOGLE_REDIRECT_URI", "http://localhost:3000/api/v1/auth/google/callback");
  },
  get googleEnabled() {
    return Boolean(optional("GOOGLE_CLIENT_ID") && optional("GOOGLE_CLIENT_SECRET"));
  },
  get anthropicApiKey() {
    return optional("ANTHROPIC_API_KEY");
  },
  get aiModel() {
    return optional("AI_MODEL", "claude-sonnet-4-5");
  },
  get aiFreeDailyLimit() {
    return num("AI_FREE_DAILY_MESSAGE_LIMIT", 15);
  },
  get aiPremiumDailyLimit() {
    return num("AI_PREMIUM_DAILY_MESSAGE_LIMIT", 500);
  },
  /**
   * 'postgres' | 'local'.
   *
   * Defaults to postgres because it works on every host without extra
   * configuration. 'local' is a development convenience and is refused outright
   * on a serverless host, where it would silently discard every upload.
   */
  get storageDriver() {
    return optional("STORAGE_DRIVER", "postgres");
  },
  get storageLocalDir() {
    return optional("STORAGE_LOCAL_DIR", "./.storage");
  },
  get maxUploadBytes() {
    return num("MAX_UPLOAD_BYTES", 10 * 1024 * 1024);
  },
  /**
   * Shared secret for the scheduled-task endpoint.
   *
   * Empty means scheduled tasks are disabled and the route refuses every call.
   * Failing closed matters here: the endpoint sends email and writes rows, so an
   * unset variable must not leave a public trigger behind.
   */
  get cronSecret() {
    return optional("CRON_SECRET");
  },
  get appUrl() {
    return optional("APP_URL", "http://localhost:3000");
  },
  get defaultCountry() {
    return optional("DEFAULT_COUNTRY", "IN");
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
};
