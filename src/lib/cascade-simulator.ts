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
  omegaShockScale: 0.6,
};

// ─── Category Mapping ───────────────────────────────────────────
// Maps an incoming shock to the node categories it can strike. The `science`
// category covers biomedical / research nodes (e.g. T1D pathway graphs) and
// must appear under health / regulatory / environmental — otherwise a shock
// injected from a T1D-domain session lands on zero nodes, the cascade stays
// flat, and the solver's fallback ("cascade damage too low to rank cuts")
// fires even though the graph has clear structural vulnerabilities.
const SHOCK_TO_NODE_CATEGORIES: Record<ShockCategory, NodeCategory[]> = {
  compute: ["manufacturing", "infrastructure"],
  energy: ["energy"],
  cooling: ["infrastructure"],
  supply: ["manufacturing", "communications", "agriculture"],
  geopolitical: ["geopolitical", "finance"],
  financial: ["finance", "economic"],
  cyber: ["infrastructure", "communications"],
  regulatory: ["finance", "economic", "geopolitical", "science"],
  environmental: ["energy", "infrastructure", "agriculture", "science"],
  health: ["economic", "agriculture", "science"],
};

export function mapShocksToNodes(
  graph: CausalGraph,
  shocks: CausalShock[]
): Map<string, number> {
  const intensityMap = new Map<string, number>();
  const nodeIdSet = new Set(graph.nodes.map((n) => n.id));

  for (const shock of shocks) {
    // Explicit targeting takes precedence over category broadcast. This is
    // the path used by tightly-scoped subgraph attacks (e.g. VX-880 graft
    // preset) where broadcasting to every "science"-category node would
    // saturate the graph and make every cut look identical to the solver.
    if (shock.targetNodes && shock.targetNodes.length > 0) {
      for (const nodeId of shock.targetNodes) {
        if (!nodeIdSet.has(nodeId)) continue;
        intensityMap.set(
          nodeId,
          Math.min(1, (intensityMap.get(nodeId) ?? 0) + shock.severity)
        );
      }
      continue;
    }

    const targetCategories = SHOCK_TO_NODE_CATEGORIES[shock.category] ?? [];
    const matchingNodes = graph.nodes.filter(
      (n) =>
        targetCategories.includes(n.category) ||
        targetCategories.some((c) => n.domain.toLowerCase().includes(c))
    );
    if (matchingNodes.length === 0) continue;
    // Scenario-level severity applies to each matching node, not divided across them.
    // Dividing would make big shocks vanish in large graphs, leaving cuts indistinguishable.
    for (const node of matchingNodes) {
      intensityMap.set(
        node.id,
        Math.min(1, (intensityMap.get(node.id) ?? 0) + shock.severity)
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
// ─── Internal simulation context ────────────────────────────────
//
// Both the sync and the async simulators reuse this setup + the same
// `runEpoch` body. Keeping the per-epoch work in one place is what lets
// the async variant chunk it across idle frames without forking the
// algorithm.
interface CascadeContext {
  graph: CausalGraph;
  cfg: CascadeConfig;
  severedSet: Set<string>;
  adjacency: ReturnType<typeof buildAdjacency>;
  nodeStates: Map<string, NodeEpochState>;
  baseProfiles: Map<string, OmegaFragilityProfile>;
  delayBuffers: Map<string, { deliverEpoch: number; signal: number }[]>;
  bufferHistory: number[];
  snapshots: EpochSnapshot[];
}

function initCascadeContext(
  graph: CausalGraph,
  shocks: CausalShock[],
  severedEdgeIds: string[],
  config?: Partial<CascadeConfig>,
  initialNodeStates?: Record<string, NodeEpochState>
): CascadeContext {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const severedSet = new Set(severedEdgeIds);
  const adjacency = buildAdjacency(graph.edges, severedSet);
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

  // Epoch 0: inject shocks.
  const shockMap = mapShocksToNodes(graph, shocks);
  for (const [nodeId, intensity] of shockMap) {
    const state = nodeStates.get(nodeId);
    if (state) {
      state.shockIntensity = Math.min(1, state.shockIntensity + intensity);
      state.isActivated = true;
    }
  }

  const bufferHistory: number[] = [];
  const snapshots: EpochSnapshot[] = [];
  snapshots.push(
    createSnapshot(0, nodeStates, graph.edges, severedSet, cfg, bufferHistory),
  );

  return {
    graph,
    cfg,
    severedSet,
    adjacency,
    nodeStates,
    baseProfiles,
    delayBuffers: new Map(),
    bufferHistory,
    snapshots,
  };
}

/**
 * Run a single epoch in-place against the context. Returns "stable",
 * "critical", or "running" so the caller can decide whether to break the
 * loop (sync simulator) or schedule the next chunk (async simulator).
 */
function runEpoch(epoch: number, ctx: CascadeContext): "stable" | "critical" | "running" {
  const { graph, cfg, severedSet, adjacency, nodeStates, baseProfiles, delayBuffers, bufferHistory, snapshots } = ctx;

  const incomingSignals = new Map<string, number>();

  // Propagate from activated nodes.
  for (const node of graph.nodes) {
    const state = nodeStates.get(node.id);
    if (!state || !state.isActivated || state.shockIntensity < 0.0001) continue;

    const neighbors = adjacency.get(node.id) ?? [];
    for (const { targetId, edge } of neighbors) {
      const outSignal = state.shockIntensity * edge.weight * cfg.dampingFactor;
      if (edge.lag > 0) {
        if (!delayBuffers.has(edge.id)) delayBuffers.set(edge.id, []);
        delayBuffers.get(edge.id)!.push({
          deliverEpoch: epoch + edge.lag,
          signal: outSignal,
        });
      } else {
        incomingSignals.set(
          targetId,
          (incomingSignals.get(targetId) ?? 0) + outSignal,
        );
      }
    }
  }

  // Drain expired delay-buffer entries (legacy: walks every buffer).
  for (const [, buffer] of delayBuffers) {
    for (let i = buffer.length - 1; i >= 0; i--) {
      if (buffer[i].deliverEpoch <= epoch) {
        buffer.splice(i, 1);
      }
    }
  }

  // Deliver lagged signals to their target nodes.
  for (const edge of graph.edges) {
    if (severedSet.has(edge.id) || edge.isSevered) continue;
    const buf = delayBuffers.get(edge.id);
    if (!buf) continue;
    for (let i = buf.length - 1; i >= 0; i--) {
      if (buf[i].deliverEpoch <= epoch) {
        incomingSignals.set(
          edge.target,
          (incomingSignals.get(edge.target) ?? 0) + buf[i].signal,
        );
        buf.splice(i, 1);
      }
    }
  }

  // Update node states.
  let maxDelta = 0;
  for (const node of graph.nodes) {
    const state = nodeStates.get(node.id)!;
    const incoming = incomingSignals.get(node.id) ?? 0;
    const oldIntensity = state.shockIntensity;

    const newIntensity = Math.min(1, oldIntensity * (1 - cfg.forgettingRate) + incoming);
    state.shockIntensity = newIntensity;
    state.isActivated = newIntensity > 0.001;

    const baseComposite = baseProfiles.get(node.id)!.composite;
    state.omegaComposite = Math.min(10, baseComposite * (1 + newIntensity * cfg.omegaShockScale));

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

  if (maxDelta < cfg.stabilityThreshold) {
    snapshot.isStable = true;
    return "stable";
  }
  if (snapshot.isCritical) return "critical";
  return "running";
}

export function simulateCascade(
  graph: CausalGraph,
  shocks: CausalShock[],
  severedEdgeIds: string[],
  config?: Partial<CascadeConfig>,
  startEpoch?: number,
  initialNodeStates?: Record<string, NodeEpochState>
): EpochSnapshot[] {
  const ctx = initCascadeContext(graph, shocks, severedEdgeIds, config, initialNodeStates);

  const start = startEpoch ?? 1;
  for (let epoch = start; epoch <= ctx.cfg.maxEpochs; epoch++) {
    const status = runEpoch(epoch, ctx);
    if (status !== "running") break;
  }
  return ctx.snapshots;
}

/**
 * Async variant: same algorithm as `simulateCascade`, but the epoch loop
 * is split into chunks of `chunkEpochs` (default 25) with a yield between
 * chunks via `requestIdleCallback` (browser) or `setTimeout(_, 0)` (node).
 *
 * Use this from the UI thread — the cascade no longer freezes the frame
 * for the full 200-epoch run on shock injection. The full N-epoch latency
 * is unchanged in wall-clock terms; it's just split across idle frames so
 * the browser stays responsive.
 *
 * Synchronous callers (interdiction-engine, local-provider, tests that
 * need deterministic single-tick execution) should keep using
 * `simulateCascade`.
 */
export interface CascadeAsyncOptions {
  /** Epochs per chunk before yielding. Default 25. */
  chunkEpochs?: number;
  /** AbortSignal — when triggered, stops the loop and resolves with what was computed. */
  signal?: AbortSignal;
}

export async function simulateCascadeAsync(
  graph: CausalGraph,
  shocks: CausalShock[],
  severedEdgeIds: string[],
  config?: Partial<CascadeConfig>,
  startEpoch?: number,
  initialNodeStates?: Record<string, NodeEpochState>,
  asyncOpts?: CascadeAsyncOptions,
): Promise<EpochSnapshot[]> {
  const ctx = initCascadeContext(graph, shocks, severedEdgeIds, config, initialNodeStates);
  const chunkEpochs = Math.max(1, Math.floor(asyncOpts?.chunkEpochs ?? 25));
  const signal = asyncOpts?.signal;

  const start = startEpoch ?? 1;
  let epoch = start;
  while (epoch <= ctx.cfg.maxEpochs) {
    if (signal?.aborted) return ctx.snapshots;

    const chunkEnd = Math.min(ctx.cfg.maxEpochs, epoch + chunkEpochs - 1);
    let earlyExit: "stable" | "critical" | null = null;
    for (; epoch <= chunkEnd; epoch++) {
      const status = runEpoch(epoch, ctx);
      if (status !== "running") {
        earlyExit = status;
        break;
      }
    }
    if (earlyExit) return ctx.snapshots;

    // Yield to the event loop so paint + input handlers run before the
    // next chunk. Prefer requestIdleCallback when available (browsers);
    // fall back to setTimeout(_, 0) (node tests, older browsers).
    await yieldToEventLoop();
  }

  return ctx.snapshots;
}

function yieldToEventLoop(): Promise<void> {
  return new Promise<void>((resolve) => {
    const w = typeof globalThis !== "undefined"
      ? (globalThis as unknown as {
          requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => void;
        })
      : undefined;
    if (w?.requestIdleCallback) {
      w.requestIdleCallback(() => resolve(), { timeout: 50 });
    } else {
      setTimeout(resolve, 0);
    }
  });
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
