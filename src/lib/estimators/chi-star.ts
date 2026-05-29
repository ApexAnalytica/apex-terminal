// χ★ (chi-star) bridge sets — topology-aware criticality on the causal
// graph. Canonical artefact from Ghauri 2025 (D.Eng., Ch. 5–8 — IDS
// substrate + topology-aware replay).
//
// The χ★ set is the union of:
//
//   1. Strict bridges. Edges whose removal disconnects the underlying
//      graph (treating directed edges as undirected for connectivity).
//      Computed via Tarjan's DFS-based algorithm in O(V + E). These are
//      the topological single-points-of-failure — every cascade path
//      between the two components must traverse them.
//
//   2. Top-k edges by Bridge-Edge Strength (BES). BES is a continuous
//      measure of how much each edge participates in shortest paths
//      across the graph: high BES = high information-flow funnel.
//      Implemented as edge betweenness centrality (Brandes 2008,
//      unweighted O(V·E)) normalised to [0, 1]. The dissertation's
//      attention-head layer reads BES to bias the replay buffer
//      toward high-bridge edges (Ch. 8 §6, "topology-aware rehearsal").
//
// Strict bridges and high-BES edges together give a structural picture
// of the graph's load-bearing skeleton — the edges most worth hardening,
// monitoring, or preserving in replay against catastrophic forgetting.
//
// All algorithms operate on the undirected version of the graph for
// connectivity / shortest-path purposes. Edge IDs are preserved
// throughout so callers can map BES scores and bridge membership back
// to the original directed edges.
//
// No external deps. Tarjan: O(V + E). Brandes: O(V · E) (unweighted
// shortest paths via BFS, accumulating dependency over edges).

import type { CausalGraph, CausalEdge } from "@/lib/types";

export interface ChiStarOptions {
  /**
   * Number of top-BES edges to include in the χ★ set on top of the
   * strict bridges. If null, an automatic threshold is used:
   * floor(max(1, 0.1 · |E|)) — ten percent of edges, minimum one.
   */
  topK?: number | null;
}

export interface ChiStarResult {
  /** Edge IDs whose removal disconnects the (undirected) graph. */
  bridges: string[];
  /** Per-edge BES ∈ [0, 1] (normalised edge betweenness). */
  bes: Map<string, number>;
  /** Edge IDs in the χ★ set: bridges ∪ top-k BES. */
  chiStar: string[];
  /** Edge IDs ranked descending by BES (full ranking, not just top-k). */
  besRanking: { edgeId: string; bes: number }[];
  /** Echo of resolved options after defaulting. */
  topK: number;
}

/**
 * Build adjacency list (undirected) keyed by node id. Each adjacency
 * entry carries the original edge id and the neighbour. Multi-edges
 * are preserved — Tarjan and Brandes both need to see them.
 */
function buildUndirectedAdjacency(
  graph: CausalGraph,
): Map<string, { neighbour: string; edgeId: string }[]> {
  const adj = new Map<string, { neighbour: string; edgeId: string }[]>();
  for (const node of graph.nodes) adj.set(node.id, []);
  for (const edge of graph.edges) {
    if (!adj.has(edge.source) || !adj.has(edge.target)) continue;
    adj.get(edge.source)!.push({ neighbour: edge.target, edgeId: edge.id });
    adj.get(edge.target)!.push({ neighbour: edge.source, edgeId: edge.id });
  }
  return adj;
}

/**
 * Tarjan's DFS-based bridge-finding. An edge (u, v) is a bridge iff
 * low[v] > disc[u] for the tree edge (u, v) — i.e. v's subtree has no
 * back-edge climbing above u. Multi-edges between the same pair are
 * never bridges (one of them provides an alternate path), so we
 * track parent edge id rather than parent node id to handle this
 * correctly.
 */
export function findBridges(graph: CausalGraph): string[] {
  const adj = buildUndirectedAdjacency(graph);
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const bridgeIds: string[] = [];
  let timer = 0;

  // Iterative DFS to avoid stack overflow on large graphs.
  for (const start of adj.keys()) {
    if (disc.has(start)) continue;
    type Frame = { node: string; parentEdge: string | null; iterIdx: number };
    const stack: Frame[] = [{ node: start, parentEdge: null, iterIdx: 0 }];
    disc.set(start, timer);
    low.set(start, timer);
    timer++;

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const neighbours = adj.get(frame.node)!;

      if (frame.iterIdx < neighbours.length) {
        const { neighbour, edgeId } = neighbours[frame.iterIdx];
        frame.iterIdx++;
        if (edgeId === frame.parentEdge) continue;

        if (!disc.has(neighbour)) {
          disc.set(neighbour, timer);
          low.set(neighbour, timer);
          timer++;
          stack.push({ node: neighbour, parentEdge: edgeId, iterIdx: 0 });
        } else {
          // Back edge: update low[frame.node].
          const lo = low.get(frame.node)!;
          const d = disc.get(neighbour)!;
          if (d < lo) low.set(frame.node, d);
        }
      } else {
        // Done with this node — propagate low up to parent.
        stack.pop();
        if (stack.length > 0) {
          const parent = stack[stack.length - 1];
          const childLow = low.get(frame.node)!;
          const parentLow = low.get(parent.node)!;
          if (childLow < parentLow) low.set(parent.node, childLow);
          // Bridge test: child subtree's low > parent's discovery time.
          if (childLow > disc.get(parent.node)!) {
            bridgeIds.push(frame.parentEdge!);
          }
        }
      }
    }
  }

  return bridgeIds;
}

