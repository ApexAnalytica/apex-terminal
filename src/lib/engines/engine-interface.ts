// ─── Engine Provider Interface ─────────────────────────────────
// Common interface for all engine operations. Currently implemented
// by LocalProvider (client-side). Future RemoteProvider will swap
// transport (FastAPI/gRPC) without changing calling code.

import type {
  CausalGraph,
  CausalShock,
  CascadeAnalysis,
  EpochSnapshot,
  OmegaState,
  DoomsdayState,
} from "@/lib/types";
import type { SystemStateSnapshot, TarskiValidationResult } from "@/lib/snapshots/types";
import type { InterdictionResult } from "@/lib/interdiction-engine";

export type { InterdictionResult };

export interface EngineProvider {
  // Spirtes: structure discovery & cascade analysis
  discoverStructure(graph: CausalGraph): CascadeAnalysis;

  // Pearl: counterfactual simulation
  computeCounterfactual(
    graph: CausalGraph,
    shocks: CausalShock[],
    severedEdges: string[],
    config?: Record<string, unknown>
  ): EpochSnapshot[];

  // Pareto: tail risk scanning
  scanTailRisk(shocks: CausalShock[]): OmegaState;
  computeDoomsday(shocks: CausalShock[], buffer: number): DoomsdayState;

  // Tarski: snapshot validation
  validateSnapshot(snapshot: SystemStateSnapshot): TarskiValidationResult;

  // Interdiction: network protection
  solveInterdiction(
    graph: CausalGraph,
    shocks: CausalShock[],
    severedEdges: string[],
    budget?: number,
    mode?: "edge" | "node" | "both"
  ): InterdictionResult;
}
