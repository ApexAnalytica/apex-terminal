import type { NextConfig } from "next";

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

export default nextConfig;
