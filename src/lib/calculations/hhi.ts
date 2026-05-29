// ─── HHI: Herfindahl-Hirschman Index on a selected node's edges ──────
//
// HHI = Σ(share_i)² where share_i = edge_weight_i / Σedge_weights.
// Scaled here to [0, 10_000] following the antitrust convention so
// the result reads naturally ("HHI 2500" = moderately concentrated).
//
// Applied to *inbound* edges by default — answers the supply-side
// concentration question: how concentrated is the upstream supplier
// mix feeding this node? Same math works for outbound (buyer
// concentration) but inbound is the more frequent practical question
// in the chokepoint / dependency analyses Manifold is built around.
//
// Reference: U.S. DOJ/FTC Merger Guidelines (HHI > 1500 = moderately
// concentrated, HHI > 2500 = highly concentrated).

import type { Calculation, CalculationResult } from "./types";

export const hhiCalculation: Calculation = {
  id: "supply-hhi",
  name: "Supply HHI",
  description:
    "Herfindahl-Hirschman Index on the selected node's inbound edge weights (0–10,000). HHI > 1500 = moderately concentrated supply mix; HHI > 2500 = highly concentrated.",
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
    let hhi = 0;
    for (const e of inbound) {
      const share = e.weight / total;
      hhi += share * share;
    }
    const scaled = hhi * 10_000;
    const tone =
      scaled > 2500 ? "red" : scaled > 1500 ? "amber" : "green";
    const interp =
      scaled > 2500
        ? "highly concentrated"
        : scaled > 1500
          ? "moderately concentrated"
          : "competitive";
    return {
      value: { kind: "scalar", value: scaled, precision: 0 },
      detail: `${inbound.length} inbound edges · ${interp}`,
      tone,
    };
  },
};
