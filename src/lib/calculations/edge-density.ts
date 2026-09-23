// ─── Edge density — structural connectedness measure ─────────────────
//
// Directed-graph edge density: |E| / (|V| × (|V| − 1)). Range [0, 1].
//
// Reads:
//   < 0.05  →  sparse (typical for real causal graphs after pruning)
//   0.05 – 0.20  →  moderate
//   > 0.20  →  dense (often a sign of confounder leakage or insufficient
//                conditioning — real causal structure is rarely this
//                connected after FDR control)
//
// Graph-wide — useful as a quick "did the discovery pass over-fit?"
// check. Stores time-series so the user can watch density evolve as
// they prune / promote bridges / sever edges.

import type { Calculation, CalculationResult } from "./types";

export const edgeDensityCalculation: Calculation = {
  id: "edge-density",
  name: "Edge density",
  description:
    "Directed-graph density |E| / (|V|·(|V|−1)). < 0.05 is typical for real causal graphs after pruning; > 0.20 often signals confounder leakage or under-conditioning.",
  category: "structure",
  appliesWhen: (ctx) =>
    ctx.graph.nodes.length >= 2 && ctx.graph.edges.length > 0,
  compute: (ctx): CalculationResult | null => {
    const n = ctx.graph.nodes.length;
    if (n < 2) return null;
    const liveEdges = ctx.graph.edges.filter((e) => !e.isSevered).length;
    const maxPossible = n * (n - 1);
    const density = liveEdges / maxPossible;
    const tone =
      density > 0.2 ? "red" : density > 0.05 ? "amber" : "green";
    const interp =
      density > 0.2
        ? "dense — check for confounder leakage"
        : density > 0.05
          ? "moderate"
          : "sparse";
    return {
      value: { kind: "scalar", value: density, precision: 3 },
      detail: `${liveEdges} / ${maxPossible} possible · ${interp}`,
      tone,
    };
  },
  toGraphSnapshot: (result) => {
    if (result.value.kind !== "scalar") return null;
    return { value: result.value.value };
  },
};
