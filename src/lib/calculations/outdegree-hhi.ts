// ─── Outdegree HHI — buyer / downstream concentration ────────────────
//
// Mirror of `hhi.ts` (supply HHI on inbound) applied to the selected
// node's outbound edge weights. Answers the demand-side concentration
// question: how concentrated is the downstream mix this node feeds?
// Same DOJ/FTC scale and tone buckets as supply HHI for visual
// consistency.
//
// Together with supply HHI, the two surface both ends of the
// chokepoint question — a node sitting between a few critical
// suppliers and a few critical buyers is the high-leverage
// interdiction target.

import type { Calculation, CalculationResult } from "./types";

export const outdegreeHhiCalculation: Calculation = {
  id: "outdegree-hhi",
  name: "Buyer HHI",
  description:
    "Herfindahl-Hirschman Index on the selected node's outbound edge weights (0–10,000). HHI > 1500 = moderately concentrated buyer mix; HHI > 2500 = highly concentrated.",
  category: "concentration",
  appliesWhen: (ctx) => {
    if (!ctx.selectedNode) return false;
    const outbound = ctx.graph.edges.filter(
      (e) => e.source === ctx.selectedNode && !e.isSevered,
    );
    return outbound.length >= 2;
  },
  compute: (ctx): CalculationResult | null => {
    if (!ctx.selectedNode) return null;
    const outbound = ctx.graph.edges.filter(
      (e) => e.source === ctx.selectedNode && !e.isSevered,
    );
    const total = outbound.reduce((s, e) => s + e.weight, 0);
    if (total <= 0) return null;
    let hhi = 0;
    for (const e of outbound) {
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
      detail: `${outbound.length} outbound edges · ${interp}`,
      tone,
    };
  },
  toSnapshot: (result, ctx) => {
    if (!ctx.selectedNode) return null;
    if (result.value.kind !== "scalar") return null;
    return {
      nodeId: ctx.selectedNode,
      point: {
        kind: "calc:buyer-hhi",
        providerId: "calc:buyer-hhi",
        value: result.value.value,
        capacity: 10_000,
        unit: "HHI",
        observedAt: new Date().toISOString(),
        source: "Calculation · Buyer HHI (manual snapshot)",
      },
    };
  },
};
