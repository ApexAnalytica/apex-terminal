import { NextResponse } from "next/server";
import {
  OPENFDA_QUERIES,
  buildOpenFdaUrl,
  mockOpenFdaFeed,
  parseOpenFdaResponse,
  type OpenFdaFeed,
  type OpenFdaObservation,
} from "@/lib/feeds/openfda";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h — FAERS publishes quarterly

let cache: { feed: OpenFdaFeed; expiresAt: number } | null = null;

export async function GET() {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return NextResponse.json(cache.feed, { headers: { "x-feed-cache": "hit" } });
  }

  // OpenFDA accepts an optional API key for higher rate limits. The query
  // parameter is `?api_key=…`. Without it, the public limit is sufficient
  // for the 2 queries we run on a 6h cadence.
  const apiKey = process.env.OPENFDA_API_KEY;

  const results = await Promise.allSettled(
    OPENFDA_QUERIES.map(async (config) => {
      let url = buildOpenFdaUrl(config);
      if (apiKey) url += `&api_key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      // OpenFDA returns 404 when there are zero results — treat that as
      // a legitimate observation with count=0 rather than a fetch failure.
      if (res.status === 404) {
        return {
          queryId: config.id,
          label: config.label,
          value: 0,
          unit: config.unit,
          capacity: config.capacity,
          observedAt: new Date().toISOString(),
          source: `OpenFDA · ${config.id} (FAERS, no matches)`,
        };
      }
      if (!res.ok) throw new Error(`OpenFDA ${config.id} ${res.status}`);
      const json = await res.json();
      return parseOpenFdaResponse(json, config);
    }),
  );

  const observations: OpenFdaObservation[] = [];
  let succeeded = 0;
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) {
      observations.push(r.value);
      succeeded += 1;
    }
  }

  if (succeeded === 0) {
    const feed = mockOpenFdaFeed();
    cache = { feed, expiresAt: now + 60 * 60 * 1000 };
    return NextResponse.json(feed, {
      headers: {
        "x-feed-cache": "miss",
        "x-feed-mode": "mock-fallback",
        "x-feed-error": `0/${OPENFDA_QUERIES.length} queries fetched`,
      },
    });
  }

  const feed: OpenFdaFeed = {
    observations,
    fetchedAt: new Date(now).toISOString(),
  };
  cache = { feed, expiresAt: now + CACHE_TTL_MS };
  return NextResponse.json(feed, {
    headers: {
      "x-feed-cache": "miss",
      "x-feed-mode": "live",
      "x-feed-coverage": `${succeeded}/${OPENFDA_QUERIES.length}`,
    },
  });
}
