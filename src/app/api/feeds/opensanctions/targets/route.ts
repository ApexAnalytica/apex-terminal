import { NextResponse } from "next/server";
import {
  OPENSANCTIONS_INDEX_URL,
  buildOpenSanctionsFeed,
  mockOpenSanctionsFeed,
  type OpenSanctionsFeed,
  type OpenSanctionsStatistics,
} from "@/lib/feeds/opensanctions";

// 24h: OpenSanctions republishes the consolidated dataset roughly daily,
// never minute-to-minute.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
// Shorter retry window when we had to fall back to mock.
const FALLBACK_TTL_MS = 60 * 60 * 1000;

const USER_AGENT = "apex-terminal/feed (sovereign-risk research)";

let cache: { feed: OpenSanctionsFeed; expiresAt: number } | null = null;

/**
 * Commercial-license gate. OpenSanctions consolidated data is CC-BY-NC 4.0
 * (NON-COMMERCIAL). The provider is registered unconditionally in
 * `FEED_PROVIDERS`, but this route refuses to contact OpenSanctions' servers
 * unless an operator has explicitly opted in via `OPENSANCTIONS_ENABLED`.
 * When unset, we serve the deterministic mock — no upstream fetch, so no
 * commercial use of the licensed dataset ever occurs on a deployment that
 * hasn't deliberately enabled it. Flip `OPENSANCTIONS_ENABLED=1` (e.g. on
 * Vercel) only once the non-commercial-license posture has been cleared.
 */
function opensanctionsEnabled(): boolean {
  return /^(1|true|yes|on)$/i.test(process.env.OPENSANCTIONS_ENABLED ?? "");
}

export async function GET() {
  const now = Date.now();

  if (!opensanctionsEnabled()) {
    // Hard off by default: never touch the CC-BY-NC upstream. Tag the source
    // "(mock — disabled)" so the UI shows an intentional mock (not a fallback
    // from an upstream failure) and the operator knows the gate is closed.
    const feed: OpenSanctionsFeed = {
      ...mockOpenSanctionsFeed(),
      source: "OpenSanctions consolidated (mock — disabled)",
    };
    return NextResponse.json(feed, {
      headers: {
        "x-feed-mode": "mock-disabled",
        // HTTP header values must be Latin-1 (ByteString) — no em-dash here.
        "x-feed-error":
          "opensanctions disabled: set OPENSANCTIONS_ENABLED to opt in (CC-BY-NC non-commercial)",
      },
    });
  }

  if (cache && cache.expiresAt > now) {
    return NextResponse.json(cache.feed, { headers: { "x-feed-cache": "hit" } });
  }

  // Operators can override the upstream index URL via env (e.g. point at a
  // private mirror); when unset, fall back to the canonical OpenSanctions URL.
  const indexUrl = process.env.OPENSANCTIONS_INDEX_URL || OPENSANCTIONS_INDEX_URL;

  const serveMock = (reason: string, extraHeaders: Record<string, string> = {}) => {
    const feed = mockOpenSanctionsFeed();
    cache = { feed, expiresAt: now + FALLBACK_TTL_MS };
    return NextResponse.json(feed, {
      headers: {
        "x-feed-cache": "miss",
        "x-feed-mode": "mock-fallback",
        "x-feed-error": reason.slice(0, 200),
        ...extraHeaders,
      },
    });
  };

  try {
    // Hop 1: the stable "latest" index → versioned statistics_url + last_change.
    const idxRes = await fetch(indexUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      headers: { "user-agent": USER_AGENT },
    });
    if (!idxRes.ok) {
      return serveMock(`index HTTP ${idxRes.status}`, {
        "x-feed-upstream-status": String(idxRes.status),
      });
    }
    const idx = (await idxRes.json()) as {
      statistics_url?: string;
      version?: string;
      last_change?: string;
      updated_at?: string;
    };
    const statsUrl = idx.statistics_url;
    if (!statsUrl) return serveMock("index missing statistics_url");

    // Hop 2: the versioned statistics.json → pre-aggregated per-country counts.
    const statsRes = await fetch(statsUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      headers: { "user-agent": USER_AGENT },
    });
    if (!statsRes.ok) {
      return serveMock(`stats HTTP ${statsRes.status}`, {
        "x-feed-upstream-status": String(statsRes.status),
      });
    }
    const stats = (await statsRes.json()) as OpenSanctionsStatistics;

    const feed = buildOpenSanctionsFeed(stats, {
      datasetVersion: idx.version ?? "unknown",
      observedAt: idx.last_change ?? idx.updated_at ?? new Date().toISOString(),
    });

    // Defensive zero-jurisdiction fallback: if the schema shifted and we
    // parsed nothing, serve mock so the engine path still exercises rather
    // than going silently empty.
    if (Object.keys(feed.jurisdictions).length === 0) {
      return serveMock("parsed-zero-jurisdictions");
    }

    cache = { feed, expiresAt: now + CACHE_TTL_MS };
    return NextResponse.json(feed, {
      headers: { "x-feed-cache": "miss", "x-feed-mode": "live" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return serveMock(message);
  }
}
