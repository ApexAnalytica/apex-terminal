/**
 * OpenFDA adverse-event feed — drives T1D drug-related nodes
 * (TZIELD/teplizumab, exogenous insulin) with live FDA Adverse Event
 * Reporting System (FAERS) counts.
 *
 * Source: https://api.fda.gov/drug/event.json
 * Free, no key required for the basic tier (rate-limited to 1000
 * req/day per IP without key; higher with free registration). Server
 * proxy holds rate-limit; client polls every 6h since adverse-event
 * counts move slowly (FAERS publishes quarterly).
 *
 * Each `OPENFDA_QUERIES` entry maps an FDA search query to the graph
 * nodes that should receive an "events" signal. The value is the count
 * of adverse-event reports matching the query in a recent window;
 * higher counts = more clinical scrutiny on the substance.
 */

export interface OpenFdaQueryConfig {
  /** Stable id (used in source string) */
  id: string;
  /** Human-readable label of the substance / product */
  label: string;
  /** OpenFDA `?search=` parameter (URL-unencoded — the proxy encodes it) */
  search: string;
  /** Substring matched (case-insensitive) against node.label */
  labelPatterns: string[];
  /** Receives the count + " reports" qualifier */
  unit: string;
  /** "Elevated" threshold — number of reports above which is "high scrutiny" */
  capacity: number;
  /** Plausible mock count for dev mode */
  mockValue: number;
}

export const OPENFDA_QUERIES: OpenFdaQueryConfig[] = [
  {
    id: "tzield",
    label: "TZIELD (teplizumab) — anti-CD3 monoclonal",
    // Match either brand or generic name — FDA labels are inconsistent
    search: '(patient.drug.openfda.brand_name:"TZIELD"+patient.drug.openfda.generic_name:"teplizumab")',
    labelPatterns: ["teplizumab"],
    unit: "rpts",
    capacity: 200,
    mockValue: 47,
  },
  {
    id: "insulin-glargine",
    label: "Insulin glargine (basal long-acting)",
    search: 'patient.drug.openfda.generic_name:"insulin+glargine"',
    labelPatterns: ["insulin glargine"],
    unit: "rpts",
    capacity: 5000,
    mockValue: 3120,
  },
];

export interface OpenFdaObservation {
  queryId: string;
  label: string;
  value: number;
  unit: string;
  capacity: number;
  observedAt: string;
  source: string;
}

export interface OpenFdaFeed {
  observations: OpenFdaObservation[];
  fetchedAt: string;
}

/** Build an OpenFDA `event/drug.json` URL with a year-window count query. */
export function buildOpenFdaUrl(config: OpenFdaQueryConfig): string {
  const base = "https://api.fda.gov/drug/event.json";
  const params = new URLSearchParams();
  // Restrict to the last year so the count reflects recent scrutiny rather
  // than cumulative-since-1990s reports.
  const year = new Date().getUTCFullYear();
  const search = `${config.search}+AND+receivedate:[${year - 1}0101+TO+${year}1231]`;
  params.set("search", search);
  params.set("limit", "1");
  return `${base}?${params.toString()}`.replace(/\+/g, "+"); // keep + literal in search
}

interface OpenFdaApiResponse {
  meta?: { results?: { total?: number } };
}

/** Parse an OpenFDA response and emit an observation with the total count. */
export function parseOpenFdaResponse(
  raw: unknown,
  config: OpenFdaQueryConfig,
): OpenFdaObservation | null {
  const env = raw as OpenFdaApiResponse;
  const total = env?.meta?.results?.total;
  if (typeof total !== "number" || !Number.isFinite(total)) return null;
  return {
    queryId: config.id,
    label: config.label,
    value: total,
    unit: config.unit,
    capacity: config.capacity,
    observedAt: new Date().toISOString(),
    source: `OpenFDA · ${config.id} (FAERS, last 12 months)`,
  };
}

export function mockOpenFdaFeed(): OpenFdaFeed {
  const observedAt = new Date().toISOString();
  return {
    fetchedAt: observedAt,
    observations: OPENFDA_QUERIES.map((q) => ({
      queryId: q.id,
      label: q.label,
      value: q.mockValue,
      unit: q.unit,
      capacity: q.capacity,
      observedAt,
      source: `OpenFDA · ${q.id} (mock — upstream unreachable)`,
    })),
  };
}
