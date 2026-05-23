/**
 * Federal Reserve Economic Data (FRED) feed — drives macro/financial nodes.
 *
 * Source: https://api.stlouisfed.org/fred/series/observations
 *
 * Free with API key; instant registration at https://fred.stlouisfed.org/docs/api/api_key.html
 * Free-tier limit: 120 requests/minute. We batch 18 series per poll cycle
 * via parallel fetches and cache 6h server-side; well under the limit even
 * under heavy traffic.
 *
 * When FRED_API_KEY is unset (e.g. local dev without registration), the
 * route returns deterministic mock data tagged "(mock)" in each series'
 * source string so the engine path still exercises end-to-end.
 */

/** A single FRED series we pull. The `labelPatterns` are matched (case-
 *  insensitive substring) against `node.label` to attach the value to
 *  matching nodes in the graph. Capacity = "elevated" threshold the value
 *  is compared against in the live-data row's qualifier. */
export interface FredSeriesConfig {
  /** FRED series ID (e.g. "DFF") */
  id: string;
  /** Human-readable label for the series (for proof traces / mock source) */
  label: string;
  /** Substring matched (case-insensitive) against node.label to find
   *  consuming nodes in the graph. Multiple patterns OK; first match wins. */
  labelPatterns: string[];
  /** Display unit ("%", "K", "", etc.) */
  unit: string;
  /** "Elevated" threshold; ratio is shown as the qualifier in the card row.
   *  0 = no qualifier shown. */
  capacity: number;
  /** FRED `units` URL parameter for transformations.
   *    pc1 = % change Y/Y (12-month)
   *    pch = % change period-over-period
   *    pca = % change at compounded annual rate (Q/Q annualized)
   *    chg = absolute change period-over-period (e.g. PAYEMS thousands)
   *    lin = level (default if omitted) */
  units?: "pc1" | "pch" | "pca" | "chg" | "lin";
  /** Plausible mock value for dev mode. */
  mockValue: number;
}

/** Master list of FRED series we cover. Add a new node to FRED coverage by
 *  appending one entry here (and confirming the labelPatterns match the
 *  node's label in graph-data.ts). */
