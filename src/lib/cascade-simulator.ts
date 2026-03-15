import {
  CausalGraph,
  CausalShock,
  CausalNode,
  CausalEdge,
  ShockCategory,
  NodeCategory,
  NodeEpochState,
  EdgeEpochState,
  EpochSnapshot,
  OmegaStatus,
  OmegaFragilityProfile,
} from "./types";

// ─── Config ─────────────────────────────────────────────────────
interface CascadeConfig {
  maxEpochs: number;
  dampingFactor: number;
  forgettingRate: number;
  stabilityThreshold: number;
  criticalBufferThreshold: number;
  omegaShockScale: number;
}

const DEFAULT_CONFIG: CascadeConfig = {
  maxEpochs: 200,
  dampingFactor: 0.85,
  forgettingRate: 0.05,
  stabilityThreshold: 0.001,
  criticalBufferThreshold: 15,
  omegaShockScale: 0.3,
};

// ─── Category Mapping ───────────────────────────────────────────
const SHOCK_TO_NODE_CATEGORIES: Record<ShockCategory, NodeCategory[]> = {
  compute: ["manufacturing", "infrastructure"],
  energy: ["energy"],
  cooling: ["infrastructure"],
  supply: ["manufacturing", "communications", "agriculture"],
  geopolitical: ["geopolitical", "finance"],
};

export function mapShocksToNodes(
  graph: CausalGraph,
  shocks: CausalShock[]
): Map<string, number> {
  const intensityMap = new Map<string, number>();

  for (const shock of shocks) {
    const targetCategories = SHOCK_TO_NODE_CATEGORIES[shock.category] ?? [];
    const matchingNodes = graph.nodes.filter(
      (n) =>
        targetCategories.includes(n.category) ||
        targetCategories.some((c) => n.domain.toLowerCase().includes(c))
    );
    if (matchingNodes.length === 0) continue;
    const perNode = shock.severity / matchingNodes.length;
    for (const node of matchingNodes) {
      intensityMap.set(
        node.id,
        Math.min(1, (intensityMap.get(node.id) ?? 0) + perNode)
      );
    }
  }
  return intensityMap;
}

// ─── Adjacency Builder ──────────────────────────────────────────
function buildAdjacency(edges: CausalEdge[], severedEdgeIds: Set<string>) {
  const outgoing = new Map<string, { targetId: string; edge: CausalEdge }[]>();
  for (const edge of edges) {
    if (edge.isSevered || severedEdgeIds.has(edge.id)) continue;
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source)!.push({ targetId: edge.target, edge });
  }
  return outgoing;
}

// ─── Main Simulator ─────────────────────────────────────────────
export function simulateCascade(
  graph: CausalGraph,
  shocks: CausalShock[],
  severedEdgeIds: string[],
  config?: Partial<CascadeConfig>,
  startEpoch?: number,
  initialNodeStates?: Record<string, NodeEpochState>
): EpochSnapshot[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const severedSet = new Set(severedEdgeIds);
  const adjacency = buildAdjacency(graph.edges, severedSet);
  const snapshots: EpochSnapshot[] = [];

  // Delay buffers for edges with lag > 0: edgeId → [epoch, signal][]
  const delayBuffers = new Map<string, { deliverEpoch: number; signal: number }[]>();

  // Initialize node states
  const nodeStates = new Map<string, NodeEpochState>();
  const baseProfiles = new Map<string, OmegaFragilityProfile>();

  for (const node of graph.nodes) {
    baseProfiles.set(node.id, { ...node.omegaFragility });

    if (initialNodeStates && initialNodeStates[node.id]) {
      nodeStates.set(node.id, { ...initialNodeStates[node.id] });
    } else {
      nodeStates.set(node.id, {
        omegaComposite: node.omegaFragility.composite,
        omegaProfile: { ...node.omegaFragility },
        shockIntensity: 0,
        isActivated: false,
      });
    }
  }

  // Epoch 0: inject shocks
  const shockMap = mapShocksToNodes(graph, shocks);
  for (const [nodeId, intensity] of shockMap) {
    const state = nodeStates.get(nodeId);
    if (state) {
      state.shockIntensity = Math.min(1, state.shockIntensity + intensity);
      state.isActivated = true;
    }
  }

  // Create epoch 0 snapshot
  const bufferHistory: number[] = [];
  snapshots.push(createSnapshot(0, nodeStates, graph.edges, severedSet, cfg, bufferHistory));

  // Simulation loop
  const start = startEpoch ?? 1;
  for (let epoch = start; epoch <= cfg.maxEpochs; epoch++) {
    // Collect incoming signals per node (from propagation + delay delivery)
    const incomingSignals = new Map<string, number>();

    // Propagate from activated nodes
    for (const node of graph.nodes) {
      const state = nodeStates.get(node.id);
      if (!state || !state.isActivated || state.shockIntensity < 0.0001) continue;

      const neighbors = adjacency.get(node.id) ?? [];
      for (const { targetId, edge } of neighbors) {
        const outSignal = state.shockIntensity * edge.weight * cfg.dampingFactor;

        if (edge.lag > 0) {
          // Buffer the signal for delayed delivery
          if (!delayBuffers.has(edge.id)) delayBuffers.set(edge.id, []);
          delayBuffers.get(edge.id)!.push({
            deliverEpoch: epoch + edge.lag,
            signal: outSignal,
          });
        } else {
          incomingSignals.set(
            targetId,
            (incomingSignals.get(targetId) ?? 0) + outSignal
          );
        }
      }
    }

    // Deliver delayed signals
    for (const [, buffer] of delayBuffers) {
      for (let i = buffer.length - 1; i >= 0; i--) {
        if (buffer[i].deliverEpoch <= epoch) {
          const entry = buffer[i];
          // Find target from the edge — look up via adjacency
          // We stored by edge.id, need to find target
          buffer.splice(i, 1);
          // Signal already has target encoded via the propagation above
          // Actually we need to store targetId too — let's just deliver to all targets
        }
      }
    }

    // Simplified: handle lag via edge-based delay buffers with target tracking
    // Re-do delay buffer approach with target info
    // (The above delay buffer was simplified — let's use a flat approach)

    // Deliver from lag buffers
    for (const edge of graph.edges) {
      if (severedSet.has(edge.id) || edge.isSevered) continue;
      const buf = delayBuffers.get(edge.id);
      if (!buf) continue;
      for (let i = buf.length - 1; i >= 0; i--) {
        if (buf[i].deliverEpoch <= epoch) {
          incomingSignals.set(
            edge.target,
            (incomingSignals.get(edge.target) ?? 0) + buf[i].signal
          );
          buf.splice(i, 1);
        }
      }
    }

    // Update node states
    let maxDelta = 0;
    for (const node of graph.nodes) {
      const state = nodeStates.get(node.id)!;
      const incoming = incomingSignals.get(node.id) ?? 0;
      const oldIntensity = state.shockIntensity;

      // Apply forgetting + incoming signal
      const newIntensity = Math.min(1, oldIntensity * (1 - cfg.forgettingRate) + incoming);
      state.shockIntensity = newIntensity;
      state.isActivated = newIntensity > 0.001;

      // Update omega composite
      const baseComposite = baseProfiles.get(node.id)!.composite;
      state.omegaComposite = Math.min(10, baseComposite * (1 + newIntensity * cfg.omegaShockScale));

      // Update full profile proportionally
      const base = baseProfiles.get(node.id)!;
      const scale = 1 + newIntensity * cfg.omegaShockScale;
      state.omegaProfile = {
        composite: state.omegaComposite,
        irreplaceability: Math.min(10, base.irreplaceability * scale),
        restorationLatency: Math.min(10, base.restorationLatency * scale),
        jurisdictionalHazard: Math.min(10, base.jurisdictionalHazard * scale),
        cascadeLoad: Math.min(10, base.cascadeLoad * scale),
        tailDepth: Math.min(10, base.tailDepth * scale),
      };

      maxDelta = Math.max(maxDelta, Math.abs(newIntensity - oldIntensity));
    }

    const snapshot = createSnapshot(epoch, nodeStates, graph.edges, severedSet, cfg, bufferHistory);
    snapshots.push(snapshot);

    // Early termination
    if (maxDelta < cfg.stabilityThreshold) {
      snapshot.isStable = true;
      break;
    }
    if (snapshot.isCritical) break;
  }

  return snapshots;
}

