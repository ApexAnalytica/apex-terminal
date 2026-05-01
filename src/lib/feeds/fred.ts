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
  /** FRED `units` URL parameter for transformations (pc1 = % change YoY).
   *  Omitted = level. */
  units?: "pc1" | "pch" | "lin";
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
  { id: "T5YIE", label: "5-Year Breakeven Inflation Rate", labelPatterns: ["5y breakeven inflation rate"], unit: "%", capacity: 4, mockValue: 2.5 },
  { id: "CSUSHPISA", label: "Case-Shiller Home Price Index YoY", labelPatterns: ["case-shiller home price index"], unit: "%", capacity: 12, units: "pc1", mockValue: 4.8 },
  // FRED expansion (Phase 4): more macro/financial nodes from graph-data.ts
  { id: "CIVPART", label: "Labor Force Participation Rate", labelPatterns: ["labor force participation rate"], unit: "%", capacity: 64, mockValue: 62.7 },
  { id: "EMRATIO", label: "Employment-Population Ratio", labelPatterns: ["employment-population ratio"], unit: "%", capacity: 65, mockValue: 60.1 },
  { id: "A191RL1Q225SBEA", label: "Real GDP — QoQ Annualized %", labelPatterns: ["gdp qoq annualized"], unit: "%", capacity: 4, mockValue: 2.5 },
  { id: "PPIACO", label: "PPI All Commodities", labelPatterns: ["ppi all commodities"], unit: "", capacity: 280, mockValue: 250 },
  { id: "PPIFGS", label: "PPI Final Demand Goods", labelPatterns: ["ppi final demand energy"], unit: "", capacity: 145, mockValue: 138 },
  { id: "T5YIFR", label: "5Y5Y Forward Inflation Expectation", labelPatterns: ["5y5y forward inflation expectation"], unit: "%", capacity: 4, mockValue: 2.3 },
  { id: "PWHEAMTUSDM", label: "Global Wheat Price (Soft Red Winter)", labelPatterns: ["global wheat price"], unit: "$/T", capacity: 400, mockValue: 230 },
  // EM FX stress series — daily FRED publication, scaled to local-per-USD.
  // Capacity = "stressed" threshold; ratio shows depreciation pressure.
  { id: "DEXTUUS", label: "Turkish Lira / USD", labelPatterns: ["turkey fx stress"], unit: "TRY/$", capacity: 35, mockValue: 32.4 },
  { id: "DEXSFUS", label: "South African Rand / USD", labelPatterns: ["south africa fx stress"], unit: "ZAR/$", capacity: 22, mockValue: 18.3 },
  { id: "DEXBZUS", label: "Brazilian Real / USD", labelPatterns: ["brazil fx stress"], unit: "BRL/$", capacity: 6, mockValue: 5.05 },
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
}

export interface FredFeed {
  observations: FredObservation[];
  fetchedAt: string;
}

/** Build a single-series FRED URL. */
export function buildFredSeriesUrl(seriesId: string, apiKey: string, units?: string): string {
  const base = "https://api.stlouisfed.org/fred/series/observations";
  const params = new URLSearchParams();
  params.set("series_id", seriesId);
  params.set("api_key", apiKey);
  params.set("file_type", "json");
  params.set("sort_order", "desc");
  params.set("limit", "1");
  if (units) params.set("units", units);
  return `${base}?${params.toString()}`;
}

interface FredApiResponse {
  observations?: Array<{ date: string; value: string }>;
}

/** Parse a single FRED observation response into a numeric value + observedAt.
 *  FRED uses "." for missing values and returns numbers as strings. */
export function parseFredSeriesResponse(
  raw: unknown,
  config: FredSeriesConfig,
): FredObservation | null {
  const env = raw as FredApiResponse;
  const obs = env?.observations?.[0];
  if (!obs) return null;
  if (obs.value === "." || obs.value == null) return null;
  const value = parseFloat(obs.value);
  if (!Number.isFinite(value)) return null;
  return {
    seriesId: config.id,
    label: config.label,
    value: roundTo(value, 4),
    unit: config.unit,
    capacity: config.capacity,
    observedAt: new Date(`${obs.date}T00:00:00Z`).toISOString(),
    source: `FRED · ${config.id} (period ${obs.date})`,
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
      seriesId: s.id,
      label: s.label,
      value: s.mockValue,
      unit: s.unit,
      capacity: s.capacity,
      observedAt,
      source: `FRED · ${s.id} (mock — FRED_API_KEY unset)`,
    })),
  };
}
