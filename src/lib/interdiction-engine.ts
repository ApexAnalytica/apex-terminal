import {
  CausalGraph,
  CausalShock,
  EpochSnapshot,
} from "./types";
import { simulateCascade, mapShocksToNodes } from "./cascade-simulator";

// ─── Types ──────────────────────────────────────────────────────

export type InterdictionTarget = {
  type: "node" | "edge";
  id: string;
  label: string;
};

export interface InterdictionResult {
  /** Ordered list of optimal interventions (best first) */
  interventions: InterdictionCandidate[];
  /** Baseline damage with no intervention */
  baselineDamage: number;
  /** Best achievable damage after optimal interventions */
  bestDamage: number;
  /** Damage reduction as percentage */
  reductionPct: number;
  /**
   * Set when `interventions` come from the structural-vulnerability fallback
   * (highest-weight edges / highest-Ω nodes) rather than the cascade solver.
   * Populated by copilot-actions.ts when the solver returns no cuts because
   * baseline cascade damage was too low to discriminate targets.
   */
  fallbackReason?: string;
}

export interface InterdictionCandidate {
  target: InterdictionTarget;
  /** Damage score if this intervention is applied (lower = better for defender) */
  damage: number;
  /** Marginal improvement over not applying this intervention */
  marginalReduction: number;
}

// ─── Damage Metric ──────────────────────────────────────────────

/**
 * Compute a scalar damage score from a cascade simulation.
 *
 * Three orthogonal components so cutting a single edge produces a visible
 * delta in sparse graphs (previous version summed two mean-intensity terms
 * that collapse to the same value in sparse cascades, making every cut
 * look identical and tripping the structural-vulnerability fallback):
 *   (1) spread   — peak mean intensity across all nodes (breadth)
 *   (2) hot-node — peak (intensity × ΩF/10) on any single node (depth on
 *                  high-fragility targets; cuts that protect one critical
 *                  chokepoint show up here even if the mean barely moves)
 *   (3) critical — bonus when the Ω-buffer breaches threshold.
 *
 * Shock-source nodes (the nodes that receive the initial injection) are
 * excluded from BOTH the spread and hot-node calculations. Their
 * intensity is an *input* to the cascade, not a downstream consequence —
 * no edge severance can change it. Including them dominates the hot-node
 * term (source intensity ~1.0 × high ΩF) and drowns out per-cut deltas in
 * the propagation, which is the actual signal the solver needs.
 */
function computeDamage(
  epochs: EpochSnapshot[],
  baseOmegaMap: Map<string, number>,
  shockSourceIds: Set<string>,
): number {
  if (epochs.length === 0) return 0;

  let peakMeanIntensity = 0;
  let peakHotNode = 0;

  for (const snap of epochs) {
    let total = 0;
    let count = 0;
    for (const [id, state] of Object.entries(snap.nodeStates)) {
      if (shockSourceIds.has(id)) continue;
      total += state.shockIntensity;
      count++;
      const baseOmega = baseOmegaMap.get(id) ?? 5;
      const hotness = state.shockIntensity * (baseOmega / 10);
      if (hotness > peakHotNode) peakHotNode = hotness;
    }
    if (count > 0) {
      const mean = total / count;
      if (mean > peakMeanIntensity) peakMeanIntensity = mean;
    }
  }

  const reachedCritical = epochs.some((e) => e.isCritical);

  const spreadScore = peakMeanIntensity * 40;  // 0-40
  const hotNodeScore = peakHotNode * 35;       // 0-35
  const criticalBonus = reachedCritical ? 25 : 0; // 0 or 25

  return Math.min(100, spreadScore + hotNodeScore + criticalBonus);
}

// ─── Greedy Minimax Solver ──────────────────────────────────────

/**
 * Greedy minimax interdiction: find the set of up to `budget` edge/node
 * removals that minimizes the worst-case cascade damage.
 *
 * Algorithm:
 * 1. Simulate baseline cascade (no interventions) → baseline damage
 * 2. For each candidate removal, simulate cascade with that removal
 * 3. Pick the candidate with lowest resulting damage (greedy step)
 * 4. Repeat up to `budget` times, accumulating removals
 *
 * This is an O(budget × candidates) greedy approximation to the
 * NP-hard network interdiction problem.
 */
