/**
 * OpenSanctions consolidated-sanctions feed — broadens the sovereign-risk
 * signal beyond US-only OFAC SDN with a globally-consolidated watchlist
 * (UN, EU, UK/OFSI, US OFAC and ~40 national sanctions lists, merged and
 * deduplicated by OpenSanctions).
 *
 * Source: the free, no-key OpenSanctions "Consolidated Sanctions" dataset,
 * published as static JSON at data.opensanctions.org. Updates roughly daily.
 *
 * ⚠ LICENSE GATE: the bulk dataset is CC-BY-NC 4.0 — free to access but
 * NON-COMMERCIAL. Manifold is a commercial product, so enabling this on prod
 * is a licensing decision (OpenSanctions sells a commercial license). That
 * is a partnerships / legal call, NOT an engineering one. This module is the
 * wiring; whether it ships to prod is gated on that decision. See
 * `session_partnerships.md` (OpenSanctions appears in the Bucket-1 data-in
 * tracker).
 *
 * The dataset's `statistics.json` carries a pre-aggregated per-country
 * breakdown of sanctioned *targets* (the deduplicated entities a list
 * actually designates, vs. every cross-reference). We surface that as a
 * per-jurisdiction count so the engine can flag high-J nodes whose
 * jurisdiction carries heavy global sanctions exposure — the consolidated
 * analogue to the OFAC SDN feed. Distinct `kind` ("watchlist") so a node can
 * carry BOTH the US-only OFAC program count and the global target count.
 */

export interface OpenSanctionsJurisdictionEntry {
  /** ISO-3166-1 alpha-2, UPPERCASE (OpenSanctions emits lowercase). */
  code: string;
  /** Display label, e.g. "Russia". */
  country: string;
  /** Deduplicated sanctioned targets registered to this jurisdiction. */
  targetCount: number;
}

export interface OpenSanctionsFeed {
  jurisdictions: Record<string, OpenSanctionsJurisdictionEntry>;
  /** Dataset-wide target count — denominator for a jurisdiction's global share. */
  totalTargets: number;
  /** OpenSanctions dataset version stamp, e.g. "20260531014701-oel". */
  datasetVersion: string;
  /** When we fetched. */
  fetchedAt: string;
  /** Upstream `last_change` — drives freshness/staleness downstream. */
  observedAt: string;
  /** Human-readable provenance. NEVER contains "(mock" for live data. */
  source: string;
}

/**
 * Stable "latest" index for the consolidated sanctions dataset. Keyless.
 * Carries the versioned `statistics_url` (where the per-country aggregate
 * lives) plus `version` and `last_change`. The route does a two-hop fetch:
 * this index first, then the `statistics_url` it points at.
 */
export const OPENSANCTIONS_INDEX_URL =
  "https://data.opensanctions.org/datasets/latest/sanctions/index.json";

/** Shape of the slice of `statistics.json` we consume (rest ignored). */
export interface OpenSanctionsStatistics {
  target_count?: number;
  targets?: {
    total?: number;
    countries?: Array<{ code?: string; count?: number; label?: string }>;
  };
}

/**
 * Normalize an OpenSanctions country code to an uppercase ISO-3166-1 alpha-2.
 * OpenSanctions emits lowercase ISO-2 (e.g. "ru") but its country buckets
 * also include historical / non-ISO tokens (e.g. "suhh" for the USSR, ""
 * for unattributed). We accept only clean two-letter codes — graph nodes
 * key off current real jurisdictions, so the long tail is noise here.
 */
export function normalizeCountryCode(raw: string | undefined): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(t) ? t : null;
}

/**
 * Build the feed payload from a parsed `statistics.json` object plus the
 * version/observed metadata pulled from the dataset index. Pure (no network)
 * so it's directly unit-testable.
 */
export function buildOpenSanctionsFeed(
  stats: OpenSanctionsStatistics,
  meta: { datasetVersion: string; observedAt: string },
): OpenSanctionsFeed {
  const jurisdictions: Record<string, OpenSanctionsJurisdictionEntry> = {};
  const countries = stats.targets?.countries ?? [];
  for (const c of countries) {
    if (!c || typeof c.count !== "number") continue;
    const code = normalizeCountryCode(c.code);
    if (!code) continue;
    // Defensive: if the same normalized code appears twice (shouldn't), keep
    // the larger count rather than clobbering.
    const existing = jurisdictions[code];
    if (existing && existing.targetCount >= c.count) continue;
    jurisdictions[code] = {
      code,
      country: c.label?.trim() || code,
      targetCount: c.count,
    };
  }
  const totalTargets =
    stats.target_count ??
    stats.targets?.total ??
    Object.values(jurisdictions).reduce((sum, j) => sum + j.targetCount, 0);
  return {
    jurisdictions,
    totalTargets,
    datasetVersion: meta.datasetVersion,
    fetchedAt: new Date().toISOString(),
    observedAt: meta.observedAt,
    source: `OpenSanctions consolidated (v${meta.datasetVersion})`,
  };
}

/**
 * Deterministic mock feed for dev environments where data.opensanctions.org
 * is unreachable. Tagged "(mock — upstream unreachable)" so it can never be
 * confused with real data downstream. Counts approximate a 2026 snapshot.
 */
export function mockOpenSanctionsFeed(): OpenSanctionsFeed {
  const now = new Date().toISOString();
  const jurisdictions: Record<string, OpenSanctionsJurisdictionEntry> = {
    RU: { code: "RU", country: "Russia", targetCount: 21333 },
    PK: { code: "PK", country: "Pakistan", targetCount: 4669 },
    CN: { code: "CN", country: "China", targetCount: 3190 },
    IR: { code: "IR", country: "Iran", targetCount: 2697 },
    UA: { code: "UA", country: "Ukraine", targetCount: 2523 },
    TR: { code: "TR", country: "Türkiye", targetCount: 1711 },
    AE: { code: "AE", country: "United Arab Emirates", targetCount: 1197 },
    KP: { code: "KP", country: "North Korea", targetCount: 612 },
    SY: { code: "SY", country: "Syria", targetCount: 503 },
    VE: { code: "VE", country: "Venezuela", targetCount: 287 },
  };
  const totalTargets = Object.values(jurisdictions).reduce(
    (sum, j) => sum + j.targetCount,
    0,
  );
  return {
    jurisdictions,
    totalTargets,
    datasetVersion: "mock",
    fetchedAt: now,
    observedAt: now,
    source: "OpenSanctions consolidated (mock — upstream unreachable)",
  };
}
