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

// Security headers applied to every response. Split out so the policy
// is reviewable in one place and the next.config object stays scannable.
//
//   X-Frame-Options       Manifold is never embedded in another origin's
//                         frame. DENY removes the clickjacking surface
//                         entirely. frame-ancestors in the CSP below is
//                         the modern equivalent; we ship both for older
//                         clients.
//   X-Content-Type-Options
//                         Prevents MIME sniffing on uploaded artefacts
//                         (CSV / XLSX / PDF imports). Browsers must
//                         honour the Content-Type the server sent.
//   Referrer-Policy       Don't leak full URLs to third-party trackers
//                         on outbound clicks (the docs drawer's external
//                         links, copilot citation links, etc.).
//   Permissions-Policy    Explicitly disable browser APIs we never use.
//                         interest-cohort=() opts out of FLoC.
//   Strict-Transport-Security
//                         Force HTTPS for a year. The Vercel cert + redirect
//                         already do this; HSTS makes downgrade attacks
//                         visible to the browser, not just the server.
//
// Content-Security-Policy intentionally OMITTED for now: the app pulls
// from Supabase, Vercel analytics, multiple LLM endpoints (Anthropic,
// Gemini, OpenAI), Mapbox tiles, font CDNs, and inlines a small boot
// script for text-size restoration. A wrong CSP breaks more than it
// protects. We'll add it in a follow-up via Content-Security-Policy-
// Report-Only first, collect violation reports for a couple of days,
// then tighten and flip to enforcing mode.
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

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

  async headers() {
    return [
      {
        // All routes including API.
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
