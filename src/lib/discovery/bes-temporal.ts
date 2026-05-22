// ─── Discovery — BES Temporal Monitoring ─────────────────────────────
//
// Phase 3 PR 2 of the Ghauri 2025 dissertation integration. Takes a
// TrainingTrace (the per-epoch curriculum snapshot from PR #380) and a
// CausalGraph (the IDS substrate from PR #275), then computes χ★ and
// per-edge BES at each epoch of the trace.
//
// Why this is useful: in a continual-learning IDS, the GAT's
// load-bearing skeleton SHIFTS as the model's attention shifts across
// the curriculum. Edges that were critical at epoch 5 (when training
// was on DDoS) may have collapsed in importance by epoch 20 (after
// training moved to Heartbleed). Tracking χ★ membership and BES
// values over epochs surfaces those shifts directly — the substrate
// the FR estimator (PR 3) and Ω-Forgetting Pressure metric (PR 4)
// read from.
//
// DOMAIN GATING
// -------------
// This module is AI-domain-only in SEMANTICS (FR / forgetting concepts
// only apply when there's a model being trained over time). The
// function signature is profile-agnostic — same pattern as `chiStar`
// itself — and the AI-domain gating happens at the UI / registry
// layer above (PR 4 will only surface this on AI_SAFETY_PROFILE).
// Geopolitical / T1D / other domains will never call this.
//
// PROVENANCE
// ----------
// The result type forwards `source.kind` from the input TrainingTrace
// verbatim. UI surfaces consuming a BESTemporalResult with
// source.kind === "synthetic" MUST render a SYNTHETIC badge. This
// preserves the badge contract from PR #380 — no customer business
// decision runs off synthetic data.
//
// ALGORITHM
// ---------
// At each epoch e:
//   1. Determine the set of "active" task nodes — those whose ids
//      appear in epoch.activeTaskIds. Non-task nodes (substrate:
//      datasets, GAT, replay buffer, eval harness) are always active.
//   2. Mask out edges whose endpoints aren't both currently active
//      AND aren't severed. This represents the GAT's attention
//      having shifted away from inactive attack classes.
//   3. Run chiStar() on the resulting subgraph. Capture per-edge BES
//      and tier (bridge / top-BES / not in χ★).
//   4. Aggregate into per-edge time series indexed by epoch.
//
// Cost: chiStar is O(V · E) per epoch. For a typical AI Safety
// substrate (17 nodes, 18 edges, ~20 epochs) this is a small
// computation; cached at the UI layer when the trace + graph are
// stable.

import type { CausalEdge, CausalGraph } from "@/lib/types";
import type { TrainingTrace } from "./training-trace-types";
import { chiStar } from "@/lib/estimators/chi-star";

export type ChiStarTier = "bridge" | "top-bes" | null;

export interface BESTemporalEdgeSeries {
  /** Edge id. Matches the id field on the source CausalEdge. */
  edgeId: string;
  /**
   * BES value at each epoch, in the same order as
   * `BESTemporalResult.epochIndices`. NaN where the edge wasn't
   * present in the χ★ computation that epoch (one or both
   * endpoints inactive, or edge severed).
   */
  bes: number[];
  /**
   * χ★ tier at each epoch. `null` means the edge wasn't in the χ★
   * set that epoch (either masked out, or in the live subgraph but
   * not load-bearing enough to qualify).
   */
  tier: ChiStarTier[];
}

export interface BESTemporalResult {
  /** Epoch indices in increasing order; identity-of-the-x-axis. */
  epochIndices: number[];
  /** Per-edge time series, one entry per edge in the source graph. */
  edges: BESTemporalEdgeSeries[];
  /**
   * Inherited from the input trace's `source.kind`. UI surfaces
   * displaying values derived from a synthetic result MUST render
   * a SYNTHETIC badge.
   */
  sourceKind: "synthetic" | "live";
  /** Echo of the input trace id for downstream cross-reference. */
  traceId: string;
  /**
   * Per-epoch summary stats — useful for sparkline / aggregate UI.
   * Same length / order as `epochIndices`.
   */
  perEpoch: {
    chiStarSize: number[];
    bridgeCount: number[];
    activeNodeCount: number[];
    activeEdgeCount: number[];
  };
}