export function solveInterdiction(
  graph: CausalGraph,
  shocks: CausalShock[],
  severedEdges: string[],
  budget: number = 3,
  mode: "edge" | "node" | "both" = "edge"
): InterdictionResult {
  // Pre-compute base ΩF per node once; computeDamage uses this to weight
  // hot-node damage so cuts protecting high-fragility targets score higher
  // than cuts on peripheral nodes.
  const baseOmegaMap = new Map<string, number>();
  for (const node of graph.nodes) {
    baseOmegaMap.set(node.id, node.omegaFragility.composite);
  }

  // Identify shock-source nodes (the ones that receive the initial
  // injection). computeDamage skips these so the per-cut signal is
  // dominated by downstream propagation rather than the invariant
  // source state. Mirrors the same shock→node mapping the simulator
  // uses, so no chance of drift.
  //
  // Edge case: if the shock saturates the entire graph (every node is
  // a source — happens on tightly-scoped subgraphs like VX-880 where
  // the whole graph is one category and the shock category broadcasts
  // to it), excluding everyone zeros the score. Fall back to scoring
  // all nodes in that case so baseline damage is still meaningful.
  const allSourceIds = new Set(mapShocksToNodes(graph, shocks).keys());
  const shockSourceIds = allSourceIds.size < graph.nodes.length
    ? allSourceIds
    : new Set<string>();

  // Baseline: no interventions
  const baselineEpochs = simulateCascade(graph, shocks, severedEdges);
  const baselineDamage = computeDamage(baselineEpochs, baseOmegaMap, shockSourceIds);

  const interventions: InterdictionCandidate[] = [];
  const removedEdgeIds = new Set(severedEdges);
  const removedNodeIds = new Set<string>();
  let currentDamage = baselineDamage;

  for (let step = 0; step < budget; step++) {
    let bestCandidate: InterdictionCandidate | null = null;
    let bestDamage = currentDamage;

    // Build candidate list
    const candidates: InterdictionTarget[] = [];

    if (mode === "edge" || mode === "both") {
      for (const edge of graph.edges) {
        if (removedEdgeIds.has(edge.id) || edge.isSevered) continue;
        // Skip edges connected to removed nodes
        if (removedNodeIds.has(edge.source) || removedNodeIds.has(edge.target)) continue;
        candidates.push({
          type: "edge",
          id: edge.id,
          label: `${graph.nodes.find((n) => n.id === edge.source)?.shortLabel ?? edge.source} → ${graph.nodes.find((n) => n.id === edge.target)?.shortLabel ?? edge.target}`,
        });
      }
    }

    if (mode === "node" || mode === "both") {
      for (const node of graph.nodes) {
        if (removedNodeIds.has(node.id)) continue;
        candidates.push({
          type: "node",
          id: node.id,
          label: node.shortLabel || node.label,
        });
      }
    }

    // Evaluate each candidate
    for (const candidate of candidates) {
      let testGraph = graph;
      const testSevered = [...removedEdgeIds];

      if (candidate.type === "edge") {
        testSevered.push(candidate.id);
      } else {
        // Node removal: filter out node and its edges
        const nodeId = candidate.id;
        testGraph = {
          ...graph,
          nodes: graph.nodes.filter(
            (n) => n.id !== nodeId && !removedNodeIds.has(n.id)
          ),
          edges: graph.edges.filter(
            (e) =>
              e.source !== nodeId &&
              e.target !== nodeId &&
              !removedNodeIds.has(e.source) &&
              !removedNodeIds.has(e.target)
          ),
          metadata: graph.metadata,
        };
      }

      const epochs = simulateCascade(testGraph, shocks, testSevered);
      const damage = computeDamage(epochs, baseOmegaMap, shockSourceIds);

      if (damage < bestDamage) {
        bestDamage = damage;
        bestCandidate = {
          target: candidate,
          damage,
          marginalReduction: currentDamage - damage,
        };
      }
    }

    if (!bestCandidate || bestCandidate.marginalReduction < 0.01) break;

    interventions.push(bestCandidate);
    if (bestCandidate.target.type === "edge") {
      removedEdgeIds.add(bestCandidate.target.id);
    } else {
      removedNodeIds.add(bestCandidate.target.id);
    }
    currentDamage = bestDamage;
  }

  const bestDamage = interventions.length > 0
    ? interventions[interventions.length - 1].damage
    : baselineDamage;

  const reductionPct = baselineDamage > 0
    ? Math.round(((baselineDamage - bestDamage) / baselineDamage) * 100)
    : 0;

  return {
    interventions,
    baselineDamage: Math.round(baselineDamage * 10) / 10,
    bestDamage: Math.round(bestDamage * 10) / 10,
    reductionPct,
  };
}
