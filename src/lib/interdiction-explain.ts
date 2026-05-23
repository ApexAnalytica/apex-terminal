/**
 * Narrative explainers for interdiction-solver outputs.
 *
 * The interdiction card surfaces each recommended cut as a row with a
 * `marginalReduction` number ("saves 2.4 pts") and a SEVER/ABLATE
 * button. That's enough for an expert reader but a commercial buyer
 * who clicks the card wants the *why* in prose:
 *   - Where does this cut sit in the greedy walk?
 *   - What was the baseline damage before this cut, and after?
 *   - What's the underlying causal mechanism being severed?
 *
 * This module produces that narrative from the existing
 * `InterdictionResult.interventions[i]` data + the source graph (no
 * solver changes). Pure functions so the UI can call them inline and
 * the math stays unit-testable.
 */

import type { CausalEdge, CausalGraph, CausalNode } from "@/lib/types";
import type {
  InterdictionCandidate,
  InterdictionResult,
} from "@/lib/interdiction-engine";

/**
 * Per-step context derived from a candidate's position in the greedy walk.
 * The solver picks one cut per step and accumulates them — so the damage
 * AT THE START of step i is whichever damage existed after step i-1
 * (or the baseline for step 0).
 */
export interface InterdictionStepContext {
  /** 1-indexed step number in the greedy walk. */
  step: number;
  /** Total intervention count (matches `interventions.length`). */
  totalSteps: number;
  /** Damage entering this step (baseline for step 1, prior step's `damage` after). */
  damageBefore: number;
  /** Damage exiting this step (the candidate's `damage` field). */
  damageAfter: number;
  /** `damageBefore - damageAfter`. Matches `marginalReduction` to within rounding. */
  marginalReduction: number;
  /** % reduction from this step alone, vs damageBefore. */
  stepReductionPct: number;
}

/**
 * Build the per-step context for an intervention. Returns null if the
 * index is out of range. Callers in the UI typically iterate the
 * `interventions` array and pass `(result, i)` for each row.
 *
 * Why baseline-vs-prior matters in the narrative: a cut that ranks #3
 * isn't necessarily weak. It's the best cut GIVEN that #1 and #2 are
 * already applied. Surfacing the per-step damage delta defends "why
 * didn't you pick X instead?" questions from skeptical readers.
 */
export function stepContextForIntervention(
  result: InterdictionResult,
  index: number,
): InterdictionStepContext | null {
  const iv = result.interventions[index];
  if (!iv) return null;
  const damageBefore =
    index === 0 ? result.baselineDamage : result.interventions[index - 1].damage;
  const damageAfter = iv.damage;
  const marginalReduction = damageBefore - damageAfter;
  const stepReductionPct =
    damageBefore > 0 ? (marginalReduction / damageBefore) * 100 : 0;
  return {
    step: index + 1,
    totalSteps: result.interventions.length,
    damageBefore,
    damageAfter,
    marginalReduction,
    stepReductionPct,
  };
}

/**
 * Mechanism narrative — the plain-prose answer to "what is this cut
 * actually doing?". For edges, surfaces the source/target labels, the
 * weight, and the `physicalMechanism` text already on the edge. For
 * nodes, the label + a count of downstream edges this ablation would
 * sever indirectly.
 *
 * Returns short prose paragraphs, NOT formatted UI markup — the caller
 * decides how to render. Empty string-valued fields are skipped so the
 * caller can `.filter(Boolean)` and not render blank rows.
 */
export function mechanismNarrative(
  candidate: InterdictionCandidate,
  graph: CausalGraph,
): string[] {
  if (candidate.target.type === "edge") {
    const edge = graph.edges.find((e) => e.id === candidate.target.id);
    if (!edge) return [`Cut: ${candidate.target.label}`];
    const source = graph.nodes.find((n) => n.id === edge.source);
    const target = graph.nodes.find((n) => n.id === edge.target);
    const sourceLabel = source?.shortLabel ?? edge.source;
    const targetLabel = target?.shortLabel ?? edge.target;
    const lines: string[] = [
      `Severs the ${edge.weight.toFixed(2)}-weight causal link from ${sourceLabel} to ${targetLabel}.`,
    ];
    if (edge.physicalMechanism) {
      lines.push(`Mechanism: ${edge.physicalMechanism}`);
    }
    return lines;
  }
  // node ablation
  const node = graph.nodes.find((n) => n.id === candidate.target.id);
  if (!node) return [`Ablate: ${candidate.target.label}`];
  const outEdges = graph.edges.filter(
    (e) => e.source === node.id && !e.isSevered,
  );
  const inEdges = graph.edges.filter(
    (e) => e.target === node.id && !e.isSevered,
  );
  return [
    `Ablates ${node.label} (${node.domain || node.category}).`,
    `Removes ${outEdges.length} outgoing influence${outEdges.length === 1 ? "" : "s"} and ${inEdges.length} incoming dependenc${inEdges.length === 1 ? "y" : "ies"} from the cascade.`,
  ];
}

/**
 * Greedy-walk rank narrative — one line explaining where this cut sits
 * in the priority ordering. Returns a single sentence the UI can drop
 * in as-is. The phrasing changes by position so a #1 cut reads
 * differently from a #3 cut.
 */
export function rankNarrative(ctx: InterdictionStepContext): string {
  if (ctx.step === 1) {
    return `Highest-impact cut available — picked first in the greedy walk because no other single intervention reduced worst-case damage more.`;
  }
  if (ctx.step === ctx.totalSteps && ctx.totalSteps > 1) {
    return `Step ${ctx.step} of ${ctx.totalSteps}. Lower marginal save than the earlier cuts because the prior ${ctx.totalSteps - 1} interventions already drove damage down — this is the best remaining cut given those.`;
  }
  return `Step ${ctx.step} of ${ctx.totalSteps} in the greedy walk. Chosen as the best cut conditional on steps 1–${ctx.step - 1} already being applied.`;
}

/**
 * Damage-delta narrative — one line in plain prose describing the
 * before/after damage scores and the % reduction this step alone
 * contributes. Skips % when damageBefore is 0 (degenerate baseline).
 */
export function damageDeltaNarrative(ctx: InterdictionStepContext): string {
  const pct =
    ctx.damageBefore > 0
      ? ` (${ctx.stepReductionPct.toFixed(0)}% of remaining damage)`
      : "";
  return `Worst-case cascade damage: ${ctx.damageBefore.toFixed(1)} → ${ctx.damageAfter.toFixed(1)}, saving ${ctx.marginalReduction.toFixed(1)} pts${pct}.`;
}

/**
 * Convenience bundle — full narrative ready to render. Combines rank +
 * damage + mechanism into a single struct so the caller doesn't have
 * to wire each helper individually. Returns null when the index is out
 * of range.
 */
export interface InterdictionExplanation {
  rank: string;
  damageDelta: string;
  mechanism: string[];
}

export function explainIntervention(
  result: InterdictionResult,
  index: number,
  graph: CausalGraph,
): InterdictionExplanation | null {
  const ctx = stepContextForIntervention(result, index);
  if (!ctx) return null;
  return {
    rank: rankNarrative(ctx),
    damageDelta: damageDeltaNarrative(ctx),
    mechanism: mechanismNarrative(result.interventions[index], graph),
  };
}

// Re-export the supporting types so callers don't have to dual-import
// from interdiction-engine.ts and this module separately.
export type { InterdictionCandidate, InterdictionResult, CausalEdge, CausalNode };