export interface ComputeBESTemporalOptions {
  /**
   * Override the set of node ids treated as "tasks" (i.e., subject
   * to active/inactive masking). By default, derived from the
   * trace's `tasks[].id`. Use this if your trace's task ids don't
   * map 1:1 to graph node ids (e.g., dataset-scope curricula where
   * one task spans multiple nodes).
   */
  taskNodeIds?: ReadonlySet<string>;
  /**
   * Optional χ★ top-k parameter forwarded into each per-epoch
   * chiStar() call. Defaults to chiStar's own default
   * (max(1, floor(0.1 * |E|))).
   */
  topK?: number;
}

/**
 * Compute BES temporal monitoring over a TrainingTrace + CausalGraph.
 *
 * Throws if the trace and graph are obviously incompatible:
 *   - empty trace
 *   - empty graph
 *   - task ids that don't appear as node ids in the graph (warning
 *     case — surfaces via a thrown error so the caller knows the
 *     intersection is empty rather than silently producing
 *     all-empty epochs)
 */
export function computeBESTemporal(
  trace: TrainingTrace,
  graph: CausalGraph,
  options: ComputeBESTemporalOptions = {},
): BESTemporalResult {
  if (trace.epochs.length === 0) {
    throw new Error("computeBESTemporal: trace has zero epochs");
  }
  if (graph.nodes.length === 0) {
    throw new Error("computeBESTemporal: graph has zero nodes");
  }

  // Resolve the task-node set. Default: every task id from the trace
  // that also appears as a node in the graph. Caller override wins.
  const graphNodeIds = new Set(graph.nodes.map((n) => n.id));
  const taskNodeIds =
    options.taskNodeIds ??
    new Set(trace.tasks.map((t) => t.id).filter((id) => graphNodeIds.has(id)));

  if (taskNodeIds.size === 0) {
    throw new Error(
      "computeBESTemporal: no task ids from the trace appear as nodes in the graph " +
        "(traces task ids: " +
        trace.tasks.map((t) => t.id).slice(0, 5).join(", ") +
        (trace.tasks.length > 5 ? ", ..." : "") +
        "). Pass options.taskNodeIds if your trace uses non-node ids.",
    );
  }

  // Pre-build the node-id → graph node map for fast lookups inside
  // the per-epoch loop.
  const edges = graph.edges.filter((e) => !e.isSevered);
  const allEdgeIds = graph.edges.map((e) => e.id);

  const epochIndices: number[] = [];
  const perEdgeBES: Map<string, number[]> = new Map();
  const perEdgeTier: Map<string, ChiStarTier[]> = new Map();
  for (const id of allEdgeIds) {
    perEdgeBES.set(id, []);
    perEdgeTier.set(id, []);
  }
  const chiStarSize: number[] = [];
  const bridgeCount: number[] = [];
  const activeNodeCount: number[] = [];
  const activeEdgeCount: number[] = [];

  for (const epoch of trace.epochs) {
    epochIndices.push(epoch.index);

    // Active node set: substrate (non-task) nodes are always active;
    // task nodes are active only when in epoch.activeTaskIds.
    const epochActiveTasks = new Set(epoch.activeTaskIds);
    const activeNodes = new Set<string>();
    for (const n of graph.nodes) {
      if (taskNodeIds.has(n.id)) {
        if (epochActiveTasks.has(n.id)) activeNodes.add(n.id);
      } else {
        activeNodes.add(n.id);
      }
    }

    // Edges where both endpoints are in the active set.
    const activeEdges = edges.filter(
      (e) => activeNodes.has(e.source) && activeNodes.has(e.target),
    );

    activeNodeCount.push(activeNodes.size);
    activeEdgeCount.push(activeEdges.length);

    // Defensive: empty edge set means chi-star can't compute. Push
    // NaN / null for every edge and zeros for the per-epoch stats.
    if (activeEdges.length === 0) {
      for (const id of allEdgeIds) {
        perEdgeBES.get(id)!.push(NaN);
        perEdgeTier.get(id)!.push(null);
      }
      chiStarSize.push(0);
      bridgeCount.push(0);
      continue;
    }

    // Build the per-epoch subgraph and run chi-star on it.
    const subNodes = graph.nodes.filter((n) => activeNodes.has(n.id));
    const subGraph: CausalGraph = {
      nodes: subNodes,
      edges: activeEdges,
      metadata: graph.metadata,
    };
    const chi = chiStar(subGraph, {
      topK: options.topK ?? null,
    });
    const chiSet = new Set(chi.chiStar);
    const bridgeSet = new Set(chi.bridges);
    chiStarSize.push(chiSet.size);
    bridgeCount.push(bridgeSet.size);

    // Record per-edge values. For edges not in the active subgraph
    // this epoch, push NaN / null so the time series has consistent
    // length.
    const activeEdgeIdSet = new Set(activeEdges.map((e) => e.id));
    for (const id of allEdgeIds) {
      if (!activeEdgeIdSet.has(id)) {
        perEdgeBES.get(id)!.push(NaN);
        perEdgeTier.get(id)!.push(null);
        continue;
      }
      perEdgeBES.get(id)!.push(chi.bes.get(id) ?? 0);
      const tier: ChiStarTier = bridgeSet.has(id)
        ? "bridge"
        : chiSet.has(id)
          ? "top-bes"
          : null;
      perEdgeTier.get(id)!.push(tier);
    }
  }

  const edgesResult: BESTemporalEdgeSeries[] = allEdgeIds.map((id) => ({
    edgeId: id,
    bes: perEdgeBES.get(id)!,
    tier: perEdgeTier.get(id)!,
  }));

  return {
    epochIndices,
    edges: edgesResult,
    sourceKind: trace.source.kind,
    traceId: trace.id,
    perEpoch: {
      chiStarSize,
      bridgeCount,
      activeNodeCount,
      activeEdgeCount,
    },
  };
}

