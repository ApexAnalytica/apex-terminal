import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
    // IntroOverlay renders the mantis at quality 92; Next 16 only serves
    // qualities listed here (anything else 400s in production — the
    // intro logo was live-broken until this was added, 2026-06-11).
    qualities: [75, 92],
    remotePatterns: [
      { protocol: "https", hostname: "apexanalytica.co" },
    ],
  },
  // Scope the workspace to this folder so Next doesn't pick up the parent
  // apex-terminal repo (which has its own src/, lockfile, and middleware).
  turbopack: {
    root: path.resolve(__dirname),
  },
  outputFileTracingRoot: path.resolve(__dirname),
};

export default nextConfig;
