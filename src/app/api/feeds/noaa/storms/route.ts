import { NextResponse } from "next/server";
import {
  buildNoaaStormsUrl,
  mockNoaaStormsFeed,
  parseNoaaStormsResponse,
  type NoaaStormsFeed,
} from "@/lib/feeds/noaa-storms";

// NHC publishes ~every 6h during active systems; we hold a 1h server cache.
const CACHE_TTL_MS = 60 * 60 * 1000;

let cache: { feed: NoaaStormsFeed; expiresAt: number } | null = null;

export async function GET() {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return NextResponse.json(cache.feed, {
      headers: { "x-feed-cache": "hit" },
    });
  }

  try {
    const upstreamRes = await fetch(buildNoaaStormsUrl(), {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!upstreamRes.ok) {
      const feed = mockNoaaStormsFeed();
      cache = { feed, expiresAt: now + CACHE_TTL_MS };
      return NextResponse.json(feed, {
        headers: {
          "x-feed-cache": "miss",
          "x-feed-mode": "mock-fallback",
          "x-upstream-status": String(upstreamRes.status),
        },
      });
    }
    const json = await upstreamRes.json();
    const feed = parseNoaaStormsResponse(json);
    cache = { feed, expiresAt: now + CACHE_TTL_MS };
    return NextResponse.json(feed, {
      headers: { "x-feed-cache": "miss", "x-feed-mode": "live" },
    });
  } catch {
    // Upstream unreachable — serve mock so the engine path still exercises.
    const feed = mockNoaaStormsFeed();
    cache = { feed, expiresAt: now + CACHE_TTL_MS };
    return NextResponse.json(feed, {
      headers: { "x-feed-cache": "miss", "x-feed-mode": "mock-fallback" },
    });
  }
}
