// ─── Cross-domain auto-bridging ───────────────────────────────────────
//
// Problem: when the user selects multiple domains (the MULTI chip), the
// resulting graph often comes back as 2–5 *disconnected components* —
// each domain ships its own internal edge set, and the curator-authored
// graph data doesn't always include cross-domain bridges. Visually
// you see isolated blobs; algorithmically SPIRTES's community / centrality
// metrics see disjoint subgraphs and produce uninteresting results.
//
// This module proposes cross-domain bridge edges automatically. Approach:
//   1. Find connected components (undirected BFS over edges).
//   2. For each pair of components, score every (a ∈ A, b ∈ B) pair
//      where a.domain ≠ b.domain on:
//        - category affinity (energy↔infrastructure ≈ 0.7,
//          finance↔economic ≈ 0.8, etc.)
//        - label-token Jaccard (shared words in node labels)
//        - aggregate Ω-fragility (top-Ω anchors carry more meaning)
//   3. Keep the top-K-per-pair bridges above a min-score cutoff.
//
// These bridges enter the graph with low `confidence` (0.5) and an
// explicit `physicalMechanism` tag — R-04 will pick them up as
// cross-domain low-confidence FLAGGED edges, which is exactly the
// behaviour we want: auto-proposed structure that the user (or
// downstream verification) can promote or reject.

import type {
  CausalEdge,
  CausalGraph,
  CausalNode,
  NodeCategory,
} from "./types";

export interface BridgeCandidate {
  /** Source node id (chosen by descending omegaFragility within component) */
  sourceId: string;
  /** Target node id */
  targetId: string;
  /** 0..1 — combined affinity score */
  score: number;
  /** Human-readable reason this pair was selected */
  rationale: string;
  /** Component indices being bridged (0-based, stable across one call) */
  componentA: number;
  componentB: number;
}

export interface BridgeOptions {
  /** Min combined score to keep a bridge. Default 0.3. */
  minScore: number;
  /** Max bridges to emit per (componentA, componentB) pair. Default 1. */
  maxPerComponentPair: number;
  /** Soft cap on total bridges emitted, picked top-score-first. Default 16. */
  maxTotal: number;
}

const DEFAULT_OPTIONS: BridgeOptions = {
  minScore: 0.3,
  maxPerComponentPair: 1,
  maxTotal: 16,
};

/**
 * Find connected components treating edges as undirected. Returns the
 * component each node belongs to (0-based index) and the per-component
 * id arrays.
 */
export function findConnectedComponents(graph: CausalGraph): {
  membership: Map<string, number>;
  components: string[][];
} {
  const adj = new Map<string, Set<string>>();
  for (const node of graph.nodes) adj.set(node.id, new Set());
  for (const edge of graph.edges) {
    adj.get(edge.source)?.add(edge.target);
    adj.get(edge.target)?.add(edge.source);
  }
  const membership = new Map<string, number>();
  const components: string[][] = [];
  for (const node of graph.nodes) {
    if (membership.has(node.id)) continue;
    const idx = components.length;
    const component: string[] = [];
    const queue: string[] = [node.id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (membership.has(current)) continue;
      membership.set(current, idx);
      component.push(current);
      for (const neighbor of adj.get(current) ?? []) {
        if (!membership.has(neighbor)) queue.push(neighbor);
      }
    }
    components.push(component);
  }
  return { membership, components };
}

/**
 * Category affinity — symmetric. Same category = 1.0; related categories
 * carry a positive partial score; unrelated = 0. The table reflects the
 * domain-knowledge groupings the existing graph uses (energy infrastructure
 * pairs are common; finance/economic are tightly linked, etc.).
 */
const CATEGORY_AFFINITY: Record<NodeCategory, Partial<Record<NodeCategory, number>>> = {
  energy: { infrastructure: 0.7, manufacturing: 0.5, geopolitical: 0.5 },
  manufacturing: { infrastructure: 0.6, energy: 0.5, agriculture: 0.4 },
  infrastructure: { energy: 0.7, communications: 0.6, manufacturing: 0.6 },
  finance: { economic: 0.8, geopolitical: 0.5 },
  economic: { finance: 0.8, agriculture: 0.4 },
  agriculture: { manufacturing: 0.4, economic: 0.4 },
  communications: { infrastructure: 0.6 },
  geopolitical: { energy: 0.5, finance: 0.5 },
  science: {},
};

function categoryAffinity(a: NodeCategory, b: NodeCategory): number {
  if (a === b) return 1;
  return CATEGORY_AFFINITY[a]?.[b] ?? CATEGORY_AFFINITY[b]?.[a] ?? 0;
}

/** Tokenize a label into lowercased, deduplicated words of length ≥ 3. */
function labelTokens(label: string): Set<string> {
  return new Set(
    label
      .toLowerCase()
      .split(/[\s\-_/()&,.:;]+/)
      .filter((t) => t.length >= 3),
  );
}

