import { CausalNode, CausalEdge } from "./types";

export interface NodePosition {
  id: string;
  x: number;
  y: number;
  z: number;
}

/** Per-node network metrics computed during layout */
export interface NodeMetrics {
  degree: number;              // number of connections
  eigenvectorCentrality: number; // 0-1 normalized influence score
  betweennessCentrality: number; // 0-1 normalized bridge score
  clusteringCoeff: number;     // 0-1 local clustering coefficient
  avgEdgeWeight: number;       // average weight of connected edges
}

// Domain z-layer targets. Used by both the rank layout below and the
// fallback force layout to keep each domain on its own depth band so the
// 3D camera reads the graph as stratified.
const DOMAIN_Z_OFFSETS: Record<string, number> = {
  "Saudi Aramco Energy": -3,
  "QatarEnergy LNG": -1.5,
  "QAFCO Fertilizer": 0,
  "Ma'aden Phosphate": 1,
  "Financial Contagion": 2.5,
  "Sovereign Risk": 3.5,
  "Supply Chain Food Security": -0.5,
  "Undersea Cable Infrastructure": -4,
  // Athena ISR domains
  "Drone Swarms": 4,
  "SATCOM": 3,
  "ISR Fusion": 2,
  "Chip Embargo": 1,
  "Secure Compute": 0,
  "Kill Chain": -1,
};

/**
 * Compute per-node network metrics from the graph topology.
 * These drive node sizing (eigenvector centrality) and are shown in hover tooltips.
 */
export function computeNetworkMetrics(
  nodes: CausalNode[],
  edges: CausalEdge[]
): Record<string, NodeMetrics> {
  const metrics: Record<string, NodeMetrics> = {};
  const nodeIds = new Set(nodes.map(n => n.id));

  // Build adjacency list with weights
  const adj: Record<string, { neighbor: string; weight: number }[]> = {};
  for (const id of nodeIds) adj[id] = [];

  for (const e of edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
    adj[e.source].push({ neighbor: e.target, weight: e.weight });
    adj[e.target].push({ neighbor: e.source, weight: e.weight });
  }

  // --- Degree & average edge weight ---
  for (const id of nodeIds) {
    const neighbors = adj[id];
    const degree = neighbors.length;
    const avgWeight = degree > 0
      ? neighbors.reduce((s, n) => s + n.weight, 0) / degree
      : 0;
    metrics[id] = {
      degree,
      eigenvectorCentrality: 0,
      betweennessCentrality: 0,
      clusteringCoeff: 0,
      avgEdgeWeight: avgWeight,
    };
  }

  const maxDegree = Math.max(1, ...Object.values(metrics).map(m => m.degree));

  // --- Eigenvector centrality (power iteration, 30 iterations) ---
  const ids = Array.from(nodeIds);
  const n = ids.length;
  if (n > 0) {
    let scores = new Float64Array(n).fill(1 / n);
    const idxMap: Record<string, number> = {};
    ids.forEach((id, i) => { idxMap[id] = i; });

    for (let iter = 0; iter < 30; iter++) {
      const next = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const neighbors = adj[ids[i]];
        for (const { neighbor, weight } of neighbors) {
          const j = idxMap[neighbor];
          if (j !== undefined) next[i] += scores[j] * weight;
        }
      }
      // Normalize
      let maxVal = 0;
      for (let i = 0; i < n; i++) if (next[i] > maxVal) maxVal = next[i];
      if (maxVal > 0) for (let i = 0; i < n; i++) next[i] /= maxVal;
      scores = next;
    }
    for (let i = 0; i < n; i++) {
      metrics[ids[i]].eigenvectorCentrality = scores[i];
    }
  }

  // --- Betweenness centrality (Brandes algorithm, approximate for large graphs) ---
  if (n > 1) {
    const bc = new Float64Array(n);
    const idxMap: Record<string, number> = {};
    ids.forEach((id, i) => { idxMap[id] = i; });

    // Sample up to 50 source nodes for approximation
    const sampleSize = Math.min(n, 50);
    const sampleIndices: number[] = [];
    for (let i = 0; i < sampleSize; i++) {
      sampleIndices.push(Math.floor(i * n / sampleSize));
    }

    for (const s of sampleIndices) {
      const stack: number[] = [];
      const pred: number[][] = Array.from({ length: n }, () => []);
      const sigma = new Float64Array(n); sigma[s] = 1;
      const dist = new Float64Array(n).fill(-1); dist[s] = 0;
      const queue: number[] = [s];
      let qi = 0;

      while (qi < queue.length) {
        const v = queue[qi++];
        stack.push(v);
        for (const { neighbor } of adj[ids[v]]) {
          const w = idxMap[neighbor];
          if (w === undefined) continue;
          if (dist[w] < 0) {
            dist[w] = dist[v] + 1;
            queue.push(w);
          }
          if (dist[w] === dist[v] + 1) {
            sigma[w] += sigma[v];
            pred[w].push(v);
          }
        }
      }

      const delta = new Float64Array(n);
      while (stack.length > 0) {
        const w = stack.pop()!;
        for (const v of pred[w]) {
          delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
        }
        if (w !== s) bc[w] += delta[w];
      }
    }

    // Normalize
    const maxBc = Math.max(1, ...bc);
    for (let i = 0; i < n; i++) {
      metrics[ids[i]].betweennessCentrality = bc[i] / maxBc;
    }
  }

  // --- Clustering coefficient ---
  for (const id of nodeIds) {
    const neighbors = adj[id].map(n => n.neighbor);
    const k = neighbors.length;
    if (k < 2) { metrics[id].clusteringCoeff = 0; continue; }
    const neighborSet = new Set(neighbors);
    let triangles = 0;
    for (let i = 0; i < neighbors.length; i++) {
      for (const { neighbor: nn } of adj[neighbors[i]]) {
        if (neighborSet.has(nn) && nn !== id) triangles++;
      }
    }
    metrics[id].clusteringCoeff = triangles / (k * (k - 1));
  }

  return metrics;
}

