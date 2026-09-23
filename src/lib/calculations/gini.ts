// ─── Gini coefficient — alternative supply concentration metric ──────
//
// Where HHI weights tail share heavily (sum of squares), Gini measures
// inequality across the whole distribution of edge weights. The two
// answer subtly different questions:
//   HHI:  "is there a dominant supplier?"  (quadratic top weight)
//   Gini: "how unequal is the supply mix?" (mean-pairwise difference)
//
// Useful when the user wants to distinguish "one giant + many tiny"
// (high HHI AND high Gini) from "two medium dominants + many tiny"
// (lower HHI, still high Gini). Both should fire concentration
// warnings, but the failure modes are different.
//
// Formula (sorted ascending shares s_1 ≤ s_2 ≤ ... ≤ s_n):
//   Gini = (2·Σ(i·s_i) / Σs_i) / n  −  (n+1)/n
//
// Range [0, 1). 0 = perfectly equal shares; near 1 = one supplier
// holds nearly everything. The DOJ/FTC concentration thresholds
// don't have a clean Gini analogue, so we use Gini's standard
// inequality bands: >0.6 = extreme inequality (red), >0.4 = high
// inequality (amber), else neutral (green).
//
// Applied to inbound edges by default — same as HHI — so the two
// calcs answer their respective questions about the same edge set
// and the user can compare them side-by-side.

import type { Calculation, CalculationResult } from "./types";

export const giniCalculation: Calculation = {
  id: "supply-gini",
  name: "Supply Gini",
  description:
    "Gini coefficient on the selected node's inbound edge weights (0–1). Measures inequality across the supply mix. Gini > 0.4 = high inequality; > 0.6 = extreme. Compare to Supply HHI — Gini surfaces 'two large + many small' patterns HHI smooths over.",
  category: "concentration",
  appliesWhen: (ctx) => {
    if (!ctx.selectedNode) return false;
    const inbound = ctx.graph.edges.filter(
      (e) => e.target === ctx.selectedNode && !e.isSevered,
    );
    return inbound.length >= 2;
  },
  compute: (ctx): CalculationResult | null => {
    if (!ctx.selectedNode) return null;
    const inbound = ctx.graph.edges.filter(
      (e) => e.target === ctx.selectedNode && !e.isSevered,
    );
    const total = inbound.reduce((s, e) => s + e.weight, 0);
    if (total <= 0) return null;
    const shares = inbound.map((e) => e.weight / total).sort((a, b) => a - b);
    const n = shares.length;
    let weighted = 0;
    for (let i = 0; i < n; i++) weighted += (i + 1) * shares[i];
    const gini = (2 * weighted) / n - (n + 1) / n;
    // Clamp [0, 1) — floating point can drift slightly negative for
    // perfectly-equal shares.
    const clamped = Math.max(0, Math.min(0.9999, gini));
    const tone =
      clamped > 0.6 ? "red" : clamped > 0.4 ? "amber" : "green";
    const interp =
      clamped > 0.6
        ? "extreme inequality"
        : clamped > 0.4
          ? "high inequality"
          : "approximately equal";
    return {
      value: { kind: "scalar", value: clamped, precision: 3 },
      detail: `${n} inbound edges · ${interp}`,
      tone,
    };
  },
  toSnapshot: (result, ctx) => {
    if (!ctx.selectedNode) return null;
    if (result.value.kind !== "scalar") return null;
    return {
      nodeId: ctx.selectedNode,
      point: {
        kind: "calc:supply-gini",
        providerId: "calc:supply-gini",
        value: result.value.value,
        capacity: 1,
        unit: "Gini",
        observedAt: new Date().toISOString(),
        source: "Calculation · Supply Gini (manual snapshot)",
      },
    };
  },
};
