// ─── Discovery — Run / Edge Schema ────────────────────────────────────
//
// A `DiscoveryRun` is one invocation of a discovery algorithm on a
// cohort. It is the unit of provenance — every edge that ends up
// surfaced in the UI traces back to a specific run via `runId`.
//
// Stored as JSON under `research/runs/<run-id>.json` (gitignored).
// When the API layer lands, `POST /api/discovery/run` returns one of
// these and `GET /api/discovery/run/<id>` re-reads it.
//
// AUDIT / ENTERPRISE LADDER
// -------------------------
// The run record carries everything an audit log needs: who/when, what
// algorithm version, what params, what cohort source-hash. A SOC2-style
// immutable log is then just "append every run to a write-only store"
// — no schema change required.

import type { Cohort } from "./cohort-types";

/**
 * Algorithm identifier carried in every run record. Versioning matters
 * — discovery output is only reproducible if the algorithm is pinned.
 */
export interface AlgorithmDescriptor {
  /** e.g. "pcmci-plus", "fci", "lag-correlation". */
  id: string;
  /** Semver-style version of the algorithm implementation. */
  version: string;
}

/**
 * One discovered edge. Algorithms emit many of these; the UI then
 * merges them into the existing CausalGraph view tagged with their
 * `discoverySource`.
 */
export interface DiscoveredEdge {
  /** Source variable id (matches `Variable.id`). */
  source: string;
  /** Target variable id. */
  target: string;
  /**
   * Lag in the cohort's time-axis units (seconds-since-t0). `undefined`
   * for contemporaneous edges; positive for lagged source → target.
   */
  lag?: number;
  /**
   * Edge strength. Algorithm-specific; bounded to [-1, 1] for
   * correlation-flavoured measures, |β| or partial-correlation for
   * regression-flavoured. The UI normalises for display.
   */
  strength: number;
  /** Two-sided p-value (when the algorithm produces one). */
  pValue?: number;
  /**
   * Short human-readable rationale. Surfaces in the UI tooltip so a
   * clinician can see *why* this edge was proposed without reading the
   * algorithm internals.
   */
  evidence: string;
}

/**
 * Per-algorithm diagnostics (residuals, conditioning sets, FDR-adjusted
 * thresholds, etc.). Opaque to the UI; useful for downstream audit.
 */
export type DiscoveryDiagnostics = Record<string, unknown>;

/**
 * The structural payload of a run. Variables are included so a viewer
 * can see which signals the algorithm considered — discovery often
 * prunes some inputs as un-conditionable.
 */
export interface DiscoveryResult {
  /** Variables actually used in the run (subset of cohort.variables). */
  variables: string[];
  /** Discovered edges. */
  edges: DiscoveredEdge[];
  /** Algorithm-specific diagnostics. */
  diagnostics?: DiscoveryDiagnostics;
}

/**
 * The full record of one algorithm-run-on-one-cohort. Persisted as
 * JSON for reproducibility; the cohort is referenced by id rather than
 * embedded so the file stays a few KB.
 */
export interface DiscoveryRun {
  /** Stable run id (UUID v4 or content-addressed hash). */
  id: string;
  /** Cohort this was run against. */
  cohortId: string;
  /** Hash of the cohort source at run time (for drift detection). */
  cohortSourceHash?: string;
  /** Algorithm and version. */
  algorithm: AlgorithmDescriptor;
  /** Parameters the algorithm was invoked with. */
  params: Record<string, unknown>;
  /** ISO 8601 timestamps. */
  startedAt: string;
  completedAt: string;
  /** Run terminal state. */
  status: "succeeded" | "failed" | "partial";
  /** Optional error string when status !== "succeeded". */
  error?: string;
  /** Discovered structure. */
  result: DiscoveryResult;
}

/**
 * Helper signature for code that constructs a run from a successful
 * algorithm invocation. Keeps the run-record assembly in one place.
 */
export interface DiscoveryRunInputs {
  id: string;
  cohort: Cohort;
  algorithm: AlgorithmDescriptor;
  params: Record<string, unknown>;
  startedAt: string;
  completedAt: string;
  result: DiscoveryResult;
}

/**
 * Build a complete run record from inputs. Pulls cohortId + sourceHash
 * from the cohort so callers don't have to thread them separately.
 */
export function buildDiscoveryRun(inputs: DiscoveryRunInputs): DiscoveryRun {
  return {
    id: inputs.id,
    cohortId: inputs.cohort.id,
    cohortSourceHash: inputs.cohort.source.sourceHash,
    algorithm: inputs.algorithm,
    params: inputs.params,
    startedAt: inputs.startedAt,
    completedAt: inputs.completedAt,
    status: "succeeded",
    result: inputs.result,
  };
}
