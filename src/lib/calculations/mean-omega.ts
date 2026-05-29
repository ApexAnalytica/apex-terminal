// ─── Mean ΩF composite across the active graph ────────────────────────
//
// Simple aggregate — average of every node's ΩF composite score.
// Useful as a single-number readout of "how stressed is this graph
// right now". Tone bucket lines up with the standard ΩF colour ramp:
// ≥ 7 amber, ≥ 9 red.

import type { Calculation, CalculationResult } from "./types";

export const meanOmegaCalculation: Calculation = {
  id: "mean-omega",
  name: "Mean ΩF",
  description:
    "Mean Ω-Fragility composite across all nodes in the active graph (0–10 scale).",
  category: "score",
  appliesWhen: (ctx) => ctx.graph.nodes.length > 0,
  compute: (ctx): CalculationResult | null => {
    const nodes = ctx.graph.nodes;
    if (nodes.length === 0) return null;
    const sum = nodes.reduce(
      (s, n) => s + (n.omegaFragility?.composite ?? 0),
      0,
    );
    const mean = sum / nodes.length;
    const tone = mean >= 9 ? "red" : mean >= 7 ? "amber" : "green";
    return {
      value: { kind: "scalar", value: mean, precision: 2 },
      detail: `across ${nodes.length} node${nodes.length === 1 ? "" : "s"}`,
      tone,
    };
  },
};
