// ─── Mean Jurisdictional Hazard across the active graph ──────────────
//
// Mean of every node's J pillar (sanctions, conflict, export controls,
// regulatory exposure on the 0–10 ΩF scale). Complements Mean ΩF —
// the composite mean smears across all 5 pillars; this picks out the
// regulatory / political-risk dimension specifically. Useful when
// the graph spans jurisdictions with very different exposure profiles
// (e.g. Saudi + Iran + EU + US — the composite can look mid-range
// while the J pillar is the actual driver).
//
// Same tone buckets as Mean ΩF (≥9 red, ≥7 amber) since J is on the
// same 0–10 scale.

import type { Calculation, CalculationResult } from "./types";

export const meanJurisdictionalHazardCalculation: Calculation = {
  id: "mean-j-hazard",
  name: "Mean J hazard",
  description:
    "Mean jurisdictional-hazard pillar across all nodes (0–10). Isolates sanctions / conflict / export-control exposure independently of the composite ΩF mean.",
  category: "score",
  appliesWhen: (ctx) => ctx.graph.nodes.length > 0,
  compute: (ctx): CalculationResult | null => {
    const nodes = ctx.graph.nodes;
    if (nodes.length === 0) return null;
    const sum = nodes.reduce(
      (s, n) => s + (n.omegaFragility?.jurisdictionalHazard ?? 0),
      0,
    );
    const mean = sum / nodes.length;
    const tone = mean >= 9 ? "red" : mean >= 7 ? "amber" : "green";
    return {
      value: { kind: "scalar", value: mean, precision: 2 },
      detail: `J pillar across ${nodes.length} node${nodes.length === 1 ? "" : "s"}`,
      tone,
    };
  },
  toGraphSnapshot: (result) => {
    if (result.value.kind !== "scalar") return null;
    return { value: result.value.value };
  },
};