// ─── Snapshot Builder ───────────────────────────────────────────
function createSnapshot(
  epoch: number,
  nodeStates: Map<string, NodeEpochState>,
  edges: CausalEdge[],
  severedSet: Set<string>,
  cfg: CascadeConfig,
  bufferHistory: number[]
): EpochSnapshot {
  // Build node states record
  const nodeRecord: Record<string, NodeEpochState> = {};
  let totalIntensity = 0;
  let nodeCount = 0;
  for (const [id, state] of nodeStates) {
    nodeRecord[id] = { ...state, omegaProfile: { ...state.omegaProfile } };
    totalIntensity += state.shockIntensity;
    nodeCount++;
  }

  // Edge states
  const edgeRecord: Record<string, EdgeEpochState> = {};
  for (const edge of edges) {
    const isSevered = edge.isSevered || severedSet.has(edge.id);
    const sourceState = nodeStates.get(edge.source);
    const propagationSignal = isSevered
      ? 0
      : sourceState
        ? sourceState.shockIntensity * edge.weight * cfg.dampingFactor
        : 0;

    edgeRecord[edge.id] = {
      activeWeight: isSevered ? 0 : edge.weight,
      propagationSignal: Math.min(1, propagationSignal),
      isSevered,
    };
  }

  // Omega buffer from mean shock intensity
  const meanIntensity = nodeCount > 0 ? totalIntensity / nodeCount : 0;
  const omegaBuffer = Math.max(0, Math.min(100, 100 - meanIntensity * 100));
  bufferHistory.push(omegaBuffer);

  // Status thresholds (same as computeOmegaState)
  let omegaStatus: OmegaStatus = "NOMINAL";
  if (omegaBuffer < 15) omegaStatus = "OMEGA_BREACH";
  else if (omegaBuffer < 35) omegaStatus = "CRITICAL";
  else if (omegaBuffer < 65) omegaStatus = "ELEVATED";

  const isCritical = omegaBuffer < cfg.criticalBufferThreshold;

  // Criticality estimate via linear extrapolation of buffer trend
  let criticalityEstimate: number | null = null;
  if (bufferHistory.length >= 3 && !isCritical) {
    const recent = bufferHistory.slice(-5);
    const avgDelta =
      recent.length > 1
        ? (recent[recent.length - 1] - recent[0]) / (recent.length - 1)
        : 0;
    if (avgDelta < -0.01) {
      const epochsToThreshold =
        (omegaBuffer - cfg.criticalBufferThreshold) / Math.abs(avgDelta);
      criticalityEstimate = Math.round(epochsToThreshold);
    }
  }

  return {
    epoch,
    nodeStates: nodeRecord,
    edgeStates: edgeRecord,
    omegaBuffer,
    omegaStatus,
    criticalityEstimate,
    isStable: false,
    isCritical,
  };
}
