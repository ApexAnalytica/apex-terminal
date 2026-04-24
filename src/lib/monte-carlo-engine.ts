import type {
  CausalGraph,
  CausalEdge,
  CausalNode,
  OmegaFragilityProfile,
} from "./types";
import type { TrialPrior } from "./trial-prior";

// ─── Types ─────────────────────────────────────────────────────
export interface MCConfig {
  numPaths: number;        // number of simulation paths
  horizonEpochs: number;   // forecast horizon (steps)
  dampingFactor: number;
  forgettingRate: number;
  noiseScale: number;      // stochastic perturbation magnitude
  omegaShockScale: number;
  /**
   * Optional survival prior — when set, each path additionally emits a
   * P(event by t) trajectory built from a per-path β* ~ N(prior.beta,
   * prior.se²) draw, attenuated by the cascade intensity reaching
   * `prior.outcomeNodeId`. See `TrialPrior` in lib/trial-prior.ts.
   */
  survivalPrior?: TrialPrior;
}

export interface MCPath {
  /** Per-epoch aggregate omega buffer (0-100) for this path */
  omegaBufferSeries: number[];
  /** Per-epoch omega composite for the intervention target node */
  targetOmegaSeries: number[];
  /** Per-epoch omega composite for each tracked downstream node */
  downstreamSeries: Map<string, number[]>;
  /**
   * Per-epoch P(event by t) × 100 in [0, 100] — only populated when
   * `config.survivalPrior` is set. Scaled to 0-100 so the existing
   * fan-chart y-axis renders it without reshaping.
   */
  survivalSeries?: number[];
}

export interface MCForecastResult {
  /** Baseline (no intervention) aggregate paths */
  baselinePaths: MCPath[];
  /** Intervention paths (with do(X) or severed edges) */
  interventionPaths: MCPath[];
  /** Summary statistics per epoch */
  baselineStats: EpochStats[];
  interventionStats: EpochStats[];
  /**
   * Survival stats per epoch, only populated when `config.survivalPrior`
   * was set. Units: P(event by t) × 100 in [0, 100].
   */
  baselineSurvivalStats?: EpochStats[];
  interventionSurvivalStats?: EpochStats[];
  /** The node IDs tracked (target + top downstream) */
  trackedNodeIds: string[];
  /** Horizon used */
  horizonEpochs: number;
}

export interface EpochStats {
  epoch: number;
  mean: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

const DEFAULT_MC_CONFIG: MCConfig = {
  numPaths: 200,
  horizonEpochs: 60,
  dampingFactor: 0.85,
  forgettingRate: 0.05,
  noiseScale: 0.12,
  omegaShockScale: 0.6,
};

// ─── Seeded RNG (Mulberry32) ───────────────────────────────────
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller for normal samples */
function normalSample(rng: () => number, mean = 0, std = 1): number {
  const u1 = rng();
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
  return mean + z * std;
}

// ─── Build Adjacency ───────────────────────────────────────────
function buildOutgoing(
  edges: CausalEdge[],
  severedSet: Set<string>
): Map<string, { targetId: string; weight: number; lag: number }[]> {
  const adj = new Map<string, { targetId: string; weight: number; lag: number }[]>();
  for (const e of edges) {
    if (e.isSevered || severedSet.has(e.id)) continue;
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push({ targetId: e.target, weight: e.weight, lag: e.lag });
  }
  return adj;
}

// ─── Identify Downstream Nodes ─────────────────────────────────
function getDownstreamNodeIds(
  graph: CausalGraph,
  targetNodeId: string,
  severedSet: Set<string>,
  maxDepth = 3
): string[] {
  const visited = new Set<string>();
  const queue: { id: string; depth: number }[] = [{ id: targetNodeId, depth: 0 }];

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (depth > maxDepth) continue;
    for (const e of graph.edges) {
      if (e.source === id && !e.isSevered && !severedSet.has(e.id) && !visited.has(e.target)) {
        visited.add(e.target);
        queue.push({ id: e.target, depth: depth + 1 });
      }
    }
  }
  visited.delete(targetNodeId);
  return Array.from(visited);
}

