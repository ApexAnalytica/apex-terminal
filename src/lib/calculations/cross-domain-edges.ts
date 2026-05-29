// ─── Cross-domain edges — structural count ───────────────────────────
//
// Counts edges where source.domain !== target.domain. Used as a
// quick sanity check for how much of the active graph genuinely
// straddles domains vs. lives inside a single one — directly
// motivates how many bridges the auto-bridging pass should add /
// has added.

import type { Calculation, CalculationResult } from "./types";

export const crossDomainEdgesCalculation: Calculation = {
  id: "cross-domain-edges",
  name: "Cross-domain edges",
  description:
    "Number of edges whose source and target nodes are in different domains. Higher counts mean the graph has genuine cross-domain causal structure (vs. isolated single-domain blobs).",
  category: "structure",
  appliesWhen: (ctx) => ctx.graph.edges.length > 0,
  compute: (ctx): CalculationResult | null => {
    const nodeById = new Map(ctx.graph.nodes.map((n) => [n.id, n]));
    let crossCount = 0;
    let totalLive = 0;
    for (const e of ctx.graph.edges) {
      if (e.isSevered) continue;
      const s = nodeById.get(e.source);
      const t = nodeById.get(e.target);
      if (!s || !t) continue;
      totalLive += 1;
      if (s.domain !== t.domain) crossCount += 1;
    }
    if (totalLive === 0) return null;
    const pct = (crossCount / totalLive) * 100;
    return {
      value: { kind: "scalar", value: crossCount, precision: 0 },
      detail: `${pct.toFixed(0)}% of ${totalLive} active edges cross a domain boundary`,
    };
  },
};
