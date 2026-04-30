// ─── Discovery — Cohort Ingester Interface ───────────────────────────
//
// An ingester adapter reads a source format (XML, CSV, parquet, API)
// and produces a normalised `Cohort`. Adapters live in
// `src/lib/discovery/ingesters/<name>.ts` and are responsible for:
//
//  - Parsing the source format
//  - De-identifying subjects (Subject.id MUST be opaque)
//  - Mapping source variables to a stable variable id + concept code
//  - Computing a sourceHash for drift detection
//  - Returning a Cohort with `containsPHI: false`
//
// Adapters are NOT responsible for:
//  - Discovery algorithms (those live in algorithms/)
//  - UI rendering
//  - Persistence (the caller writes the Cohort wherever it wants)
//
// ENTERPRISE LADDER
// -----------------
// Today an adapter reads from a local file path. Tomorrow the same
// interface backs API ingestion (`POST /api/discovery/ingest` with a
// multipart upload), pull-from-bucket flows (S3 / GCS), and direct
// EHR/Tidepool/Dexcom OAuth pulls. The interface stays the same — only
// the `ingest()` body changes per adapter.

import type { Cohort } from "./cohort-types";

/**
 * Options every adapter accepts. Adapters can extend this with their
 * own params via the generic on `CohortIngester`.
 */
export interface IngestOptions {
  /** Override the default cohort id. */
  cohortIdOverride?: string;
  /** Limit to first N subjects (smoke-test mode). */
  maxSubjects?: number;
  /** Override the timestamp used in CohortSource.ingestedAt. */
  ingestedAt?: string;
}

/**
 * One ingester adapter. Generic `O` lets a specific adapter add its
 * own ingest options without losing the shared base.
 */
export interface CohortIngester<O extends IngestOptions = IngestOptions> {
  /** Adapter id (e.g. "ohio-t1dm"). Stable across versions. */
  id: string;
  /** Adapter implementation version (semver). */
  version: string;
  /** What this adapter ingests, in plain English. */
  description: string;
  /** Concept-coding systems this adapter populates (LOINC/SNOMED/etc.). */
  conceptSystems: ReadonlyArray<"LOINC" | "SNOMED-CT" | "ICD-10" | "RxNorm" | "UCUM">;
  /**
   * Read source files from `sourcePath` and produce a normalised
   * Cohort.
   *
   * Contract:
   *  - Throws if the source is malformed or missing
   *  - Returned Cohort.source.containsPHI MUST be `false`
   *  - All Subject.id values MUST be opaque (hashed / random / index)
   *  - sourceHash should be populated when feasible
   */
  ingest(sourcePath: string, options?: O): Promise<Cohort>;
}