// ─── Single Stochastic Path ────────────────────────────────────
function simulatePath(
  graph: CausalGraph,
  adj: Map<string, { targetId: string; weight: number; lag: number }[]>,
  targetNodeId: string,
  trackedIds: string[],
  config: MCConfig,
  rng: () => number,
  isIntervention: boolean
): MCPath {
  const baseProfiles = new Map<string, OmegaFragilityProfile>();
  const shockIntensity = new Map<string, number>();

  for (const n of graph.nodes) {
    baseProfiles.set(n.id, { ...n.omegaFragility });
    shockIntensity.set(n.id, 0);
  }

  // Inject initial shock to target node
  const initialShock = 0.6 + normalSample(rng, 0, config.noiseScale * 0.5);
  shockIntensity.set(targetNodeId, Math.min(1, Math.max(0.1, initialShock)));

  // If intervention (do(X)), we sever upstream → target propagation.
  // The target's shock is "forced" — it doesn't receive upstream signals.
  // This means we model what happens when we structurally intervene on X.

  const omegaBufferSeries: number[] = [];
  const targetOmegaSeries: number[] = [];
  const downstreamSeries = new Map<string, number[]>();
  for (const id of trackedIds) downstreamSeries.set(id, []);

  // ── Survival-prior setup (one β* per path) ──
  // The prior acts as a literature-calibrated overlay on top of the
  // cascade simulation. Each path draws its own β* so the fan width
  // at horizon is driven by the Cox SE — tightening when the fit is
  // precise, widening when it isn't. Hazard is attenuated epoch-by-
  // epoch by the cascade intensity at the outcome node: when the
  // attack reaches the outcome, the treatment effect is washed out.
  const prior = config.survivalPrior;
  const betaStar = prior ? normalSample(rng, prior.beta, prior.se) : 0;
  const survivalSeries: number[] | undefined = prior ? [] : undefined;
  let cumulativeHazard = 0;

  // Delay buffers: edgeKey → queued signals
  const delayQueue = new Map<string, { deliverEpoch: number; signal: number }[]>();

  for (let epoch = 0; epoch <= config.horizonEpochs; epoch++) {
    // Epoch-level noise (systemic stochastic jitter)
    const epochNoise = normalSample(rng, 0, config.noiseScale * 0.3);

    // Collect incoming propagation
    const incoming = new Map<string, number>();

    if (epoch > 0) {
      for (const node of graph.nodes) {
        const si = shockIntensity.get(node.id) || 0;
        if (si < 0.0001) continue;

        const neighbors = adj.get(node.id) || [];
        for (const { targetId, weight, lag } of neighbors) {
          // In intervention mode, skip signals INTO the target node
          if (isIntervention && targetId === targetNodeId) continue;

          // Perturb edge weight stochastically
          const noisyWeight = Math.max(0, Math.min(1,
            weight + normalSample(rng, 0, config.noiseScale * 0.2)
          ));
          const signal = si * noisyWeight * config.dampingFactor;

          if (lag > 0) {
            const key = `${node.id}->${targetId}`;
            if (!delayQueue.has(key)) delayQueue.set(key, []);
            delayQueue.get(key)!.push({ deliverEpoch: epoch + lag, signal });
          } else {
            incoming.set(targetId, (incoming.get(targetId) || 0) + signal);
          }
        }
      }

      // Deliver delayed signals
      for (const [key, queue] of delayQueue) {
        const targetId = key.split("->")[1];
        for (let i = queue.length - 1; i >= 0; i--) {
          if (queue[i].deliverEpoch <= epoch) {
            if (!(isIntervention && targetId === targetNodeId)) {
              incoming.set(targetId, (incoming.get(targetId) || 0) + queue[i].signal);
            }
            queue.splice(i, 1);
          }
        }
      }
    }

    // Update shock intensities
    let totalIntensity = 0;
    let nodeCount = 0;
    for (const node of graph.nodes) {
      const old = shockIntensity.get(node.id) || 0;
      const inc = incoming.get(node.id) || 0;

      // Add per-node stochastic jitter
      const nodeNoise = normalSample(rng, 0, config.noiseScale * 0.1);
      let newSI = old * (1 - config.forgettingRate) + inc + nodeNoise * 0.01;

      // In intervention, target maintains forced shock level with slow decay
      if (isIntervention && node.id === targetNodeId) {
        const forcedLevel = (initialShock * Math.exp(-epoch * 0.02))
          + normalSample(rng, 0, config.noiseScale * 0.05);
        newSI = Math.max(0, Math.min(1, forcedLevel));
      }

      newSI = Math.max(0, Math.min(1, newSI));
      shockIntensity.set(node.id, newSI);
      totalIntensity += newSI;
      nodeCount++;
    }

    // Compute omega composites
    const meanIntensity = nodeCount > 0 ? totalIntensity / nodeCount : 0;
    const omegaBuffer = Math.max(0, Math.min(100,
      100 - (meanIntensity + epochNoise * 0.05) * 100
    ));
    omegaBufferSeries.push(omegaBuffer);

    // Target node omega
    const targetSI = shockIntensity.get(targetNodeId) || 0;
    const targetBase = baseProfiles.get(targetNodeId)!;
    const targetOmega = Math.min(10, targetBase.composite * (1 + targetSI * config.omegaShockScale));
    targetOmegaSeries.push(targetOmega);

    // Downstream nodes
    for (const id of trackedIds) {
      const si = shockIntensity.get(id) || 0;
      const base = baseProfiles.get(id)!;
      const omega = Math.min(10, base.composite * (1 + si * config.omegaShockScale));
      downstreamSeries.get(id)!.push(omega);
    }

    // Survival prior → P(event by t) × 100
    if (prior && survivalSeries) {
      // Attack intensity reaching the outcome node in [0, 1].
      const outcomeIntensity = shockIntensity.get(prior.outcomeNodeId) || 0;
      // Treatment effect survives only to the extent the outcome node
      // hasn't been captured by the cascade. When outcomeIntensity = 0
      // the full β* is applied; at 1 the treatment effect is gone.
      const effectiveBeta = betaStar * (1 - outcomeIntensity);
      const hazardThisEpoch = prior.baselineHazardPerEpoch * Math.exp(effectiveBeta);
      cumulativeHazard += hazardThisEpoch;
      const P = 1 - Math.exp(-cumulativeHazard);
      survivalSeries.push(Math.max(0, Math.min(100, P * 100)));
    }
  }

  return { omegaBufferSeries, targetOmegaSeries, downstreamSeries, survivalSeries };
}

