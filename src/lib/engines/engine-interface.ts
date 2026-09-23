// ─── Engine Provider Interface ─────────────────────────────────
// Common interface for all engine operations. Currently implemented
// by LocalProvider (client-side). Future RemoteProvider will swap
// transport (FastAPI/gRPC) without changing calling code.
//
// Only the methods that have at least one active caller live here.
// Earlier revisions kept future-stubs (`computeCounterfactual`,
// `validateSnapshot`, `solveInterdiction`, `computeDoomsday`) which
// dragged ~1100 LOC of transitive deps (cascade-simulator,
// tarski-validator, interdiction-engine) into the critical-path
// bundle even though nothing called them. When a remote backend is
// wired up the interface can grow back with the correct async
// signatures.

import type {
  CausalGraph,
  CausalShock,
  CascadeAnalysis,
  OmegaState,
} from "@/lib/types";

export interface EngineProvider {
  // Spirtes: structure discovery & cascade analysis
  discoverStructure(graph: CausalGraph): CascadeAnalysis;

  // Pareto: tail risk scanning
  scanTailRisk(shocks: CausalShock[]): OmegaState;
}