export const FRED_SERIES: FredSeriesConfig[] = [
  { id: "DFF", label: "Federal Funds Effective Rate", labelPatterns: ["fed funds effective rate"], unit: "%", capacity: 6, mockValue: 5.25 },
  { id: "DFEDTARU", label: "Fed Funds Target Range — Upper Limit", labelPatterns: ["fed funds target range"], unit: "%", capacity: 6, mockValue: 5.5 },
  { id: "SOFR", label: "Secured Overnight Financing Rate", labelPatterns: ["secured overnight financing rate", "sofr"], unit: "%", capacity: 6, mockValue: 5.32 },
  { id: "UNRATE", label: "Unemployment Rate (U-3)", labelPatterns: ["unemployment rate (u3)", "unemployment rate u3"], unit: "%", capacity: 7, mockValue: 4.1 },
  { id: "U6RATE", label: "U-6 Unemployment Rate", labelPatterns: ["u6 unemployment rate"], unit: "%", capacity: 12, mockValue: 7.6 },
  { id: "INDPRO", label: "Industrial Production Index", labelPatterns: ["industrial production index"], unit: "", capacity: 110, mockValue: 102.4 },
  { id: "PAYEMS", label: "Total Nonfarm Payrolls (level, thousands)", labelPatterns: ["nonfarm payroll level"], unit: "K", capacity: 0, mockValue: 158420 },
  { id: "MANEMP", label: "Manufacturing Payrolls (thousands)", labelPatterns: ["manufacturing payrolls"], unit: "K", capacity: 0, mockValue: 12930 },
  { id: "JTSJOL", label: "JOLTS Job Openings (thousands)", labelPatterns: ["jolts job openings"], unit: "K", capacity: 12000, mockValue: 8540 },
  { id: "JTSQUR", label: "JOLTS Quit Rate", labelPatterns: ["jolts quit rate"], unit: "%", capacity: 3, mockValue: 2.1 },
  { id: "JTSLDR", label: "JOLTS Layoff Rate", labelPatterns: ["jolts layoff rate"], unit: "%", capacity: 2, mockValue: 1.0 },
  { id: "PERMIT", label: "Building Permits (thousands)", labelPatterns: ["building permits"], unit: "K", capacity: 1800, mockValue: 1430 },
  { id: "MORTGAGE30US", label: "30-Year Fixed Mortgage Rate", labelPatterns: ["30-year fixed mortgage rate"], unit: "%", capacity: 8, mockValue: 6.7 },
  { id: "CPIAUCSL", label: "CPI-U Year-over-Year", labelPatterns: ["cpi-u year-over-year"], unit: "%", capacity: 5, units: "pc1", mockValue: 3.2 },
  { id: "CPILFESL", label: "Core CPI Year-over-Year", labelPatterns: ["core cpi year-over-year"], unit: "%", capacity: 5, units: "pc1", mockValue: 3.4 },
  { id: "T10YIE", label: "10-Year Breakeven Inflation Rate", labelPatterns: ["10y breakeven inflation rate"], unit: "%", capacity: 4, mockValue: 2.4 },
  // DFII10 = 10-Year Treasury Inflation-Indexed (TIPS) yield. The
  // canonical FRED-published real rate, daily cadence. Wires the
  // `ip_real_rate_10y` graph node which was previously historical-only
  // with a synthetic proxy. Per the inline comment on the
  // `ip_real_rate_10y__ip_dxy` edge in graph-data.ts: "Literature-cited
  // until FRED DFII10 (TIPS yield) becomes reachable." It is now
  // reachable since the FRED_API_KEY landed 2026-05-21.
  { id: "DFII10", label: "10-Year Treasury TIPS Yield (Real Rate)", labelPatterns: ["10y real interest rate"], unit: "%", capacity: 3, mockValue: 2.0 },
  // MHHNGSP = Henry Hub Natural Gas Spot Price (monthly avg, USD per
  // MMBtu). FRED republishes the EIA series. Henry Hub is the US Gulf
  // benchmark for natural gas pricing; Asian LNG (JKM) and European TTF
  // track it with regional spreads, so it's a reasonable proxy for the
  // gas-input cost across petrochemical / LNG nodes. Capacity = 5
  // separates "normal" ($2–4) from "stress" ($5+) regimes per EIA's
  // own annual energy-outlook bands. labelPattern targets the
  // "natural gas feedstock system" node in graph-data.ts.
  { id: "MHHNGSP", label: "Henry Hub Natural Gas Spot Price (USD/MMBtu)", labelPatterns: ["natural gas feedstock", "henry hub"], unit: "$/MMBtu", capacity: 5, mockValue: 3.2 },
  // Fertilizer Manufacturing PPI — wires `sc_fertilizer_price_index`
  // (Supply Chain Food Security domain). Previously historical-only via
  // `bunge_food_security` snapshot. FRED PCU3253132531 is the BLS PPI by
  // Industry for fertilizer manufacturing, monthly cadence, current to
  // 2026-04 = 302.87. Capacity 350 = "elevated regime" threshold (PPI
  // typically peaks around 320-350 in fertilizer supply shocks like 2022).
  { id: "PCU3253132531", label: "Fertilizer Manufacturing PPI", labelPatterns: ["fertilizer price index"], unit: "", capacity: 350, mockValue: 302 },
  // Cass Freight Expenditures Index — wires `sc_shipping_cost_index`
  // (Supply Chain Food Security domain). FRGEXPUSM649NCIS is the
  // dollars-spent dimension of the Cass Freight Index (vs FRGSHPUSM649NCIS
  // for shipment volume only). Captures both rate and volume, making it
  // the best single-number freight cost proxy on FRED. Monthly cadence,
  // current to 2026-04 = 3.382. The canonical container-shipping indices
  // (Drewry, Shanghai SCFI) for the Red Sea/Suez dimension referenced by
  // the graph node's mechanism comment are not publicly available, so
  // Cass is the closest free alternative.
  { id: "FRGEXPUSM649NCIS", label: "Cass Freight Expenditures Index", labelPatterns: ["shipping cost index"], unit: "", capacity: 4, mockValue: 3.4 },
  // Regional Fed manufacturing surveys as ISM PMI proxies. ISM's PMI is
  // proprietary (subscription-only since ~2015), so the proxy strategy
  // uses the Philadelphia Fed Manufacturing Business Outlook Survey for
  // manufacturing and the Dallas Fed Texas Service Sector Outlook Survey
  // for services. Both are publicly-available diffusion indices that
  // economists track alongside ISM and which historically correlate
  // r=0.6-0.8 with the ISM headlines. Monthly cadence, current to 2026-04
  // or 2026-05. Capacity 0 (diffusion indices are signed centered at 0).
  // Mock values reflect roughly neutral readings.
  { id: "GACDFSA066MSFRBPHI", label: "Philly Fed Manufacturing (ISM PMI proxy)", labelPatterns: ["ism manufacturing pmi"], unit: "", capacity: 0, mockValue: 0 },
  { id: "TSSOSBACTSAMFRBDAL", label: "Dallas Fed Services (ISM PMI Services proxy)", labelPatterns: ["ism services pmi"], unit: "", capacity: 0, mockValue: 0 },
  { id: "T5YIE", label: "5-Year Breakeven Inflation Rate", labelPatterns: ["5y breakeven inflation rate"], unit: "%", capacity: 4, mockValue: 2.5 },
  { id: "CSUSHPISA", label: "Case-Shiller Home Price Index YoY", labelPatterns: ["case-shiller home price index"], unit: "%", capacity: 12, units: "pc1", mockValue: 4.8 },
  // FRED expansion (Phase 4): more macro/financial nodes from graph-data.ts
  { id: "CIVPART", label: "Labor Force Participation Rate", labelPatterns: ["labor force participation rate"], unit: "%", capacity: 64, mockValue: 62.7 },
  { id: "EMRATIO", label: "Employment-Population Ratio", labelPatterns: ["employment-population ratio"], unit: "%", capacity: 65, mockValue: 60.1 },
  { id: "A191RL1Q225SBEA", label: "Real GDP — QoQ Annualized %", labelPatterns: ["gdp qoq annualized"], unit: "%", capacity: 4, mockValue: 2.5 },
  { id: "PPIACO", label: "PPI All Commodities", labelPatterns: ["ppi all commodities"], unit: "", capacity: 280, mockValue: 250 },
  // PPIFGS deleted 2026-05-22: upstream-discontinued since 2015-12. The
  // FRED API still returns the last-known 2015 value (191.2) for any
  // request, so check:feeds was reporting it as LIVE even though the
  // data was 10 years stale. Compounding error: the original
  // labelPattern was "ppi final demand energy" but PPIFGS is the
  // *Goods* sub-index, not Energy — so it was also misrouted to the
  // wrong graph node. Three replacement entries below wire each of the
  // three PPI Final Demand sub-indices to its correct, current FRED
  // series. See PR #391 (2026-05-22) for the full diagnostic — a
  // similar discontinuation pattern was caught for PPILFE (Core PPI)
  // which is documented as a follow-up.
  { id: "PPIFIS", label: "PPI Final Demand", labelPatterns: ["ppi final demand"], unit: "", capacity: 165, mockValue: 156 },
  { id: "PPIFDS", label: "PPI Final Demand Services", labelPatterns: ["ppi final demand services"], unit: "", capacity: 165, mockValue: 156 },
  { id: "WPSFD4131", label: "PPI Final Demand Energy", labelPatterns: ["ppi final demand energy"], unit: "", capacity: 320, mockValue: 268 },
  // Core PPI YoY — wires the previously-unwired `ip_core_ppi_yoy` graph
  // node to PPICOR (PPI by Commodity: Final Demand: Less Foods and Energy)
  // with units=pc1 transform for year-over-year %. 5.23 % at 2026-04.
  // Note: PPILFE was the canonical Core PPI series until 2015-12 when FRED
  // discontinued it; PPICOR is the current successor.
  { id: "PPICOR", label: "Core PPI Year-over-Year", labelPatterns: ["core ppi year-over-year"], unit: "%", capacity: 5, units: "pc1", mockValue: 3.2 },
  { id: "T5YIFR", label: "5Y5Y Forward Inflation Expectation", labelPatterns: ["5y5y forward inflation expectation"], unit: "%", capacity: 4, mockValue: 2.3 },
  { id: "PWHEAMTUSDM", label: "Global Wheat Price (Soft Red Winter)", labelPatterns: ["global wheat price"], unit: "$/T", capacity: 400, mockValue: 230 },
  // EM FX stress series — daily FRED publication, scaled to local-per-USD.
  // Capacity = "stressed" threshold; ratio shows depreciation pressure.
  { id: "DEXTUUS", label: "Turkish Lira / USD", labelPatterns: ["turkey fx stress"], unit: "TRY/$", capacity: 35, mockValue: 32.4 },
  { id: "DEXSFUS", label: "South African Rand / USD", labelPatterns: ["south africa fx stress"], unit: "ZAR/$", capacity: 22, mockValue: 18.3 },
  { id: "DEXBZUS", label: "Brazilian Real / USD", labelPatterns: ["brazil fx stress"], unit: "BRL/$", capacity: 6, mockValue: 5.05 },
  // Phase 7 — Sovereign Default real data. ICE BofA US High Yield OAS is
  // the canonical credit-stress proxy: spreads widen when sovereign /
  // corporate default risk rises. Eliminates the 3rd of 4 synthetic
  // composites in the Live Coverage Program.
  { id: "BAMLH0A0HYM2", label: "ICE BofA US High Yield OAS", labelPatterns: ["sovereign default"], unit: "%", capacity: 8, mockValue: 3.5 },
  // Phase 9 — broader CPI / PCE / wage / sentiment expansion. 13 additional
  // FRED series picked to match labels already in graph-data.ts. Each is
  // a one-line addition to FRED_SERIES — no other code changes needed.
  { id: "PCEPILFE", label: "Core PCE Y/Y", labelPatterns: ["core pce year-over-year"], unit: "%", capacity: 5, units: "pc1", mockValue: 2.7 },
  { id: "PCESV", label: "PCE Services Spending (level)", labelPatterns: ["pce services spending"], unit: "$B", capacity: 0, mockValue: 13800 },
  { id: "PCEND", label: "PCE Nondurable Goods (level)", labelPatterns: ["pce goods spending"], unit: "$B", capacity: 0, mockValue: 4200 },
  { id: "CPIHOSSL", label: "CPI Shelter Y/Y", labelPatterns: ["cpi shelter"], unit: "%", capacity: 8, units: "pc1", mockValue: 5.4 },
  { id: "CUSR0000SAS", label: "CPI Services Y/Y", labelPatterns: ["cpi services"], unit: "%", capacity: 8, units: "pc1", mockValue: 5.0 },
  { id: "CUSR0000SACL1E", label: "CPI Core Goods Y/Y", labelPatterns: ["cpi core goods"], unit: "%", capacity: 5, units: "pc1", mockValue: 0.5 },
  { id: "CPIENGSL", label: "CPI Energy Y/Y", labelPatterns: ["cpi energy"], unit: "%", capacity: 15, units: "pc1", mockValue: 2.5 },
  { id: "CPIUFDSL", label: "CPI Food Y/Y", labelPatterns: ["cpi food"], unit: "%", capacity: 8, units: "pc1", mockValue: 2.1 },
  { id: "CUUR0000SETA02", label: "CPI Used Cars and Trucks Y/Y", labelPatterns: ["cpi used vehicles"], unit: "%", capacity: 15, units: "pc1", mockValue: -3.5 },
  { id: "CES0500000003", label: "Average Hourly Earnings Y/Y", labelPatterns: ["average hourly earnings yoy"], unit: "%", capacity: 6, units: "pc1", mockValue: 4.0 },
  { id: "ECIALLCIV", label: "Employment Cost Index Q/Q", labelPatterns: ["employment cost index"], unit: "%", capacity: 1.5, units: "pch", mockValue: 1.0 },
  { id: "TCU", label: "Capacity Utilization", labelPatterns: ["capacity utilization"], unit: "%", capacity: 85, mockValue: 78.5 },
  { id: "MICH", label: "UMich 1Y Inflation Expectations", labelPatterns: ["umich consumer inflation expectations"], unit: "%", capacity: 5, mockValue: 3.2 },
  // Phase 10 — close the bare-modeled gap on the labor / growth pillar.
  // Nodes already exist in graph-data.ts with these labels but no FRED
  // series was registered, so they showed as static modeled instead of
  // live. All five series are free, monthly/quarterly, and on FRED today.
  { id: "HOUST", label: "Housing Starts (thousands, SAAR)", labelPatterns: ["housing starts"], unit: "K", capacity: 1800, mockValue: 1380 },
  { id: "RSAFS", label: "Retail Sales M/M %", labelPatterns: ["retail sales mom", "retail sales"], unit: "%", capacity: 2, units: "pch", mockValue: 0.4 },
  { id: "ULCNFB", label: "Unit Labor Costs Q/Q Annualized", labelPatterns: ["unit labor costs qoq annualized", "unit labor costs"], unit: "%", capacity: 5, units: "pca", mockValue: 2.8 },
  { id: "CUSR0000SEHC", label: "CPI Owners' Equivalent Rent Y/Y", labelPatterns: ["owners' equivalent rent (oer)", "owners equivalent rent", "oer"], unit: "%", capacity: 8, units: "pc1", mockValue: 4.5 },
  { id: "JTSHIR", label: "JOLTS Hires Rate", labelPatterns: ["hiring rate", "hires rate"], unit: "%", capacity: 5, mockValue: 3.4 },
  // Phase 11 — Tier-1 audit follow-up. Three more bare-modeled nodes
  // closed by adding new FRED transforms or alternative series.
  // - PAYEMS with units=chg gives the headline NFP CHANGE (different
  //   from the level entry above which uses no transform).
  // - DTWEXBGS is FRED's Nominal Broad U.S. Dollar Index — not the
  //   ICE DXY but the standard FRED proxy. The ICE 6-currency index
  //   isn't on FRED at all. Synthetic DXY in graph-data.ts shares the
  //   shape closely enough that the live tick reads in the same regime.
  // - CES0500000003 we already pull as Y/Y (entry above); the MoM
  //   variant uses the same series with units=pch.
  { id: "PAYEMS", label: "Headline Nonfarm Payroll Change", labelPatterns: ["headline nonfarm payroll change", "nonfarm payroll change"], unit: "K", capacity: 250, units: "chg", mockValue: 175 },
  { id: "DTWEXBGS", label: "Nominal Broad U.S. Dollar Index", labelPatterns: ["us dollar index (dxy)", "dollar index", "dxy"], unit: "", capacity: 130, mockValue: 122 },
  { id: "CES0500000003", label: "Average Hourly Earnings M/M %", labelPatterns: ["average hourly earnings mom", "average hourly earnings m/m"], unit: "%", capacity: 0.5, units: "pch", mockValue: 0.3 },
  // Phase 13 — promote 3 historical-only Supply Chain / Fertilizer food
  // nodes to live ongoing pulls. PFOODINDEXM is the IMF Food Price
  // Index (cereals, meats, oils, dairy, sugar) republished on FRED;
  // monthly cadence; same shape the analyst snapshot used. Two transforms:
  // level for the stress nodes, pc1 (Y/Y %) for the inflation node.
  { id: "PFOODINDEXM", label: "IMF Food Price Index (level)", labelPatterns: ["global food price", "global food-price stress", "global food prices", "food price / farm-input"], unit: "index", capacity: 200, mockValue: 132 },
  { id: "PFOODINDEXM", label: "IMF Food Price Index Y/Y %", labelPatterns: ["food price inflation"], unit: "%", capacity: 15, units: "pc1", mockValue: 4.2 },
];

