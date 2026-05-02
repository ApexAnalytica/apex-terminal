import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
} from "d3-force-3d";
import { CausalNode, CausalEdge } from "./types";

interface LayoutNode {
  id: string;
  x: number;
  y: number;
  z: number;
  domain: string;
  index?: number;
  vx?: number;
  vy?: number;
  vz?: number;
}

interface LayoutLink {
  source: string | LayoutNode;
  target: string | LayoutNode;
  weight: number;
  index?: number;
}

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

// Domain z-layer targets (before normalization)
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

// Target bounding box half-extents for the final layout
const BOUNDS = { x: 55, y: 40, z: 35 };

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

export function computeLayout3D(
  nodes: CausalNode[],
  edges: CausalEdge[],
  existingPositions?: NodePosition[]
): NodePosition[] {
  const existingMap = new Map<string, NodePosition>();
  if (existingPositions) {
    existingPositions.forEach((p) => existingMap.set(p.id, p));
  }
  const hasExisting = existingMap.size > 0;

  const simNodes: LayoutNode[] = nodes.map((n) => {
    const existing = existingMap.get(n.id);
    if (existing) {
      return { id: n.id, domain: n.domain, x: existing.x, y: existing.y, z: existing.z };
    }
    const zBase = DOMAIN_Z_OFFSETS[n.domain] ?? 0;
    return {
      id: n.id,
      domain: n.domain,
      x: (Math.random() - 0.5) * 10,
      y: (Math.random() - 0.5) * 10,
      z: zBase + (Math.random() - 0.5) * 2,
    };
  });

  // Edge weight drives spring distance: higher weight (stronger correlation) → shorter distance
  const simLinks: LayoutLink[] = edges.map((e) => ({
    source: e.source,
    target: e.target,
    weight: e.weight,
  }));

  // Build adjacency to identify connected vs disconnected nodes
  const connected = new Set<string>();
  for (const link of simLinks) {
    const src = typeof link.source === "string" ? link.source : link.source.id;
    const tgt = typeof link.target === "string" ? link.target : link.target.id;
    connected.add(src);
    connected.add(tgt);
  }

  // d3-force-3d types are incomplete — runtime API accepts (nodes, nDim).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnySim = any;
  const sim = (forceSimulation as AnySim)(simNodes, 3)
    .force(
      "link",
      (forceLink as AnySim)(simLinks)
        .id((d: AnySim) => d.id)
        // Distance inversely proportional to edge weight:
        // weight 1.0 (strong correlation) → distance 10 (close together)
        // weight 0.1 (weak correlation) → distance 35 (far apart)
        .distance((d: AnySim) => 10 + (1 - d.weight) * 25)
        .strength((d: AnySim) => 0.3 + d.weight * 0.4)
    )
    .force("charge", (forceManyBody as AnySim)().strength((d: AnySim) =>
      connected.has(d.id) ? -100 : -30
    ))
    .force("center", forceCenter(0, 0, 0))
    .velocityDecay(0.4)
    .stop();

  const iterations = hasExisting ? 50 : 200;
  for (let i = 0; i < iterations; i++) {
    sim.tick();
  }

  // Shift each domain group's z toward its target layer
  const domainGroups: Record<string, LayoutNode[]> = {};
  simNodes.forEach((n) => {
    (domainGroups[n.domain] ??= []).push(n);
  });
  for (const [domain, group] of Object.entries(domainGroups)) {
    const targetZ = (DOMAIN_Z_OFFSETS[domain] ?? 0) * 5; // scale up
    const avgZ = group.reduce((s, n) => s + n.z, 0) / group.length;
    const shift = (targetZ - avgZ) * 0.7;
    group.forEach((n) => { n.z += shift; });
  }

  // Normalize positions to fit within BOUNDS
  const xs = simNodes.map((n) => n.x);
  const ys = simNodes.map((n) => n.y);
  const zs = simNodes.map((n) => n.z);
  const extX = Math.max(Math.abs(Math.min(...xs)), Math.abs(Math.max(...xs))) || 1;
  const extY = Math.max(Math.abs(Math.min(...ys)), Math.abs(Math.max(...ys))) || 1;
  const extZ = Math.max(Math.abs(Math.min(...zs)), Math.abs(Math.max(...zs))) || 1;

  return simNodes.map((n) => ({
    id: n.id,
    x: (n.x / extX) * BOUNDS.x,
    y: (n.y / extY) * BOUNDS.y,
    z: (n.z / extZ) * BOUNDS.z,
  }));
}