/**
 * Edge betweenness via Brandes (2008), unweighted variant.
 *
 *   For every source s ∈ V:
 *     1. BFS from s — compute σ(s, v) = #shortest paths and the BFS
 *        predecessor multiset Pred[v].
 *     2. Accumulate δ(v) = Σ_{w in succ(v)} (σ(s,v)/σ(s,w)) · (1 + δ(w))
 *        in reverse BFS order. Each tree edge (v, w) contributes
 *        (σ(s,v)/σ(s,w)) · (1 + δ(w)) to its betweenness.
 *
 * The result is summed across all sources. For an undirected graph the
 * standard Brandes formulation double-counts (s→t and t→s share a
 * shortest path), so we divide the final sum by 2.
 *
 * Returns RAW betweenness counts. Use {@link bridgeEdgeStrength} to
 * normalise to [0, 1].
 */
export function edgeBetweenness(graph: CausalGraph): Map<string, number> {
  const adj = buildUndirectedAdjacency(graph);
  const nodes = [...adj.keys()];
  const betweenness = new Map<string, number>();
  for (const e of graph.edges) betweenness.set(e.id, 0);

  for (const s of nodes) {
    // BFS from s.
    const sigma = new Map<string, number>(); // # shortest paths
    const dist = new Map<string, number>();
    const pred = new Map<string, { node: string; edgeId: string }[]>();
    for (const n of nodes) {
      sigma.set(n, 0);
      dist.set(n, -1);
      pred.set(n, []);
    }
    sigma.set(s, 1);
    dist.set(s, 0);

    const queue: string[] = [s];
    const order: string[] = []; // BFS visit order (for reverse accumulation)
    let head = 0;
    while (head < queue.length) {
      const v = queue[head++];
      order.push(v);
      const dv = dist.get(v)!;
      for (const { neighbour: w, edgeId } of adj.get(v)!) {
        if (dist.get(w) === -1) {
          dist.set(w, dv + 1);
          queue.push(w);
        }
        if (dist.get(w) === dv + 1) {
          sigma.set(w, sigma.get(w)! + sigma.get(v)!);
          pred.get(w)!.push({ node: v, edgeId });
        }
      }
    }

    // Accumulation in reverse BFS order.
    const delta = new Map<string, number>();
    for (const n of nodes) delta.set(n, 0);
    for (let i = order.length - 1; i >= 0; i--) {
      const w = order[i];
      const dw = delta.get(w)!;
      const sw = sigma.get(w)!;
      for (const { node: v, edgeId } of pred.get(w)!) {
        const sv = sigma.get(v)!;
        const contribution = (sv / sw) * (1 + dw);
        delta.set(v, delta.get(v)! + contribution);
        betweenness.set(edgeId, betweenness.get(edgeId)! + contribution);
      }
    }
  }

  // Undirected double-count correction.
  for (const [eid, b] of betweenness) betweenness.set(eid, b / 2);
  return betweenness;
}

/**
 * Bridge-Edge Strength: edge betweenness normalised to [0, 1] by the
 * maximum across the graph. If max is zero (graph has no shortest
 * paths through any edge — degenerate, e.g. single isolated node),
 * returns all zeros.
 */
export function bridgeEdgeStrength(graph: CausalGraph): Map<string, number> {
  const raw = edgeBetweenness(graph);
  let max = 0;
  for (const v of raw.values()) if (v > max) max = v;
  const bes = new Map<string, number>();
  if (max === 0) {
    for (const k of raw.keys()) bes.set(k, 0);
    return bes;
  }
  for (const [k, v] of raw) bes.set(k, v / max);
  return bes;
}