/** A single observation per FRED series, returned by the proxy and
 *  consumed by the FRED provider's `matchPayload`. */
export interface FredObservation {
  seriesId: string;
  label: string;
  value: number;
  unit: string;
  capacity: number;
  /** ISO-8601 — period end of the latest observation (FRED returns "date"). */
  observedAt: string;
  /** Display source string ("FRED · DFF (period 2025-04)"). */
  source: string;
  /** Past observations (older first), parsed from the same upstream response.
   *  Lets the per-card sparkline draw a curve on the FIRST tick instead of
   *  showing "LIVE — building" until the second tick rolls in. */
  history?: Array<{ value: number; observedAt: string }>;
}

export interface FredFeed {
  observations: FredObservation[];
  fetchedAt: string;
}

/** Build a single-series FRED URL. Requests the last 24 observations
 *  (sort_order=desc) so the parser can hydrate a history array on the
 *  first tick — the per-card sparkline draws a curve immediately rather
 *  than waiting for the second tick. */
export function buildFredSeriesUrl(seriesId: string, apiKey: string, units?: string): string {
  const base = "https://api.stlouisfed.org/fred/series/observations";
  const params = new URLSearchParams();
  params.set("series_id", seriesId);
  params.set("api_key", apiKey);
  params.set("file_type", "json");
  params.set("sort_order", "desc");
  params.set("limit", "24");
  if (units) params.set("units", units);
  return `${base}?${params.toString()}`;
}