/** Jaccard similarity between two label token sets. */
function labelTokenJaccard(labelA: string, labelB: string): number {
  const a = labelTokens(labelA);
  const b = labelTokens(labelB);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection += 1;
  const union = a.size + b.size - intersection;
  return intersection / union;
}

/** Combined bridge score: 0.5·category + 0.3·labelOverlap + 0.2·Ω-anchor. */
function scoreBridge(a: CausalNode, b: CausalNode): number {
  const cat = categoryAffinity(a.category, b.category);
  const lbl = labelTokenJaccard(a.label, b.label);
  const omegaAvg = (a.omegaFragility.composite + b.omegaFragility.composite) / 2;
  const omegaWeight = Math.min(1, omegaAvg / 10);
  return 0.5 * cat + 0.3 * lbl + 0.2 * omegaWeight;
}

function rationaleFor(a: CausalNode, b: CausalNode): string {
  const parts: string[] = [];
  if (a.category === b.category) parts.push(`same category (${a.category})`);
  else if (categoryAffinity(a.category, b.category) > 0) {
    parts.push(`related categories (${a.category}↔${b.category})`);
  }
  if (labelTokenJaccard(a.label, b.label) > 0.2) parts.push("label overlap");
  parts.push(
    `Ω ${a.omegaFragility.composite.toFixed(1)}×${b.omegaFragility.composite.toFixed(1)}`,
  );
  return parts.join(" · ");
}

/**
 * Propose cross-component, cross-domain bridge edges.
 *
 * Returns an empty array if the graph is already connected (single
 * component) or if no candidate pair clears `minScore`.
 *
 * Honest scope: this is a *heuristic*, not a discovery algorithm. The
 * bridges land with `confidence: 0.5` so R-04 (cross-domain ∧ conf < 0.7)
 * flags them — they are explicitly UNVERIFIED until a real algorithm or
 * a human curator promotes them.
 */
export function proposeCrossDomainBridges(
  graph: CausalGraph,
  options?: Partial<BridgeOptions>,
): BridgeCandidate[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { components } = findConnectedComponents(graph);
  if (components.length < 2) return [];

  const nodeById = new Map<string, CausalNode>();
  for (const node of graph.nodes) nodeById.set(node.id, node);

  const candidates: BridgeCandidate[] = [];
  for (let i = 0; i < components.length; i++) {
    for (let j = i + 1; j < components.length; j++) {
      const pairScores: BridgeCandidate[] = [];
      for (const idA of components[i]) {
        for (const idB of components[j]) {
          const a = nodeById.get(idA);
          const b = nodeById.get(idB);
          if (!a || !b) continue;
          if (a.domain === b.domain) continue; // not a cross-domain bridge
          const score = scoreBridge(a, b);
          if (score < opts.minScore) continue;
          pairScores.push({
            sourceId: a.id,
            targetId: b.id,
            score,
            rationale: rationaleFor(a, b),
            componentA: i,
            componentB: j,
          });
        }
      }
      pairScores.sort((x, y) => y.score - x.score);
      candidates.push(...pairScores.slice(0, opts.maxPerComponentPair));
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, opts.maxTotal);
}

/** Convert bridges to `CausalEdge` entries ready to merge into the graph. */
export function bridgesToEdges(bridges: BridgeCandidate[]): CausalEdge[] {
  return bridges.map((b, i) => ({
    id: `auto-bridge-${i}-${b.sourceId}-${b.targetId}`,
    source: b.sourceId,
    target: b.targetId,
    weight: +b.score.toFixed(2),
    lag: 0,
    type: "directed" as const,
    // Intentionally below R-04's static 0.7 threshold so these surface as
    // FLAGGED in VERIFIED mode. They are proposals, not facts.
    confidence: 0.5,
    isInconsistent: false,
    physicalMechanism: `auto-bridge: ${b.rationale} (heuristic score ${b.score.toFixed(2)})`,
  }));
}

/**
 * Apply auto-bridges in-place, returning a NEW graph with the proposed
 * bridge edges appended. Safe to call on already-connected graphs — it's
 * a no-op when only one component is present.
 */
export function applyCrossDomainBridges(
  graph: CausalGraph,
  options?: Partial<BridgeOptions>,
): { graph: CausalGraph; bridges: BridgeCandidate[] } {
  const bridges = proposeCrossDomainBridges(graph, options);
  if (bridges.length === 0) return { graph, bridges: [] };
  const newEdges = bridgesToEdges(bridges);
  return {
    graph: {
      ...graph,
      edges: [...graph.edges, ...newEdges],
      metadata: {
        ...graph.metadata,
        totalEdges: graph.edges.length + newEdges.length,
      },
    },
    bridges,
  };
}
