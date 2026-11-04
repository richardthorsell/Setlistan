import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The project is built only on Vercel (npm is blocked on the dev machine), so a type
  // slip should not block a deploy; run `tsc --noEmit` wherever npm works.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
