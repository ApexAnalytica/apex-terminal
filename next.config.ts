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

  // Inline critical CSS to cut render-blocking stylesheets.
  //
  // turbopackUseSystemTlsCerts: Next 16's default Turbopack builder
  // hits a TLS-cert resolution bug when fetching Google Fonts during
  // production build, causing Vercel deploys to fail with
  // "Failed to fetch `<font>` from Google Fonts" on every PR. Setting
  // this flag points Turbopack at the system CA bundle. The build
  // script also passes --webpack as a belt-and-suspenders fallback
  // (Next 16 supports --webpack to opt out of Turbopack entirely),
  // so production deploys bypass the bug regardless of whether
  // this flag takes effect in the Vercel build environment.
  experimental: {
    optimizeCss: true,
    turbopackUseSystemTlsCerts: true,
  },
};

export default nextConfig;
