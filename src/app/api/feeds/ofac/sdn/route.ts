import { NextResponse } from "next/server";
import {
  OFAC_SDN_URL,
  mockOfacSdnFeed,
  parseOfacSdnCsv,
  type OfacSdnFeed,
} from "@/lib/feeds/ofac-sdn";

// 24h: OFAC publishes new tranches several times a week, never minute-to-minute.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let cache: { feed: OfacSdnFeed; expiresAt: number } | null = null;

export async function GET() {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return NextResponse.json(cache.feed, { headers: { "x-feed-cache": "hit" } });
  }

  // Operators can override the upstream URL via env (e.g. point to a private
  // mirror); when unset, fall back to the canonical Treasury URL.
  const upstream = process.env.OFAC_SDN_URL || OFAC_SDN_URL;

  try {
    const upstreamRes = await fetch(upstream, {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      headers: { "user-agent": "apex-terminal/feed (compliance research)" },
    });
    if (!upstreamRes.ok) {
      // Treasury sometimes 403s on bot UAs; fall back to mock so the engine
      // path still exercises rather than 502'ing the whole UI.
      const feed = mockOfacSdnFeed();
      cache = { feed, expiresAt: now + 60 * 60 * 1000 }; // shorter retry on failure
      return NextResponse.json(feed, {
        headers: {
          "x-feed-cache": "miss",
          "x-feed-mode": "mock-fallback",
          "x-feed-upstream-status": String(upstreamRes.status),
        },
      });
    }
    const csv = await upstreamRes.text();
    const feed = parseOfacSdnCsv(csv);
    // Defensive zero-entry fallback: Treasury has occasionally returned an
    // HTML redirect page or an empty CSV under maintenance. If we got 200 OK
    // but no jurisdictions parsed out, treat it as a parse failure and serve
    // mock so the engine path still exercises rather than going stale.
    if (Object.keys(feed.jurisdictions).length === 0) {
      const mock = mockOfacSdnFeed();
      cache = { feed: mock, expiresAt: now + 60 * 60 * 1000 };
      return NextResponse.json(mock, {
        headers: {
          "x-feed-cache": "miss",
          "x-feed-mode": "mock-fallback",
          "x-feed-error": `parsed-zero-jurisdictions (csv-len=${csv.length})`,
        },
      });
    }
    cache = { feed, expiresAt: now + CACHE_TTL_MS };
    return NextResponse.json(feed, {
      headers: { "x-feed-cache": "miss", "x-feed-mode": "live" },
    });
  } catch (err) {
    // Network failure / timeout — serve mock and shorten TTL so we retry sooner.
    const feed = mockOfacSdnFeed();
    cache = { feed, expiresAt: now + 60 * 60 * 1000 };
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json(feed, {
      headers: {
        "x-feed-cache": "miss",
        "x-feed-mode": "mock-fallback",
        "x-feed-error": message.slice(0, 200),
      },
    });
  }
}
