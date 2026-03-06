import {
  CausalGraph,
  CausalShock,
  EpochSnapshot,
} from "./types";
import { simulateCascade } from "./cascade-simulator";

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
 * Combines peak mean shock intensity, critical epoch proximity, and
 * the final omega buffer deficit. Range: 0 (no damage) to 100 (total collapse).
 */
function computeDamage(epochs: EpochSnapshot[]): number {
  if (epochs.length === 0) return 0;

  // Peak mean shock intensity across all epochs
  let peakMeanIntensity = 0;
  for (const snap of epochs) {
    let total = 0;
    let count = 0;
    for (const state of Object.values(snap.nodeStates)) {
      total += state.shockIntensity;
      count++;
    }
    if (count > 0) peakMeanIntensity = Math.max(peakMeanIntensity, total / count);
  }

  // Lowest omega buffer reached
  const minBuffer = Math.min(...epochs.map((e) => e.omegaBuffer));

  // Did it reach criticality?
  const reachedCritical = epochs.some((e) => e.isCritical);

  // Composite damage: weighted combination
  const intensityScore = peakMeanIntensity * 40; // 0-40
  const bufferScore = (100 - minBuffer) * 0.4; // 0-40
  const criticalBonus = reachedCritical ? 20 : 0; // 0 or 20

  return Math.min(100, intensityScore + bufferScore + criticalBonus);
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
  // Baseline: no interventions
  const baselineEpochs = simulateCascade(graph, shocks, severedEdges);
  const baselineDamage = computeDamage(baselineEpochs);

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
      const damage = computeDamage(epochs);

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
