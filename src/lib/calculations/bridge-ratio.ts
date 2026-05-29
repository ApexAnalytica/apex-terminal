// ─── Bridge ratio (χ★ %) — how skeletal the graph is ────────────────
//
// χ★ = Tarjan strict bridges ∪ top-k Bridge-Edge Strength. The ratio
// chi★ / total edges is a one-number readout of how much of the graph
// is load-bearing: high % means many edges sit on the skeleton, so
// the graph is brittle and removing the wrong edge cascades. Low %
// means the graph has redundancy.
//
// Cached via a WeakMap keyed on the edges array so node-selection
// changes don't trigger Brandes O(V·E) re-runs. The graph reference
// stays stable across selectedNode changes; only when graphData
// itself is replaced does the cache miss and chi★ re-computes.

import type { Calculation, CalculationResult } from "./types";
import type { CausalEdge, CausalGraph } from "../types";
import { chiStar } from "../estimators/chi-star";

const ratioCache = new WeakMap<CausalEdge[], number>();

function bridgeRatio(graph: {
  nodes: CausalGraph["nodes"];
  edges: CausalEdge[];
}): number {
  const cached = ratioCache.get(graph.edges);
  if (cached !== undefined) return cached;
  if (graph.edges.length === 0) {
    ratioCache.set(graph.edges, 0);
    return 0;
  }
  const r = chiStar({
    nodes: graph.nodes,
    edges: graph.edges,
    metadata: {} as CausalGraph["metadata"],
  });
  const ratio = r.chiStar.length / graph.edges.length;
  ratioCache.set(graph.edges, ratio);
  return ratio;
}

export const bridgeRatioCalculation: Calculation = {
  id: "bridge-ratio",
  name: "Bridge ratio",
  description:
    "Share of edges in the χ★ skeleton (Tarjan strict bridges ∪ top-k Bridge-Edge Strength). Higher = brittle (more edges are load-bearing); lower = redundant.",
  category: "structure",
  appliesWhen: (ctx) => ctx.graph.edges.length > 0,
  compute: (ctx): CalculationResult | null => {
    const ratio = bridgeRatio(ctx.graph);
    const pct = ratio * 100;
    const tone =
      ratio >= 0.5 ? "red" : ratio >= 0.25 ? "amber" : "green";
    const label =
      tone === "red"
        ? "highly brittle"
        : tone === "amber"
          ? "moderately brittle"
          : "redundant";
    return {
      value: { kind: "scalar", value: pct, precision: 1, unit: "%" },
      detail: `${label} skeleton`,
      tone,
    };
  },
  toGraphSnapshot: (result) => {
    if (result.value.kind !== "scalar") return null;
    return { value: result.value.value };
  },
};
