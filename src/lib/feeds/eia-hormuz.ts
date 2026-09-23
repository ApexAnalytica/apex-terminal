/**
 * EIA Persian Gulf crude production feed — proxy for Strait of Hormuz throughput.
 *
 * EIA v2 international/data series for crude oil production by country, summed
 * across the six Persian Gulf producers whose seaborne exports transit Hormuz
 * (~85% pass through the strait per EIA chokepoint reports).
 *
 * Capacity is fixed at 21 mb/d, the figure EIA cites as Hormuz transit
 * capacity in its World Oil Transit Chokepoints reporting.
 *
 * EIA publishes this series monthly with a ~2-month lag; the proxy route
 * caches upstream responses for 6 hours.
 */
import type { LiveDataPoint } from "@/lib/types";

/** EIA productId 53 = Crude oil including lease condensate */
const PRODUCT_ID = "53";
/** EIA activityId 1 = Production */
const ACTIVITY_ID = "1";
/** ISO-3 country codes for the six Persian Gulf producers */
const PERSIAN_GULF_COUNTRIES = ["SAU", "ARE", "IRN", "IRQ", "KWT", "QAT"] as const;
/** EIA's stated Strait of Hormuz transit capacity, mb/d */
export const HORMUZ_CAPACITY_MBD = 21;
/** Fraction of regional production that physically transits Hormuz */
const HORMUZ_TRANSIT_FRACTION = 0.85;

export interface EiaHormuzFeed extends LiveDataPoint {
  /** Per-country breakdown for traceability in the UI */
  breakdown: { country: string; valueMbd: number }[];
}

/**
 * Build an EIA v2 international/data URL summing crude production for the six
 * Persian Gulf producers, sorted by period descending so the latest value
 * appears first.
 */
export function buildEiaHormuzUrl(apiKey: string): string {
  const base = "https://api.eia.gov/v2/international/data/";
  const params = new URLSearchParams();
  params.set("api_key", apiKey);
  params.set("frequency", "monthly");
  params.append("data[0]", "value");
  params.append("facets[productId][]", PRODUCT_ID);
  params.append("facets[activityId][]", ACTIVITY_ID);
  for (const c of PERSIAN_GULF_COUNTRIES) {
    params.append("facets[countryRegionId][]", c);
  }
  params.append("sort[0][column]", "period");
  params.append("sort[0][direction]", "desc");
  params.set("offset", "0");
  params.set("length", String(PERSIAN_GULF_COUNTRIES.length * 2));
  return `${base}?${params.toString()}`;
}

interface EiaResponseRow {
  period: string;
  countryRegionId: string;
  countryRegionName?: string;
  value: number | string | null;
  unit?: string;
}

interface EiaResponseEnvelope {
  response?: { data?: EiaResponseRow[] };
}

/**
 * Pick the latest period present in the response, sum value across all
 * countries within that period, scale by Hormuz transit fraction, and emit a
 * normalized `EiaHormuzFeed`. Defensive against missing fields and string
 * values so a benign upstream change can't 500 us.
 */
export function parseEiaHormuzResponse(raw: unknown): EiaHormuzFeed {
  const envelope = raw as EiaResponseEnvelope;
  const rows = envelope?.response?.data ?? [];
  if (rows.length === 0) throw new Error("EIA response had no data rows");

  const latestPeriod = rows[0]?.period;
  if (!latestPeriod) throw new Error("EIA response missing period field");

  const inLatest = rows.filter((r) => r.period === latestPeriod);
  const breakdown: { country: string; valueMbd: number }[] = [];
  let totalKbd = 0;
  for (const row of inLatest) {
    const v = typeof row.value === "string" ? parseFloat(row.value) : row.value;
    if (!Number.isFinite(v) || v == null) continue;
    totalKbd += v as number;
    breakdown.push({
      country: row.countryRegionName ?? row.countryRegionId,
      valueMbd: +((v as number) / 1000).toFixed(3),
    });
  }
  const throughputMbd = +(totalKbd / 1000 * HORMUZ_TRANSIT_FRACTION).toFixed(3);

  return {
    kind: "throughput",
    value: throughputMbd,
    capacity: HORMUZ_CAPACITY_MBD,
    unit: "mb/d",
    observedAt: periodToIso(latestPeriod),
    source: `EIA v2 / Persian Gulf producers (period ${latestPeriod})`,
    breakdown,
  };
}

/**
 * Deterministic mock feed — used when EIA_API_KEY is unset so contributors can
 * exercise the live-data path without registering for an API key. The value
 * sits at 88% of capacity so a small perturbation can flip A-04 in demos.
 *
 * Source string is explicitly tagged "(mock)" so it can never be confused with
 * real EIA data downstream.
 */
export function mockEiaHormuzFeed(): EiaHormuzFeed {
  const observedAt = new Date().toISOString();
  return {
    kind: "throughput",
    value: 18.5,
    capacity: HORMUZ_CAPACITY_MBD,
    unit: "mb/d",
    observedAt,
    source: "EIA v2 / Persian Gulf producers (mock — EIA_API_KEY unset)",
    breakdown: [
      { country: "Saudi Arabia", valueMbd: 9.1 },
      { country: "Iraq", valueMbd: 4.3 },
      { country: "United Arab Emirates", valueMbd: 3.2 },
      { country: "Kuwait", valueMbd: 2.6 },
      { country: "Iran", valueMbd: 2.3 },
      { country: "Qatar", valueMbd: 0.6 },
    ],
  };
}

/** "2025-01" → "2025-01-01T00:00:00.000Z" */
function periodToIso(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return new Date().toISOString();
  return new Date(`${m[1]}-${m[2]}-01T00:00:00Z`).toISOString();
}
