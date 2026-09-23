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
 */
function computeDamage(
  epochs: EpochSnapshot[],
  baseOmegaMap: Map<string, number>,
): number {
  if (epochs.length === 0) return 0;

  let peakMeanIntensity = 0;
  let peakHotNode = 0;

  for (const snap of epochs) {
    let total = 0;
    let count = 0;
    for (const [id, state] of Object.entries(snap.nodeStates)) {
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

  // Baseline: no interventions
  const baselineEpochs = simulateCascade(graph, shocks, severedEdges);
  const baselineDamage = computeDamage(baselineEpochs, baseOmegaMap);

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
      const damage = computeDamage(epochs, baseOmegaMap);

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

// ─── Async Variant ──────────────────────────────────────────────

/**
 * Options for `solveInterdictionAsync`.
 */
export interface SolveInterdictionAsyncOptions {
  /** AbortSignal — when triggered, rejects with an AbortError. */
  signal?: AbortSignal;
  /**
   * Progress callback fired periodically as candidate evaluations
   * complete. `done` is candidates evaluated so far across all budget
   * steps; `total` is the approximate maximum (budget × initial
   * candidate count). The actual total can be lower if the budget loop
   * exits early on a non-improving step.
   */
  onProgress?: (done: number, total: number) => void;
  /**
   * Time budget per uninterrupted sync slice, in ms. Once this elapses
   * the solver yields to the event loop (so paint + input handlers can
   * run) before resuming. Lower = smoother UI, slightly more overhead.
   * Default 50ms — matches `requestIdleCallback`'s default deadline.
   */
  yieldEveryMs?: number;
}

/**
 * Async variant of `solveInterdiction` — same greedy minimax algorithm
 * and identical output, but yields to the event loop periodically so a
 * Hormuz-sized graph (~350 edges × budget=3 ≈ 1,000+ cascade
 * simulations) doesn't freeze the UI for the full ~5–15s solve. The
 * cascade simulator itself is still called synchronously per candidate
 * — each inner `simulateCascade` is fast enough (~10–50ms) that
 * splitting it would add more yield-overhead than win-back. The yield
 * happens between candidates.
 *
 * Tests and non-UI callers (copilot tool, local-provider) should keep
 * using the sync `solveInterdiction` — deterministic single-tick
 * execution and no Promise plumbing.
 */
export async function solveInterdictionAsync(
  graph: CausalGraph,
  shocks: CausalShock[],
  severedEdges: string[],
  budget: number = 3,
  mode: "edge" | "node" | "both" = "edge",
  options: SolveInterdictionAsyncOptions = {},
): Promise<InterdictionResult> {
  const { signal, onProgress, yieldEveryMs = 50 } = options;

  const baseOmegaMap = new Map<string, number>();
  for (const node of graph.nodes) {
    baseOmegaMap.set(node.id, node.omegaFragility.composite);
  }

  // Baseline: no interventions. One cascade — fast enough to keep sync.
  const baselineEpochs = simulateCascade(graph, shocks, severedEdges);
  const baselineDamage = computeDamage(baselineEpochs, baseOmegaMap);

  const interventions: InterdictionCandidate[] = [];
  const removedEdgeIds = new Set(severedEdges);
  const removedNodeIds = new Set<string>();
  let currentDamage = baselineDamage;

  // Estimate total candidate evaluations so `onProgress` can render a
  // sensible bar. Uses the *initial* candidate count; the real total is
  // a bit lower because each accepted intervention prunes the candidate
  // set for the next round. Close enough for UI feedback.
  const initialCandidateCount =
    (mode === "edge" || mode === "both" ? graph.edges.length : 0) +
    (mode === "node" || mode === "both" ? graph.nodes.length : 0);
  const totalCandidatesEstimate = Math.max(1, budget * initialCandidateCount);
  let evaluatedCount = 0;
  let lastYieldAt = performance.now();

  for (let step = 0; step < budget; step++) {
    if (signal?.aborted) {
      throw new DOMException("solveInterdictionAsync aborted", "AbortError");
    }

    let bestCandidate: InterdictionCandidate | null = null;
    let bestDamage = currentDamage;

    const candidates: InterdictionTarget[] = [];

    if (mode === "edge" || mode === "both") {
      for (const edge of graph.edges) {
        if (removedEdgeIds.has(edge.id) || edge.isSevered) continue;
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

    for (const candidate of candidates) {
      let testGraph = graph;
      const testSevered = [...removedEdgeIds];

      if (candidate.type === "edge") {
        testSevered.push(candidate.id);
      } else {
        const nodeId = candidate.id;
        testGraph = {
          ...graph,
          nodes: graph.nodes.filter(
            (n) => n.id !== nodeId && !removedNodeIds.has(n.id),
          ),
          edges: graph.edges.filter(
            (e) =>
              e.source !== nodeId &&
              e.target !== nodeId &&
              !removedNodeIds.has(e.source) &&
              !removedNodeIds.has(e.target),
          ),
          metadata: graph.metadata,
        };
      }

      const epochs = simulateCascade(testGraph, shocks, testSevered);
      const damage = computeDamage(epochs, baseOmegaMap);

      if (damage < bestDamage) {
        bestDamage = damage;
        bestCandidate = {
          target: candidate,
          damage,
          marginalReduction: currentDamage - damage,
        };
      }

      evaluatedCount++;

      // Time-sliced yield: check the wall clock, not a fixed candidate
      // count. Tiny graphs (T1D ~20 nodes) finish without yielding;
      // big graphs (Hormuz ~350 edges) yield ~every 50ms. Adapts to
      // simulator cost per candidate (which varies with topology) so
      // the UI stays smooth across very different graph scales without
      // any per-call tuning.
      if (performance.now() - lastYieldAt > yieldEveryMs) {
        if (signal?.aborted) {
          throw new DOMException(
            "solveInterdictionAsync aborted",
            "AbortError",
          );
        }
        if (onProgress) onProgress(evaluatedCount, totalCandidatesEstimate);
        await yieldToEventLoop();
        lastYieldAt = performance.now();
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

  // Final progress flush so consumers see "done" even if the last batch
  // didn't cross the yield threshold.
  if (onProgress) onProgress(evaluatedCount, evaluatedCount);

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

/**
 * Yield to the event loop so paint + input handlers can run before the
 * next chunk of solver work. Prefers `requestIdleCallback` (browsers,
 * gives the runtime control over scheduling) and falls back to
 * `setTimeout(_, 0)` for node test runs. Duplicated from the same util
 * in cascade-simulator.ts — kept inline here to avoid cross-module
 * coupling for a 15-line helper.
 */
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
