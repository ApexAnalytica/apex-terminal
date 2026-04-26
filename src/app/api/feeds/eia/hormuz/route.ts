import { NextResponse } from "next/server";
import {
  buildEiaHormuzUrl,
  mockEiaHormuzFeed,
  parseEiaHormuzResponse,
  type EiaHormuzFeed,
} from "@/lib/feeds/eia-hormuz";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // EIA refreshes monthly with lag

let cache: { feed: EiaHormuzFeed; expiresAt: number } | null = null;

export async function GET() {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return NextResponse.json(cache.feed, {
      headers: { "x-feed-cache": "hit" },
    });
  }

  const apiKey = process.env.EIA_API_KEY;
  if (!apiKey) {
    const feed = mockEiaHormuzFeed();
    cache = { feed, expiresAt: now + CACHE_TTL_MS };
    return NextResponse.json(feed, {
      headers: { "x-feed-cache": "miss", "x-feed-mode": "mock" },
    });
  }

  try {
    const upstreamRes = await fetch(buildEiaHormuzUrl(apiKey), {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!upstreamRes.ok) {
      const body = await upstreamRes.text().catch(() => "");
      return NextResponse.json(
        { error: `EIA upstream ${upstreamRes.status}`, detail: body.slice(0, 300) },
        { status: 502 },
      );
    }
    const json = await upstreamRes.json();
    const feed = parseEiaHormuzResponse(json);
    cache = { feed, expiresAt: now + CACHE_TTL_MS };
    return NextResponse.json(feed, {
      headers: { "x-feed-cache": "miss", "x-feed-mode": "live" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json(
      { error: "EIA fetch failed", detail: message },
      { status: 502 },
    );
  }
}
