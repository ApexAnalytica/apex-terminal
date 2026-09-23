/**
 * ClinicalTrials.gov v2 API feed — drives T1D drug nodes with live trial
 * counts (active/recruiting studies for each substance or condition).
 *
 * Source: https://clinicaltrials.gov/api/v2/studies
 * Free, no key, JSON. Generous rate limits (no published cap; effectively
 * IP-bounded). The signal is "number of trials matching the query," with
 * "Recruiting" status filtered separately for the qualifier.
 *
 * Higher count = more clinical maturity / scrutiny on the substance,
 * which the engine surfaces as an `indicator` signal on the matching
 * graph node.
 */

export interface ClinicalTrialsQueryConfig {
  id: string;
  label: string;
  /** ClinicalTrials.gov `query.term` value (free-text) */
  term: string;
  /** Substring matched (case-insensitive) against node.label */
  labelPatterns: string[];
  /** "Elevated" threshold — number of recruiting trials above which is "very active" */
  capacity: number;
  /** Plausible mock count for dev mode */
  mockValue: number;
}

export const CLINICAL_TRIALS_QUERIES: ClinicalTrialsQueryConfig[] = [
  {
    id: "teplizumab",
    label: "Teplizumab clinical trials",
    term: "teplizumab",
    labelPatterns: ["teplizumab"],
    capacity: 30,
    mockValue: 18,
  },
  {
    id: "vx880",
    label: "VX-880 (Vertex stem-cell β-cell replacement)",
    term: "VX-880",
    labelPatterns: ["vx-880", "stem-cell-derived β-cell replacement", "stem-cell-derived beta-cell"],
    capacity: 10,
    mockValue: 4,
  },
];

export interface ClinicalTrialsObservation {
  queryId: string;
  label: string;
  /** Total studies matching the term (recruiting + completed + suspended + ...) */
  value: number;
  /** Carries the recruiting subset for the proof-trace detail */
  recruitingCount: number;
  unit: string;
  capacity: number;
  observedAt: string;
  source: string;
}

export interface ClinicalTrialsFeed {
  observations: ClinicalTrialsObservation[];
  fetchedAt: string;
}

/** Build a ClinicalTrials.gov v2 URL for a term query, requesting only the
 *  fields we need (overall status + total count). */
export function buildClinicalTrialsUrl(config: ClinicalTrialsQueryConfig): string {
  const base = "https://clinicaltrials.gov/api/v2/studies";
  const params = new URLSearchParams();
  params.set("query.term", config.term);
  params.set("countTotal", "true");
  params.set("pageSize", "100"); // enough to count "Recruiting" subset accurately
  params.set("fields", "protocolSection.statusModule.overallStatus");
  return `${base}?${params.toString()}`;
}

interface ClinicalTrialsApiResponse {
  totalCount?: number;
  studies?: Array<{
    protocolSection?: {
      statusModule?: { overallStatus?: string };
    };
  }>;
}

export function parseClinicalTrialsResponse(
  raw: unknown,
  config: ClinicalTrialsQueryConfig,
): ClinicalTrialsObservation | null {
  const env = raw as ClinicalTrialsApiResponse;
  const total = env?.totalCount;
  if (typeof total !== "number" || !Number.isFinite(total)) return null;
  const studies = env?.studies ?? [];
  const recruiting = studies.filter(
    (s) => s.protocolSection?.statusModule?.overallStatus === "RECRUITING",
  ).length;
  return {
    queryId: config.id,
    label: config.label,
    value: total,
    recruitingCount: recruiting,
    unit: "trials",
    capacity: config.capacity,
    observedAt: new Date().toISOString(),
    source: `ClinicalTrials.gov · ${config.id} (${recruiting} recruiting / ${total} total)`,
  };
}

export function mockClinicalTrialsFeed(): ClinicalTrialsFeed {
  const observedAt = new Date().toISOString();
  return {
    fetchedAt: observedAt,
    observations: CLINICAL_TRIALS_QUERIES.map((q) => ({
      queryId: q.id,
      label: q.label,
      value: q.mockValue,
      recruitingCount: Math.floor(q.mockValue / 2),
      unit: "trials",
      capacity: q.capacity,
      observedAt,
      source: `ClinicalTrials.gov · ${q.id} (mock — upstream unreachable)`,
    })),
  };
}
