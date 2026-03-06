// ─── Snapshot Serializer ───────────────────────────────────────
// Pure function: assembles a SystemStateSnapshot from current
// Zustand state + engine outputs. No API calls.

import type {
  CausalGraph,
  CausalShock,
  ModuleId,
  EpochSnapshot,
} from "@/lib/types";
import { computeOmegaState, computeCascadeAnalysis } from "@/lib/omega-engine";
import type { SystemStateSnapshot, SnapshotNode, SnapshotEdge } from "./types";

interface BuildSnapshotInput {
  graph: CausalGraph;
  shocks: CausalShock[];
  severedEdges: string[];
  activeModule: ModuleId;
  epochs?: EpochSnapshot[];
  currentEpoch?: number;
}

export function buildSnapshot(input: BuildSnapshotInput): SystemStateSnapshot {
  const { graph, shocks, severedEdges, activeModule, epochs, currentEpoch } =
    input;

  // Derive node states — use epoch data if replaying, otherwise static graph
  const epochSnap =
    epochs && currentEpoch != null ? epochs[currentEpoch] : undefined;

  const nodes: SnapshotNode[] = graph.nodes.map((n) => {
    const epochState = epochSnap?.nodeStates[n.id];
    return {
      id: n.id,
      omega: epochState?.omegaComposite ?? n.omegaFragility.composite,
      fragility: epochState?.shockIntensity ?? 0,
      isActivated: epochState?.isActivated ?? false,
    };
  });

  const edges: SnapshotEdge[] = graph.edges.map((e) => {
    const epochState = epochSnap?.edgeStates[e.id];
    return {
      id: e.id,
      weight: epochState?.activeWeight ?? e.weight,
      probability: e.confidence,
      isSevered: severedEdges.includes(e.id) || (e.isSevered ?? false),
    };
  });

  // Engine outputs
  const cascade = computeCascadeAnalysis(graph);
  const omegaState = computeOmegaState(shocks);

  const spirtes = {
    density: graph.metadata.density,
    lambdaMax: cascade.lambdaMax,
    isStable: cascade.isStable,
  };

  const pareto = {
    omegaBuffer: epochSnap?.omegaBuffer ?? omegaState.buffer,
    status: epochSnap?.omegaStatus ?? omegaState.status,
    criticalityEstimate: epochSnap?.criticalityEstimate ?? -1,
  };

  const pearl = {
    interventionCount: severedEdges.length,
    severedEdges: [...severedEdges],
  };

  return {
    version: 1,
    timestamp: new Date().toISOString(),
    graph: { nodes, edges },
    engineOutputs: { spirtes, pareto, pearl },
    tarskiValidation: {
      status: "PENDING",
      violations: [],
      checkedAt: new Date().toISOString(),
    },
    metadata: {
      epochCount: epochs?.length ?? 0,
      shockCount: shocks.length,
      activeModule,
    },
  };
}
