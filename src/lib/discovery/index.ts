// ─── Discovery — Public Entry Point ──────────────────────────────────
//
// Re-exports the schema and interfaces. Adapters and algorithms import
// types from here; the rest of the codebase imports nothing else from
// `src/lib/discovery/`.

export type {
  Cohort,
  CohortMetadata,
  CohortSource,
  ConceptCode,
  Measurement,
  Subject,
  TimeAxis,
  Variable,
} from "./cohort-types";

export type {
  AlgorithmDescriptor,
  DiscoveredEdge,
  DiscoveryDiagnostics,
  DiscoveryResult,
  DiscoveryRun,
  DiscoveryRunInputs,
} from "./run-types";

export { buildDiscoveryRun } from "./run-types";

export type { CohortIngester, IngestOptions } from "./ingester-interface";

export type { DiscoveryAlgorithm } from "./algorithm-interface";
