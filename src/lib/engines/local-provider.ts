// ─── Local Engine Provider ─────────────────────────────────────
// Implements EngineProvider using current client-side engines.
// This is the default provider for the Vercel deployment.

import type {
  CausalGraph,
  CausalShock,
  CascadeAnalysis,
  EpochSnapshot,
  OmegaState,
  DoomsdayState,
} from "@/lib/types";
import type { SystemStateSnapshot, TarskiValidationResult } from "@/lib/snapshots/types";
import type { EngineProvider } from "./engine-interface";
import type { InterdictionResult } from "@/lib/interdiction-engine";

import { computeCascadeAnalysis, computeOmegaState, computeDoomsdayState } from "@/lib/omega-engine";
import { simulateCascade } from "@/lib/cascade-simulator";
import { validateSnapshot } from "@/lib/snapshots/tarski-validator";
import { solveInterdiction as solveInterdictionLocal } from "@/lib/interdiction-engine";

export class LocalProvider implements EngineProvider {
  discoverStructure(graph: CausalGraph): CascadeAnalysis {
    return computeCascadeAnalysis(graph);
  }

  computeCounterfactual(
    graph: CausalGraph,
    shocks: CausalShock[],
    severedEdges: string[],
    config?: Record<string, unknown>
  ): EpochSnapshot[] {
    return simulateCascade(graph, shocks, severedEdges, config as undefined);
  }

  scanTailRisk(shocks: CausalShock[]): OmegaState {
    return computeOmegaState(shocks);
  }

  computeDoomsday(shocks: CausalShock[], buffer: number): DoomsdayState {
    return computeDoomsdayState(shocks, buffer);
  }

  validateSnapshot(snapshot: SystemStateSnapshot): TarskiValidationResult {
    return validateSnapshot(snapshot);
  }

  solveInterdiction(
    graph: CausalGraph,
    shocks: CausalShock[],
    severedEdges: string[],
    budget = 3,
    mode: "edge" | "node" | "both" = "edge"
  ): InterdictionResult {
    return solveInterdictionLocal(graph, shocks, severedEdges, budget, mode);
  }
}
