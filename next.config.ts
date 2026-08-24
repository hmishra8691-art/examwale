import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["pdf-parse", "mammoth", "bcryptjs"],
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Route handlers stream AI responses; keep the default node runtime.
  },
};

export default nextConfig;
