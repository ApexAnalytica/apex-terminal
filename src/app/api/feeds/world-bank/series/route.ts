import { NextResponse } from "next/server";
import {
  WB_SERIES,
  buildWbSeriesUrl,
  mockWorldBankFeed,
  parseWbSeriesResponse,
  type WorldBankFeed,
  type WbObservation,
} from "@/lib/feeds/world-bank";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — WB indicators are typically annual

let cache: { feed: WorldBankFeed; expiresAt: number } | null = null;

export async function GET() {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return NextResponse.json(cache.feed, { headers: { "x-feed-cache": "hit" } });
  }

  // No API key needed for World Bank — keyless / anonymous. Allows operators
  // to point at a private mirror via env override if needed.
  const baseOverride = process.env.WORLD_BANK_BASE_URL;

  const results = await Promise.allSettled(
    WB_SERIES.map(async (config) => {
      const url = baseOverride
        ? `${baseOverride}/country/${config.country}/indicator/${config.indicator}?format=json&per_page=5&mrnev=1`
        : buildWbSeriesUrl(config.country, config.indicator);
      const res = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`WB ${config.country}/${config.indicator} ${res.status}`);
      const json = await res.json();
      return parseWbSeriesResponse(json, config);
    }),
  );

  const observations: WbObservation[] = [];
  let succeeded = 0;
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) {
      observations.push(r.value);
      succeeded += 1;
    }
  }

  if (succeeded === 0) {
    const feed = mockWorldBankFeed();
    cache = { feed, expiresAt: now + 60 * 60 * 1000 };
    return NextResponse.json(feed, {
      headers: {
        "x-feed-cache": "miss",
        "x-feed-mode": "mock-fallback",
        "x-feed-error": `0/${WB_SERIES.length} series fetched`,
      },
    });
  }

  const feed: WorldBankFeed = {
    observations,
    fetchedAt: new Date(now).toISOString(),
  };
  cache = { feed, expiresAt: now + CACHE_TTL_MS };
  return NextResponse.json(feed, {
    headers: {
      "x-feed-cache": "miss",
      "x-feed-mode": "live",
      "x-feed-coverage": `${succeeded}/${WB_SERIES.length}`,
    },
  });
}
