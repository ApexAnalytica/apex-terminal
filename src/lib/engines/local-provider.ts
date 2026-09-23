// ─── Local Engine Provider ─────────────────────────────────────
// Implements EngineProvider using current client-side engines.
// This is the default provider for the Vercel deployment.

import type {
  CausalGraph,
  CausalShock,
  CascadeAnalysis,
  OmegaState,
} from "@/lib/types";
import type { EngineProvider } from "./engine-interface";

import { computeCascadeAnalysis, computeOmegaState } from "@/lib/omega-engine";

export class LocalProvider implements EngineProvider {
  discoverStructure(graph: CausalGraph): CascadeAnalysis {
    return computeCascadeAnalysis(graph);
  }

  scanTailRisk(shocks: CausalShock[]): OmegaState {
    return computeOmegaState(shocks);
  }
}