/**
 * Compact summary statistics for one edge's BES time series. Useful
 * for sorting / displaying edges by their forgetting-relevant signal
 * (max BES seen, range, last value, fraction of epochs in χ★, etc.).
 */
export interface EdgeBESStatistics {
  edgeId: string;
  /** Max BES across the full trace (ignoring NaN epochs). */
  maxBes: number;
  /** Mean BES across epochs where the edge was active. NaN if never active. */
  meanBes: number;
  /** Number of epochs the edge appeared in χ★ (either tier). */
  chiStarEpochs: number;
  /** Number of epochs the edge appeared as a strict bridge. */
  bridgeEpochs: number;
  /** Total epochs in the trace (for normalisation). */
  totalEpochs: number;
}

export function summariseEdge(series: BESTemporalEdgeSeries): EdgeBESStatistics {
  let maxBes = 0;
  let sum = 0;
  let active = 0;
  let chiStarEpochs = 0;
  let bridgeEpochs = 0;
  for (let i = 0; i < series.bes.length; i++) {
    const v = series.bes[i];
    if (!Number.isNaN(v)) {
      if (v > maxBes) maxBes = v;
      sum += v;
      active++;
    }
    const t = series.tier[i];
    if (t === "bridge") {
      chiStarEpochs++;
      bridgeEpochs++;
    } else if (t === "top-bes") {
      chiStarEpochs++;
    }
  }
  return {
    edgeId: series.edgeId,
    maxBes,
    meanBes: active === 0 ? NaN : sum / active,
    chiStarEpochs,
    bridgeEpochs,
    totalEpochs: series.bes.length,
  };
}

/**
 * Convenience: rank edges by max BES, descending. Useful for the
 * forgetting-pressure ranking surface (PR 4).
 */
export function rankEdgesByMaxBES(
  result: BESTemporalResult,
): EdgeBESStatistics[] {
  return result.edges
    .map(summariseEdge)
    .sort((a, b) => b.maxBes - a.maxBes);
}

// Re-export for callers convenience.
export type { CausalEdge };
