import { NextResponse } from "next/server";
import {
  FRED_SERIES,
  buildFredSeriesUrl,
  mockFredFeed,
  parseFredSeriesResponse,
  type FredFeed,
  type FredObservation,
} from "@/lib/feeds/fred";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h — most FRED series are daily/weekly

let cache: { feed: FredFeed; expiresAt: number } | null = null;

export async function GET() {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return NextResponse.json(cache.feed, { headers: { "x-feed-cache": "hit" } });
  }

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    const feed = mockFredFeed();
    cache = { feed, expiresAt: now + CACHE_TTL_MS };
    return NextResponse.json(feed, {
      headers: { "x-feed-cache": "miss", "x-feed-mode": "mock" },
    });
  }

  // Fetch all series in parallel; tolerate per-series failures.
  const results = await Promise.allSettled(
    FRED_SERIES.map(async (config) => {
      const url = buildFredSeriesUrl(config.id, apiKey, config.units);
      const res = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) throw new Error(`FRED ${config.id} ${res.status}`);
      const json = await res.json();
      return parseFredSeriesResponse(json, config);
    }),
  );

  const observations: FredObservation[] = [];
  let succeeded = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled" && r.value) {
      observations.push(r.value);
      succeeded += 1;
    }
  }

  // If literally none succeeded (FRED unreachable or key invalid), serve
  // mock so the engine path still exercises rather than going stale.
  if (succeeded === 0) {
    const feed = mockFredFeed();
    cache = { feed, expiresAt: now + 60 * 60 * 1000 }; // shorter retry on failure
    return NextResponse.json(feed, {
      headers: {
        "x-feed-cache": "miss",
        "x-feed-mode": "mock-fallback",
        "x-feed-error": `0/${FRED_SERIES.length} series fetched`,
      },
    });
  }

  const feed: FredFeed = {
    observations,
    fetchedAt: new Date(now).toISOString(),
  };
  cache = { feed, expiresAt: now + CACHE_TTL_MS };
  return NextResponse.json(feed, {
    headers: {
      "x-feed-cache": "miss",
      "x-feed-mode": "live",
      "x-feed-coverage": `${succeeded}/${FRED_SERIES.length}`,
    },
  });
}
