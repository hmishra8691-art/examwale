/**
 * Post-authentication redirect targets.
 *
 * `next` reaches us from a query string, which means an attacker controls it. A
 * link to the genuine sign-in page that lands the user on a look-alike domain
 * afterwards is a credible phishing vector precisely because the domain in the
 * link is real. Only same-origin paths get through; anything else falls back.
 */
const DEFAULT_TARGET = "/dashboard";

// Matches C0 controls and DEL, which can be used to smuggle a header or
// confuse a URL parser downstream.
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;

export function safeRedirectPath(
  value: string | undefined | null,
  fallback = DEFAULT_TARGET,
): string {
  if (!value) return fallback;

  // Must be a root-relative path. Rejects "https://evil.tld", "//evil.tld"
  // (protocol-relative) and "/\evil.tld" (browsers normalise the backslash).
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;

  // A scheme before the first slash means it isn't really a path.
  if (/^\/[^/]*:/.test(value)) return fallback;

  if (CONTROL_CHARACTERS.test(value)) return fallback;

  return value;
}
