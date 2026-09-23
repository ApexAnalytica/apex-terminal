// ─── Discovery — Algorithm Interface ─────────────────────────────────
//
// A discovery algorithm reads a `Cohort` and produces a
// `DiscoveryResult`. Algorithms live in
// `src/lib/discovery/algorithms/<name>.ts`.
//
// Contract:
//  - The algorithm MUST NOT mutate the input cohort
//  - The algorithm MUST NOT have side effects (no fs writes, no
//    network calls). Persistence is the caller's job.
//  - The returned DiscoveryResult.variables MUST be a subset of
//    cohort.variables.map(v => v.id)
//  - DiscoveredEdge.source/target MUST appear in result.variables
//
// The generic `P` carries the algorithm's parameter shape so callers
// get type-safe param overrides.
//
// ENTERPRISE LADDER
// -----------------
// Today an algorithm runs synchronously in-process. Tomorrow the same
// interface backs an async worker (`POST /api/discovery/run` enqueues
// a job, the worker invokes the algorithm, the run record drops in the
// audit store). Nothing about the algorithm code needs to change.

import type { Cohort } from "./cohort-types";
import type { DiscoveryResult } from "./run-types";

/**
 * One discovery algorithm. Generic `P` is the param shape; defaults
 * to `Record<string, unknown>` for algorithms that don't expose
 * structured params.
 */
export interface DiscoveryAlgorithm<P = Record<string, unknown>> {
  /** Algorithm id (e.g. "pcmci-plus"). Stable across versions. */
  id: string;
  /** Implementation version (semver). */
  version: string;
  /** Human description. */
  description: string;
  /** Default parameters. Callers can spread `defaultParams` then override. */
  defaultParams: P;
  /**
   * Run the algorithm. Pure function — no fs/network/randomness
   * leakage outside what's documented in `params`.
   */
  run(cohort: Cohort, params?: Partial<P>): DiscoveryResult;
}
