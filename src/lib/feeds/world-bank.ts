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
  /** Optional kind override for the emitted LiveDataPoint. Defaults to
   *  "indicator" when absent. WGI governance series use "governance" so
   *  axioms can distinguish jurisdictional-governance scores from generic
   *  macro indicators via `getLiveSignal(node, "governance")`. */
  kind?: string;
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
  // Phase 8 — MENA Import Dependency real data. World Bank aggregates the
  // Middle East & North Africa region as country code "MEA". The indicator
  // NE.IMP.GNFS.ZS (Imports of goods and services, % of GDP) is the
  // canonical free measure of import dependence — higher = more reliant
  // on external supply chains. Eliminates the 4th and final synthetic
  // composite in the Live Coverage Program.
  {
    country: "MEA",
    indicator: "NE.IMP.GNFS.ZS",
    label: "MENA Import Dependency (Imports % of GDP)",
    labelPatterns: ["mena import dependency"],
    scale: 1,
    unit: "%",
    capacity: 50, // 50% of GDP from imports = high dependency regime
    mockValue: 35.5,
  },
  // Phase 12 — promote 6 historical-only Financial Contagion nodes to
  // live ongoing pulls. Country picks mirror the existing
  // NODE_TIMESERIES_MAP conventions (Saudi for the EM-aggregate proxy,
  // Mexico for external debt, Turkey for current account, Pakistan for
  // debt-to-GDP, Egypt + Argentina for FX). All free, no key, annual
  // cadence — refresh once a year vs the static PIMCO snapshot.
  {
    country: "SAU",
    indicator: "FI.RES.TOTL.CD",
    label: "Saudi Arabia Total Reserves (USD)",
    labelPatterns: ["em fx reserves"],
    scale: 1e9,
    unit: "$B",
    capacity: 600,
    mockValue: 437,
  },
  {
    country: "MEX",
    indicator: "DT.DOD.DECT.CD",
    label: "Mexico External Debt Stocks (USD)",
    labelPatterns: ["external debt stock"],
    scale: 1e9,
    unit: "$B",
    capacity: 700,
    mockValue: 605,
  },
  {
    country: "PAK",
    indicator: "GC.DOD.TOTL.GD.ZS",
    label: "Pakistan Central Government Debt (% of GDP)",
    labelPatterns: ["debt-to-gdp ratio", "debt to gdp"],
    scale: 1,
    unit: "%",
    capacity: 80,
    mockValue: 76,
  },
  {
    country: "TUR",
    indicator: "BN.CAB.XOKA.CD",
    label: "Turkey Current Account Balance (USD)",
    labelPatterns: ["current account balance"],
    scale: 1e9,
    unit: "$B",
    capacity: 0,
    mockValue: -45,
  },
  {
    country: "EGY",
    indicator: "PA.NUS.FCRF",
    label: "Egypt Official Exchange Rate (LCU per USD)",
    labelPatterns: ["exchange rate pressure index", "fx pressure"],
    scale: 1,
    unit: "EGP/$",
    capacity: 50,
    mockValue: 48,
  },
  {
    country: "ARG",
    indicator: "PA.NUS.FCRF",
    label: "Argentina Official Exchange Rate (LCU per USD)",
    labelPatterns: ["argentina fx"],
    scale: 1,
    unit: "ARS/$",
    capacity: 1500,
    mockValue: 1100,
  },
  // WGI — World Governance Indicators. Annual cadence. Scale runs from
  // ~-2.5 (worst) to +2.5 (best) where 0 ≈ global average. We surface
  // Rule of Law (RL.EST) — the dimension most directly relevant to R-04
  // (Cross-Domain Dependency), which now applies a stricter confidence
  // cutoff when an edge's endpoint sits in a weak-governance jurisdiction.
  //
  // `capacity: 0` makes the qualifier display read as "ratio vs world
  // average". `kind: "governance"` keeps the signal addressable separately
  // from the generic WB macro indicators that share the same provider.
  {
    country: "CHN",
    indicator: "RL.EST",
    label: "China Rule of Law (WGI)",
    labelPatterns: ["china real gdp"],
    scale: 1,
    unit: "WGI",
    capacity: 0,
    mockValue: -0.4,
    kind: "governance",
  },
  {
    country: "BRA",
    indicator: "RL.EST",
    label: "Brazil Rule of Law (WGI)",
    labelPatterns: ["brazil real gdp"],
    scale: 1,
    unit: "WGI",
    capacity: 0,
    mockValue: -0.2,
    kind: "governance",
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
