import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

// Wrap the export with the bundle analyzer. It's a no-op unless
// ANALYZE=true is set at build time, so production builds on Vercel
// are unaffected.
//   ANALYZE=true npm run build   → opens treemap of client + server
//                                  bundles in the default browser.
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  // Enable gzip/brotli compression for served assets
  compress: true,

  // next/image optimization defaults (formats, device sizes)
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },

  // Inline critical CSS to cut render-blocking stylesheets
  experimental: {
    optimizeCss: true,
  },
};

export default withBundleAnalyzer(nextConfig);
