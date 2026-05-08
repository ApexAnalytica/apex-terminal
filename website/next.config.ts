import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
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
