// ─── Calculations: shared types ───────────────────────────────────────
//
// Calculations are pure functions that take a context (graph +
// selection) and return a scalar result. They're surfaced in the
// right-rail CALCULATIONS panel — see CalculationsPanel.tsx — and
// register through the array in registry.ts. The pattern is
// deliberately small so financial Greeks, T1D risk scores,
// supply-chain concentration variants, etc. can plug in as
// individual functions without engine-level changes.

import type { CausalNode, CausalEdge } from "../types";

export interface CalculationContext {
  graph: { nodes: CausalNode[]; edges: CausalEdge[] };
  selectedNode: string | null;
  selectedDomains: string[];
}

export type CalculationValue =
  | { kind: "scalar"; value: number; unit?: string; precision?: number }
  | { kind: "text"; value: string };

export type CalculationTone = "amber" | "red" | "green";

export interface CalculationResult {
  value: CalculationValue;
  detail?: string;
  tone?: CalculationTone;
}

export interface Calculation {
  id: string;
  /** Short label rendered in the menu row */
  name: string;
  /** Hover-tooltip explanation (one sentence). */
  description: string;
  category: "concentration" | "structure" | "score";
  /** Predicate gating whether to render this calculation for the current context. */
  appliesWhen: (ctx: CalculationContext) => boolean;
  /** Pure compute — must not mutate context. Returns null when the gating
   *  predicate passed but the data still doesn't support a value (e.g.
   *  selected node has no inbound edges for a supply HHI). */
  compute: (ctx: CalculationContext) => CalculationResult | null;
}
