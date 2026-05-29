// ─── Calculations: shared types ───────────────────────────────────────
//
// Calculations are pure functions that take a context (graph +
// selection) and return a scalar result. They're surfaced in the
// right-rail CALCULATIONS panel — see CalculationsPanel.tsx — and
// register through the array in registry.ts. The pattern is
// deliberately small so financial Greeks, T1D risk scores,
// supply-chain concentration variants, etc. can plug in as
// individual functions without engine-level changes.

import type { CausalNode, CausalEdge, LiveDataPoint } from "../types";

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

/** Result of mapping a Calculation to a TimeDial snapshot. */
export interface CalculationSnapshot {
  /** Node to attach the snapshot to. */
  nodeId: string;
  /** LiveDataPoint to upsert onto the node — `kind` typically `"calc:<id>"`. */
  point: LiveDataPoint;
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
  /** Optional: convert a computed result into a TimeDial snapshot.
   *  Calcs that implement this gain a "→ DIAL" affordance in the UI;
   *  clicking it appends the snapshot to the target node's `liveData[]`,
   *  where the existing temporal infrastructure accumulates history and
   *  renders sparklines. Calcs without a stable node target (graph-wide
   *  aggregates) leave this undefined. */
  toSnapshot?: (
    result: CalculationResult,
    ctx: CalculationContext,
  ) => CalculationSnapshot | null;
}