interface FredApiResponse {
  observations?: Array<{ date: string; value: string }>;
}

/** Parse FRED observations into a current value + history array. FRED uses
 *  "." for missing values and returns numbers as strings. Returns null
 *  when there are zero usable observations.
 *
 *  Response order is sort_order=desc, so observations[0] is the latest.
 *  History is built from observations[1..] in chronological order (older
 *  first) so the sparkline plots left-to-right. */
export function parseFredSeriesResponse(
  raw: unknown,
  config: FredSeriesConfig,
): FredObservation | null {
  const env = raw as FredApiResponse;
  const all = env?.observations ?? [];
  // Parse each row, dropping missing-value sentinels and non-finite parses.
  const parsed: Array<{ value: number; observedAt: string; date: string }> = [];
  for (const o of all) {
    if (o.value === "." || o.value == null) continue;
    const v = parseFloat(o.value);
    if (!Number.isFinite(v)) continue;
    parsed.push({
      value: roundTo(v, 4),
      observedAt: new Date(`${o.date}T00:00:00Z`).toISOString(),
      date: o.date,
    });
  }
  if (parsed.length === 0) return null;
  // Latest is parsed[0] (sort_order=desc); history is the rest reversed
  // so chronological order is preserved on the sparkline.
  const latest = parsed[0];
  const history = parsed
    .slice(1)
    .reverse()
    .map((p) => ({ value: p.value, observedAt: p.observedAt }));
  // Include the units transform in the routing key so two FRED_SERIES
  // entries that share the same series id (e.g. PAYEMS as level + chg,
  // CES0500000003 as Y/Y + M/M) don't collide in the provider's
  // matchSeriesToNode lookup.
  const seriesId = config.units ? `${config.id}_${config.units}` : config.id;
  return {
    seriesId,
    label: config.label,
    value: latest.value,
    unit: config.unit,
    capacity: config.capacity,
    observedAt: latest.observedAt,
    source: `FRED · ${config.id} (period ${latest.date})`,
    history: history.length > 0 ? history : undefined,
  };
}

function roundTo(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/** Mock feed for dev/no-key/fallback cases — deterministic plausible values
 *  for each series, all tagged "(mock)" in their source string. */
export function mockFredFeed(): FredFeed {
  const observedAt = new Date().toISOString();
  return {
    fetchedAt: observedAt,
    observations: FRED_SERIES.map((s) => ({
      // Same transform-aware key as parseFredSeriesResponse so the mock
      // feed routes the same way the live one does (no PAYEMS-level vs
      // PAYEMS-chg collision).
      seriesId: s.units ? `${s.id}_${s.units}` : s.id,
      label: s.label,
      value: s.mockValue,
      unit: s.unit,
      capacity: s.capacity,
      observedAt,
      source: `FRED · ${s.id} (mock — FRED_API_KEY unset)`,
    })),
  };
}
