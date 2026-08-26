import type { NextConfig } from "next";

/**
 * Security headers, applied to every response.
 *
 * These exist because "is my message encrypted in transit?" deserves an answer
 * that does not depend on the visitor typing `https://`. Vercel terminates TLS
 * and redirects plain HTTP, and the session cookie is `secure` so it never
 * travels unencrypted — but the redirect itself happens over HTTP the first
 * time somebody types a bare hostname, and that one request is interceptable.
 * HSTS closes that window: after the first visit the browser refuses to use
 * HTTP for this host at all.
 */
const securityHeaders = [
  {
    /**
     * Two years, subdomains included. Not `preload` — that submits the domain to
     * a browser-baked list that is slow and awkward to leave, and it should be a
     * deliberate decision made once the domain is settled, not a default.
     */
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    // A response is what its Content-Type says. Stops a browser deciding that an
    // uploaded file is HTML because its bytes look that way.
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // Nothing here is meant to be framed, and clickjacking a "confirm booking"
    // or "approve posting" button is the obvious use for it if it were.
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    /**
     * Full URL to our own origin, bare origin to anybody else.
     *
     * Paths here carry meaning — `/messages/<id>`, `/employers/dashboard/jobs/<id>` —
     * and leaking those to an external site somebody clicks through to would be a
     * small, silent disclosure of what a person was doing.
     */
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // No page here needs a camera, a microphone or a location.
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["pdf-parse", "mammoth", "bcryptjs"],
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  experimental: {
    // Route handlers stream AI responses; keep the default node runtime.
  },
};

export default nextConfig;