// Module-level fingerprint cache. chiStar is O(V·E) (Brandes' edge
// betweenness inside `bridgeEdgeStrength`) — ~120K ops on the default
// ~350-node graph. The result is a pure function of the input graph
// (plus topK), so we can intern it across callers.
//
// Why a content-fingerprint cache instead of a WeakMap on `graph.edges`:
// every canvas-class caller passes `graphData.edges.filter((e) => !e.isSevered)`,
// which is a fresh array reference per render. A WeakMap on that array
// would miss on every call. A fingerprint built from (length, first id,
// last id) of each input array hits across:
//   - Per-component re-renders where the same canvas's useMemo keying
//     would have already short-circuited anyway.
//   - View-mode switches (3D → 2D → 3D) — round 16's per-canvas
//     useMemo dies with the unmount; this cache survives, so the
//     remount returns the cached result without re-running Brandes.
//   - Live-feed ticks — graphData.nodes is rebuilt via `.map` (new ref,
//     same id set and same first/last ids), so a feed tick that
//     doesn't touch topology produces an identical fingerprint.
//
// Severing edges is correctly invalidated: a sever monotonically
// shortens the filtered edges array, so `edges.length` (part of the
// fingerprint) shifts and we miss → recompute → cache.
//
// Cache is bounded to MAX_ENTRIES with FIFO eviction (cheap and
// adequate for the 5 chiStar consumers we have). Set order in JS is
// insertion order, so deleting the first key on overflow gives an
// LRU-ish policy without extra bookkeeping.
const MAX_ENTRIES = 16;
const cache = new Map<string, ChiStarResult>();

function chiStarFingerprint(
  graph: CausalGraph,
  topK: number | null | undefined,
): string {
  const { nodes, edges } = graph;
  const nN = nodes.length;
  const nE = edges.length;
  const nFirst = nN > 0 ? nodes[0].id : "";
  const nLast = nN > 0 ? nodes[nN - 1].id : "";
  const eFirst = nE > 0 ? edges[0].id : "";
  const eLast = nE > 0 ? edges[nE - 1].id : "";
  const k = topK === undefined || topK === null ? "d" : String(topK);
  return `${nN}:${nFirst}:${nLast}|${nE}:${eFirst}:${eLast}|${k}`;
}

/**
 * Compute the χ★ bridge set: strict bridges ∪ top-k BES edges.
 *
 * Returns the edge ids in both groups along with the full BES ranking,
 * so downstream callers can render the score distribution rather than
 * just the binary membership.
 */
export function chiStar(
  graph: CausalGraph,
  options: ChiStarOptions = {},
): ChiStarResult {
  const fp = chiStarFingerprint(graph, options.topK);
  const cached = cache.get(fp);
  if (cached) {
    // Refresh insertion order so this entry survives the next eviction.
    cache.delete(fp);
    cache.set(fp, cached);
    return cached;
  }

  const bridges = findBridges(graph);
  const bes = bridgeEdgeStrength(graph);

  const besRanking = [...bes.entries()]
    .map(([edgeId, b]) => ({ edgeId, bes: b }))
    .sort((a, b) => b.bes - a.bes);

  const nE = graph.edges.length;
  const requestedK = options.topK;
  let topK: number;
  if (requestedK === undefined || requestedK === null) {
    topK = Math.max(1, Math.floor(0.1 * nE));
    if (nE === 0) topK = 0;
  } else {
    if (!Number.isFinite(requestedK) || requestedK < 0) {
      throw new Error(
        `chiStar: topK must be a non-negative integer, got ${requestedK}`,
      );
    }
    topK = Math.min(Math.floor(requestedK), nE);
  }

  const topByBes = new Set<string>();
  for (let i = 0; i < topK; i++) {
    if (i >= besRanking.length) break;
    topByBes.add(besRanking[i].edgeId);
  }

  // χ★ = bridges ∪ top-k BES. Preserve order: bridges first (in
  // discovery order), then any additional top-k entries not already
  // included.
  const chiStarSet = new Set<string>(bridges);
  for (const eid of topByBes) chiStarSet.add(eid);

  const result: ChiStarResult = {
    bridges,
    bes,
    chiStar: [...chiStarSet],
    besRanking,
    topK,
  };

  if (cache.size >= MAX_ENTRIES) {
    // FIFO eviction — drop the oldest entry.
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(fp, result);
  return result;
}

/**
 * Convenience: extract the original `CausalEdge` objects matching a
 * χ★ result's edge ids. Returns them in the order they appear in
 * `chiStar.chiStar` (bridges first, then top-k BES additions).
 */
export function resolveChiStarEdges(
  graph: CausalGraph,
  result: ChiStarResult,
): CausalEdge[] {
  const byId = new Map<string, CausalEdge>();
  for (const e of graph.edges) byId.set(e.id, e);
  const out: CausalEdge[] = [];
  for (const eid of result.chiStar) {
    const e = byId.get(eid);
    if (e) out.push(e);
  }
  return out;
}
