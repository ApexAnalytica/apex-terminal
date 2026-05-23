/**
 * EIA Saudi Arabia crude production feed — drives the upstream Aramco
 * producer nodes with monthly crude-oil production data.
 *
 * Source: EIA v2 international/data with productId=53 (Crude oil
 * including lease condensate), activityId=1 (Production), country=SAU.
 * Returns monthly thousand-barrels/day (kbd); we scale to mb/d for
 * display consistency with the Hormuz throughput feed.
 *
 * Different from `eia-hormuz.ts` even though both query the same EIA
 * endpoint: Hormuz sums across six Persian Gulf producers and scales
 * by the transit fraction. This proxy is a single-country lookup,
 * stripped down — no transit factor, no breakdown.
 *
 * Capacity = 12 mb/d — Saudi historical peak per EIA's Country
 * Analysis Brief. Stress threshold is anything above 10.5.
 */
import type { LiveDataPoint } from "@/lib/types";

const PRODUCT_ID = "53";
const ACTIVITY_ID = "1";
const COUNTRY_ID = "SAU";

/** Saudi nameplate capacity (mb/d) — official EIA estimate. */
export const SAUDI_CRUDE_CAPACITY_MBD = 12;

export interface EiaSaudiCrudeFeed extends LiveDataPoint {
  /** Period (YYYY-MM) of the latest observation. */
  period: string;
}

/** Build the EIA v2 international/data URL for Saudi Arabia crude
 *  production, sorted period descending so the latest month is first. */
export function buildEiaSaudiCrudeUrl(apiKey: string): string {
  const base = "https://api.eia.gov/v2/international/data/";
  const params = new URLSearchParams();
  params.set("api_key", apiKey);
  params.set("frequency", "monthly");
  params.append("data[0]", "value");
  params.append("facets[productId][]", PRODUCT_ID);
  params.append("facets[activityId][]", ACTIVITY_ID);
  params.append("facets[countryRegionId][]", COUNTRY_ID);
  params.append("sort[0][column]", "period");
  params.append("sort[0][direction]", "desc");
  params.set("offset", "0");
  params.set("length", "3"); // a small window; we only need the latest
  return `${base}?${params.toString()}`;
}

interface EiaResponseRow {
  period?: string;
  value?: number | string | null;
}

interface EiaResponseEnvelope {
  response?: { data?: EiaResponseRow[] };
}

/** Parse the EIA response → first finite row → mb/d-scaled LiveDataPoint. */
export function parseEiaSaudiCrudeResponse(raw: unknown): EiaSaudiCrudeFeed {
  const envelope = raw as EiaResponseEnvelope;
  const rows = envelope?.response?.data ?? [];
  if (rows.length === 0) throw new Error("EIA Saudi response had no data rows");

  // Pick first row with a finite value. EIA occasionally backfills nulls
  // at the very latest period — skip those.
  let chosen: { period: string; valueKbd: number } | null = null;
  for (const row of rows) {
    if (!row.period) continue;
    const v = typeof row.value === "string" ? parseFloat(row.value) : row.value;
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    chosen = { period: row.period, valueKbd: v };
    break;
  }
  if (!chosen) throw new Error("EIA Saudi response: no finite value in window");

  const valueMbd = +(chosen.valueKbd / 1000).toFixed(3);
  return {
    kind: "production",
    value: valueMbd,
    capacity: SAUDI_CRUDE_CAPACITY_MBD,
    unit: "mb/d",
    observedAt: periodToIso(chosen.period),
    source: `EIA v2 / Saudi Arabia crude production (period ${chosen.period})`,
    period: chosen.period,
  };
}

/** Mock feed — used when EIA_API_KEY is unset or upstream errors. */
export function mockEiaSaudiCrudeFeed(): EiaSaudiCrudeFeed {
  const observedAt = new Date().toISOString();
  // 9.1 mb/d is the OPEC+ baseline range Saudi has held in recent years;
  // ratio ~76% of nameplate capacity — well below stress threshold.
  return {
    kind: "production",
    value: 9.1,
    capacity: SAUDI_CRUDE_CAPACITY_MBD,
    unit: "mb/d",
    observedAt,
    source: "EIA v2 / Saudi Arabia crude production (mock — EIA_API_KEY unset)",
    period: "mock",
  };
}

function periodToIso(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return new Date().toISOString();
  return new Date(`${m[1]}-${m[2]}-01T00:00:00Z`).toISOString();
}
