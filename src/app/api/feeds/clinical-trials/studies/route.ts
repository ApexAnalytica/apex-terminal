import { NextResponse } from "next/server";
import {
  CLINICAL_TRIALS_QUERIES,
  buildClinicalTrialsUrl,
  mockClinicalTrialsFeed,
  parseClinicalTrialsResponse,
  type ClinicalTrialsFeed,
  type ClinicalTrialsObservation,
} from "@/lib/feeds/clinical-trials";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h — trial counts move slowly

let cache: { feed: ClinicalTrialsFeed; expiresAt: number } | null = null;

export async function GET() {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return NextResponse.json(cache.feed, { headers: { "x-feed-cache": "hit" } });
  }

  const results = await Promise.allSettled(
    CLINICAL_TRIALS_QUERIES.map(async (config) => {
      const url = buildClinicalTrialsUrl(config);
      const res = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`ClinicalTrials ${config.id} ${res.status}`);
      const json = await res.json();
      return parseClinicalTrialsResponse(json, config);
    }),
  );

  const observations: ClinicalTrialsObservation[] = [];
  let succeeded = 0;
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) {
      observations.push(r.value);
      succeeded += 1;
    }
  }

  if (succeeded === 0) {
    const feed = mockClinicalTrialsFeed();
    cache = { feed, expiresAt: now + 60 * 60 * 1000 };
    return NextResponse.json(feed, {
      headers: {
        "x-feed-cache": "miss",
        "x-feed-mode": "mock-fallback",
        "x-feed-error": `0/${CLINICAL_TRIALS_QUERIES.length} queries fetched`,
      },
    });
  }

  const feed: ClinicalTrialsFeed = {
    observations,
    fetchedAt: new Date(now).toISOString(),
  };
  cache = { feed, expiresAt: now + CACHE_TTL_MS };
  return NextResponse.json(feed, {
    headers: {
      "x-feed-cache": "miss",
      "x-feed-mode": "live",
      "x-feed-coverage": `${succeeded}/${CLINICAL_TRIALS_QUERIES.length}`,
    },
  });
}
