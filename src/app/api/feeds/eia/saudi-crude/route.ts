import { NextResponse } from "next/server";
import {
  buildEiaSaudiCrudeUrl,
  mockEiaSaudiCrudeFeed,
  parseEiaSaudiCrudeResponse,
  type EiaSaudiCrudeFeed,
} from "@/lib/feeds/eia-saudi-crude";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // EIA monthly with ~2-month lag

let cache: { feed: EiaSaudiCrudeFeed; expiresAt: number } | null = null;

export async function GET() {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return NextResponse.json(cache.feed, {
      headers: { "x-feed-cache": "hit" },
    });
  }

  const apiKey = process.env.EIA_API_KEY;
  if (!apiKey) {
    const feed = mockEiaSaudiCrudeFeed();
    cache = { feed, expiresAt: now + CACHE_TTL_MS };
    return NextResponse.json(feed, {
      headers: { "x-feed-cache": "miss", "x-feed-mode": "mock" },
    });
  }

  try {
    const upstreamRes = await fetch(buildEiaSaudiCrudeUrl(apiKey), {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!upstreamRes.ok) {
      // Mock-fallback on upstream error so the engine path still
      // exercises rather than going stale.
      const feed = mockEiaSaudiCrudeFeed();
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
    const feed = parseEiaSaudiCrudeResponse(json);
    cache = { feed, expiresAt: now + CACHE_TTL_MS };
    return NextResponse.json(feed, {
      headers: { "x-feed-cache": "miss", "x-feed-mode": "live" },
    });
  } catch {
    const feed = mockEiaSaudiCrudeFeed();
    cache = { feed, expiresAt: now + CACHE_TTL_MS };
    return NextResponse.json(feed, {
      headers: { "x-feed-cache": "miss", "x-feed-mode": "mock-fallback" },
    });
  }
}