// ─── Compute Percentile Statistics ─────────────────────────────
function computeStats(paths: MCPath[], accessor: (p: MCPath) => number[]): EpochStats[] {
  if (paths.length === 0) return [];
  const horizon = accessor(paths[0]).length;
  const stats: EpochStats[] = [];

  for (let e = 0; e < horizon; e++) {
    const values = paths.map((p) => accessor(p)[e]).sort((a, b) => a - b);
    const n = values.length;
    stats.push({
      epoch: e,
      mean: values.reduce((s, v) => s + v, 0) / n,
      p10: values[Math.floor(n * 0.1)],
      p25: values[Math.floor(n * 0.25)],
      p50: values[Math.floor(n * 0.5)],
      p75: values[Math.floor(n * 0.75)],
      p90: values[Math.floor(n * 0.9)],
    });
  }
  return stats;
}

// ─── Main Monte Carlo Forecast ─────────────────────────────────
export function runMonteCarloForecast(
  graph: CausalGraph,
  targetNodeId: string,
  severedEdgeIds: string[],
  config?: Partial<MCConfig>
): MCForecastResult {
  const cfg = { ...DEFAULT_MC_CONFIG, ...config };
  const severedSet = new Set(severedEdgeIds);

  // Build adjacency for baseline (no intervention severing)
  const adjBaseline = buildOutgoing(graph.edges, severedSet);
  // For intervention, same topology — but the path simulator handles do(X) logic
  const adjIntervention = adjBaseline;

  // Identify downstream nodes to track (top 5 by edge weight from target)
  const downstream = getDownstreamNodeIds(graph, targetNodeId, severedSet, 3);
  const trackedIds = downstream.slice(0, 5);

  const baselinePaths: MCPath[] = [];
  const interventionPaths: MCPath[] = [];

  for (let i = 0; i < cfg.numPaths; i++) {
    const baseRng = mulberry32(42 + i * 7);
    const intRng = mulberry32(42 + i * 7); // same seed for paired comparison

    baselinePaths.push(
      simulatePath(graph, adjBaseline, targetNodeId, trackedIds, cfg, baseRng, false)
    );
    interventionPaths.push(
      simulatePath(graph, adjIntervention, targetNodeId, trackedIds, cfg, intRng, true)
    );
  }

  // Compute summary stats on omega buffer series
  const baselineStats = computeStats(baselinePaths, (p) => p.omegaBufferSeries);
  const interventionStats = computeStats(interventionPaths, (p) => p.omegaBufferSeries);

  // Survival stats — only when the prior was set
  const baselineSurvivalStats = cfg.survivalPrior
    ? computeStats(baselinePaths, (p) => p.survivalSeries ?? [])
    : undefined;
  const interventionSurvivalStats = cfg.survivalPrior
    ? computeStats(interventionPaths, (p) => p.survivalSeries ?? [])
    : undefined;

  return {
    baselinePaths,
    interventionPaths,
    baselineStats,
    interventionStats,
    baselineSurvivalStats,
    interventionSurvivalStats,
    trackedNodeIds: trackedIds,
    horizonEpochs: cfg.horizonEpochs,
  };
}
