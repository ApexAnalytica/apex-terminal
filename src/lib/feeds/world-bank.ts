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
  // Global CPI YoY intentionally absent from WB. We probed every plausible
  // regional aggregate (WLD, LMY, HIC, EMU, OED) and FP.CPI.TOTL.ZG is
  // null at every aggregate level — WB only computes CPI inflation for
  // individual countries. The "Macro Impact: Inflation & Policy" graph
  // domain is FRED-owned (CPIAUCSL etc.); WB doesn't have a useful lane
  // here. Previous entry (WLD/FP.CPI.TOTL.ZG) wired to label pattern
  // "global cpi" which matched ZERO graph nodes, so removing it has no
  // downstream effect — just eliminates a permanent MISS in the
  // check-feeds verification.
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
  // Originally wired to PAK/GC.DOD.TOTL.GD.ZS (central gov debt % GDP)
  // but that WB series has been null for Pakistan since 2000 — likely a
  // reporting gap. Swapped to DT.DOD.DECT.GN.ZS (external debt stocks %
  // of GNI) which has 2024 data and is arguably the BETTER contagion
  // signal for Pakistan anyway: FX-denominated external debt + IMF
  // program dependence is what actually drives PAK distress episodes.
  // Capacity recalibrated to 50 (IMF DSA "high external debt"
  // threshold) since external-debt % GNI regimes run lower than
  // central-gov-debt % GDP regimes.
  {
    country: "PAK",
    indicator: "DT.DOD.DECT.GN.ZS",
    label: "Pakistan External Debt Stocks (% of GNI)",
    labelPatterns: ["debt-to-gdp ratio", "debt to gdp"],
    scale: 1,
    unit: "%",
    capacity: 50,
    mockValue: 36,
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
  // WGI — World Governance Indicators — REMOVED 2026-05-22.
  // Every WGI indicator (RL.EST = Rule of Law, GE.EST = Government
  // Effectiveness, CC.EST = Control of Corruption, PV.EST = Political
  // Stability, RQ.EST = Regulatory Quality, VA.EST = Voice & Accountability)
  // now returns "The indicator was not found. It may have been deleted or
  // archived." from the WB v2 API. The full WGI dataset has been retired
  // from this endpoint — probed all 6 codes on 2026-05-22, all return the
  // same archival message.
  //
  // The CHN/RL.EST and BRA/RL.EST entries that previously sat here were
  // showing as MISS in `check:feeds` and contributed no data to the
  // R-04 Cross-Domain Dependency axiom. Removed cleanly with no graph-
  // side change (label patterns "china real gdp" / "brazil real gdp"
  // also matched the existing GDP entries above, so no node loses
  // coverage from removing these — the GDP node was always the dominant
  // signal anyway).
  //
  // The `kind: "governance"` discriminator on `WbSeriesConfig` is kept
  // for future use if a non-WB governance source ever lands. If WB
  // restores WGI to the v2 API or publishes it under a new code, the
  // entries can be re-added in the same shape.
  // Phase 13 — promote the 4 fertilizer-market nodes (QAFCO + Ma'aden
  // export destinations for India and Brazil) to live via WB
  // AG.CON.FERT.ZS (Fertilizer consumption, kg per hectare of arable
  // land). Annual cadence, free, no key. India ~165 kg/ha, Brazil ~390
  // kg/ha in recent years — both far above the world average ~140,
  // confirming high import-dependent demand.
  //
  // Each entry's label pattern intentionally fans out across TWO nodes:
  // "india fertilizer" matches both `qf_india_fertilizer_market` ("India
  // fertilizer import market") and `mn_india_fertilizer_market` ("India
  // fertilizer market"), but NOT the QAFCO Australia/USA nodes (whose
  // labels include "customer market" without the country-then-fertilizer
  // ordering). The provider matcher now fan-outs one observation → all
  // pattern matches; see `providers/world-bank.ts`.
  {
    country: "IND",
    indicator: "AG.CON.FERT.ZS",
    label: "India Fertilizer Consumption (kg/ha of arable land)",
    labelPatterns: ["india fertilizer"],
    scale: 1,
    unit: "kg/ha",
    capacity: 250, // elevated regime — India runs ~165, world avg ~140
    mockValue: 175,
  },
  {
    country: "BRA",
    indicator: "AG.CON.FERT.ZS",
    label: "Brazil Fertilizer Consumption (kg/ha of arable land)",
    labelPatterns: ["brazil fertilizer"],
    scale: 1,
    unit: "kg/ha",
    capacity: 500, // elevated regime — Brazil runs ~390 (one of the world's heaviest users)
    mockValue: 388,
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
