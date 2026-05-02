/**
 * World Bank Open Data feed — drives country-level macro nodes (GDP,
 * Employment) without requiring an API key.
 *
 * Source: https://api.worldbank.org/v2/country/{ISO3}/indicator/{INDICATOR}
 * Format: JSON, anonymous access, generous rate limits (no published
 * limit; effectively bounded by per-IP throttling).
 *
 * The WB API returns `[pagination, observations]` as a top-level tuple,
 * which the parser unwraps. Series are reported in raw units (USD,
 * persons, %) — each `WB_SERIES` entry declares a `scale` divisor and
 * display unit so e.g. China's 17.8T USD GDP renders as "17.8 $T" not
 * "17795130000000".
 */

export interface WbSeriesConfig {
  /** ISO-3 country code, or "WLD" for global aggregate */
  country: string;
  /** WB indicator code (e.g. "NY.GDP.MKTP.KD") */
  indicator: string;
  /** Human-readable label (used in mock source string) */
  label: string;
  /** Substring matched (case-insensitive) against node.label */
  labelPatterns: string[];
  /** Divisor applied to raw value before display (1e12 for trillions, 1e6 for millions) */
  scale: number;
  unit: string;
  /** "Elevated" threshold for the qualifier ratio. 0 = no qualifier */
  capacity: number;
  /** Plausible mock value (already scaled, in display units) */
  mockValue: number;
}

export const WB_SERIES: WbSeriesConfig[] = [
  // China
  {
    country: "CHN",
    indicator: "NY.GDP.MKTP.KD",
    label: "China Real GDP (constant 2015 US$)",
    labelPatterns: ["china real gdp"],
    scale: 1e12,
    unit: "$T",
    capacity: 25,
    mockValue: 17.8,
  },
  {
    country: "CHN",
    indicator: "SL.EMP.TOTL.SP.ZS",
    label: "China Employment-to-Population Ratio (15+)",
    labelPatterns: ["china employment"],
    scale: 1,
    unit: "%",
    capacity: 80,
    mockValue: 65.5,
  },
  // Brazil
  {
    country: "BRA",
    indicator: "NY.GDP.MKTP.KD",
    label: "Brazil Real GDP (constant 2015 US$)",
    labelPatterns: ["brazil real gdp"],
    scale: 1e12,
    unit: "$T",
    capacity: 4,
    mockValue: 2.0,
  },
  {
    country: "BRA",
    indicator: "SL.EMP.TOTL.SP.ZS",
    label: "Brazil Employment-to-Population Ratio (15+)",
    labelPatterns: ["brazil employment"],
    scale: 1,
    unit: "%",
    capacity: 80,
    mockValue: 60.5,
  },
  // Global aggregate
  {
    country: "WLD",
    indicator: "FP.CPI.TOTL.ZG",
    label: "Global CPI Inflation YoY",
    labelPatterns: ["global cpi"],
    scale: 1,
    unit: "%",
    capacity: 6,
    mockValue: 4.5,
  },
];

export interface WbObservation {
  country: string;
  indicator: string;
  label: string;
  value: number;
  unit: string;
  capacity: number;
  observedAt: string;
  source: string;
  /** Past observations from the same WB response (older first), so the
   *  per-card sparkline can plot a multi-year curve on the first tick. */
  history?: Array<{ value: number; observedAt: string }>;
}

export interface WorldBankFeed {
  observations: WbObservation[];
  fetchedAt: string;
}

/** Build a WB v2 URL for a single (country, indicator) tuple. Requests the
 *  last 20 observations so the parser can build a multi-year history
 *  array (the per-card sparkline draws a curve on the first tick rather
 *  than waiting for cross-year ticks). */
export function buildWbSeriesUrl(country: string, indicator: string): string {
  const base = "https://api.worldbank.org/v2";
  const params = new URLSearchParams();
  params.set("format", "json");
  params.set("per_page", "20");
  return `${base}/country/${country}/indicator/${indicator}?${params.toString()}`;
}

interface WbApiResponse {
  // WB returns [paginationMeta, observations] as a top-level array.
  0?: unknown;
  1?: Array<{ date: string; value: number | null }>;
}

/** Parse a WB observation array into a current value + history array.
 *  WB returns the tuple [meta, observations]; the second element holds
 *  per-year rows (newest first). Drop rows where `value` is null, scale,
 *  and split into latest + history (chronological). */
export function parseWbSeriesResponse(
  raw: unknown,
  config: WbSeriesConfig,
): WbObservation | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const observations = (raw as WbApiResponse)[1];
  if (!Array.isArray(observations)) return null;
  const points: Array<{ value: number; observedAt: string; date: string }> = [];
  for (const o of observations) {
    if (typeof o.value !== "number" || !Number.isFinite(o.value)) continue;
    points.push({
      value: roundTo(o.value / config.scale, 2),
      observedAt: new Date(`${o.date}-01-01T00:00:00Z`).toISOString(),
      date: o.date,
    });
  }
  if (points.length === 0) return null;
  // WB returns newest first.
  const latest = points[0];
  const history = points
    .slice(1)
    .reverse()
    .map((p) => ({ value: p.value, observedAt: p.observedAt }));
  return {
    country: config.country,
    indicator: config.indicator,
    label: config.label,
    value: latest.value,
    unit: config.unit,
    capacity: config.capacity,
    observedAt: latest.observedAt,
    source: `World Bank · ${config.country}/${config.indicator} (period ${latest.date})`,
    history: history.length > 0 ? history : undefined,
  };
}

function roundTo(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/** Mock feed for dev/upstream-unreachable cases. */
export function mockWorldBankFeed(): WorldBankFeed {
  const observedAt = new Date().toISOString();
  return {
    fetchedAt: observedAt,
    observations: WB_SERIES.map((s) => ({
      country: s.country,
      indicator: s.indicator,
      label: s.label,
      value: s.mockValue,
      unit: s.unit,
      capacity: s.capacity,
      observedAt,
      source: `World Bank · ${s.country}/${s.indicator} (mock — upstream unreachable)`,
    })),
  };
}