/**
 * Sugiyama-style rank layout for the 3D DAG view. Replaces the previous
 * force-directed simulation that normalized to fixed bounds (which made
 * dense graphs cluster too tightly regardless of node count).
 *
 * Pipeline:
 *  1. Rank assignment via Kahn's topological sort with longest-path
 *     propagation. Sources land at rank 0; each successor's rank is
 *     `max(parent rank) + 1`. Cycle nodes (rare in causal DAGs but
 *     possible in inferred graphs) are placed at rank 0.
 *  2. Barycenter ordering across ranks, sweeping down then up to
 *     reduce edge crossings.
 *  3. Coordinate assignment with bounds that scale with sqrt(N) so
 *     dense graphs spread; the camera rig (computeFitCamera in
 *     CausalDAG3D) auto-pulls back to fit the extent.
 *  4. Z stratified by `DOMAIN_Z_OFFSETS` with small jitter so domain
 *     bands stay separable but don't z-fight.
 *
 * `existingPositions` is currently unused — the topology key in
 * CausalDAG3D only changes when the node/edge id sets change, which
 * always warrants a fresh layout. Kept in the signature for forward
 * compatibility (e.g. partial graph mutations later).
 */
export function computeLayout3D(
  nodes: CausalNode[],
  edges: CausalEdge[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  existingPositions?: NodePosition[]
): NodePosition[] {
  if (nodes.length === 0) return [];

  const nodeIds = new Set(nodes.map((n) => n.id));
  const domainById = new Map<string, string>();
  for (const n of nodes) domainById.set(n.id, n.domain);

  // ── 1. Build directed adjacency ─────────────────────────────────
  const outAdj = new Map<string, string[]>();
  const inAdj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const id of nodeIds) {
    outAdj.set(id, []);
    inAdj.set(id, []);
    inDegree.set(id, 0);
  }
  for (const e of edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
    outAdj.get(e.source)!.push(e.target);
    inAdj.get(e.target)!.push(e.source);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }

  // ── 2. Longest-path rank assignment via Kahn's algorithm ────────
  const rank = new Map<string, number>();
  for (const id of nodeIds) rank.set(id, 0);
  const remaining = new Map(inDegree);
  const queue: string[] = [];
  for (const id of nodeIds) {
    if (remaining.get(id) === 0) queue.push(id);
  }
  let head = 0;
  while (head < queue.length) {
    const u = queue[head++];
    const ru = rank.get(u)!;
    for (const v of outAdj.get(u) ?? []) {
      if (rank.get(v)! < ru + 1) rank.set(v, ru + 1);
      const newDeg = (remaining.get(v) ?? 0) - 1;
      remaining.set(v, newDeg);
      if (newDeg === 0) queue.push(v);
    }
  }
  // Cycle nodes never reach in-degree 0 — leave them at rank 0 (they
  // cluster at the top, which is correct for unranked content).

  // ── 3. Group by rank, then barycenter ordering ──────────────────
  const maxRank = Math.max(0, ...Array.from(rank.values()));
  const ranks: string[][] = Array.from({ length: maxRank + 1 }, () => []);
  for (const n of nodes) ranks[rank.get(n.id)!].push(n.id);

  // Initial within-rank order: by domain (so domain bands don't get
  // shuffled by barycenter), then alphabetically by id for stability.
  for (const r of ranks) {
    r.sort((a, b) => {
      const da = domainById.get(a) ?? "";
      const db = domainById.get(b) ?? "";
      if (da !== db) return da.localeCompare(db);
      return a.localeCompare(b);
    });
  }

  const order = new Map<string, number>();
  for (const r of ranks) r.forEach((id, i) => order.set(id, i));

  const barycenter = (
    id: string,
    neighborMap: Map<string, string[]>,
  ): number => {
    const nbrs = neighborMap.get(id) ?? [];
    if (nbrs.length === 0) return order.get(id) ?? 0;
    let sum = 0;
    let count = 0;
    for (const nb of nbrs) {
      const o = order.get(nb);
      if (o !== undefined) {
        sum += o;
        count++;
      }
    }
    return count > 0 ? sum / count : (order.get(id) ?? 0);
  };

  // Two passes: down-sweep (predecessors define each rank's barycenter),
  // then up-sweep (successors). Two iterations of each is enough for the
  // crossing-reduction tradeoff at this graph size.
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 1; k <= maxRank; k++) {
      ranks[k].sort((a, b) => barycenter(a, inAdj) - barycenter(b, inAdj));
      ranks[k].forEach((id, i) => order.set(id, i));
    }
    for (let k = maxRank - 1; k >= 0; k--) {
      ranks[k].sort((a, b) => barycenter(a, outAdj) - barycenter(b, outAdj));
      ranks[k].forEach((id, i) => order.set(id, i));
    }
  }

  // ── 4. Coordinate assignment with N-scaled bounds ───────────────
  const N = nodes.length;
  const widestRank = Math.max(...ranks.map((r) => r.length));
  // Bounds grow with sqrt(N). Floors keep small graphs from looking
  // empty in the viewport; the camera fits the extent automatically.
  const xSpan = Math.max(60, Math.sqrt(N) * 9);     // half-extent in x
  const ySpan = Math.max(45, Math.sqrt(N) * 6.5);   // half-extent in y
  const Z_SCALE = 6;                                 // scale of DOMAIN_Z_OFFSETS

  const rankSpacing = maxRank > 0 ? (2 * ySpan) / maxRank : 0;
  const colSpacing = widestRank > 1 ? (2 * xSpan) / (widestRank - 1) : 0;

  const positions: NodePosition[] = [];
  for (let k = 0; k <= maxRank; k++) {
    const r = ranks[k];
    const rankLen = r.length;
    const xStart = -colSpacing * (rankLen - 1) / 2;
    // Sources land at +ySpan (top), sinks at -ySpan (bottom). Causal flow
    // reads top-down in the camera's default tilt.
    const y = maxRank === 0 ? 0 : ySpan - k * rankSpacing;
    r.forEach((id, i) => {
      const domain = domainById.get(id) ?? "";
      const zBase = (DOMAIN_Z_OFFSETS[domain] ?? 0) * Z_SCALE;
      // Small deterministic jitter (id-hash) so co-domain nodes within
      // the same rank don't z-fight; not so much that bands blur.
      let h = 0;
      for (let c = 0; c < id.length; c++) h = ((h << 5) - h + id.charCodeAt(c)) | 0;
      const zJitter = ((Math.abs(h) % 100) / 100 - 0.5) * 2.5;
      positions.push({
        id,
        x: xStart + i * colSpacing,
        y,
        z: zBase + zJitter,
      });
    });
  }

  return positions;
}
