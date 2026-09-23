// ─── Discovery — Ω-Forgetting Pressure ──────────────────────────────
//
// Phase 3 PR 4 of the Ghauri 2025 dissertation integration. Reads an
// FRResult (PR #396) plus a per-task exposure vector and reduces to a
// single trace-level scalar: how much of the model's capability is
// being lost RIGHT NOW, weighted by how exposed each task is.
//
// Why this matters for AI Safety: the dissertation's Ch. 8 catastrophic-
// forgetting argument is that the R-pillar reading should NOT treat
// every attack class equally. A Heartbleed-class attacker doesn't care
// that the model still nails DDoS — they care that Heartbleed detection
// rotted. Ω-Forgetting Pressure is the operator-facing scalar that says
// "given which attack classes you actually see in production, how much
// of your defence has rotted." It's the catastrophic-forgetting analog
// of Ω-Bridge Density (a single [0, 1] scalar for the operator).
//
// FORMULAS
// --------
// Given:
//   normalizedFR_k(t) = fraction of task_k's peak accuracy lost by
//                       epoch t (from PR #396 FR estimator).
//   w_k               = exposure / importance weight for task_k.
//
// Normalize the weights so they sum to 1 (when `normalizeWeights:
// true`), then:
//
//   Ω-FP(t) = Σ_k w_k · clamp(normalizedFR_k(t), 0, 1)
//
// And the trace-level summary scalar:
//
//   Ω-FP_summary = Σ_k w_k · clamp(normalizedFR_k, 0, 1)
//
// (Where `normalizedFR_k` without `(t)` is the summary scalar from
// `FRTaskResult` — peakAccuracy − finalAccuracy normalized.)
//
// NAN HANDLING
// ------------
// FR estimator returns NaN for tasks with peakAccuracy ≤ 0 (degenerate
// — never trained, no accuracy ever). Those tasks DROP from the sum
// (exposure forfeited) — they don't pollute the pressure scalar with
// NaN. If every task is degenerate, the result is NaN (no data).
//
// PROVENANCE
// ----------
// `sourceKind` is forwarded verbatim from the FRResult (which forwards
// from the underlying TrainingTrace). UI surfaces displaying values
// derived from a synthetic-kind result MUST render a SYNTHETIC badge.
// PR 4's UI is what enforces this.
//
// DOMAIN GATING
// -------------
// AI-domain only in SEMANTICS. Function signature is profile-agnostic
// — same pattern as `computeBESTemporal` and `computeFR`. Gating
// happens upstream in the UI surface (which only renders this on
// AI_SAFETY_PROFILE).

import type { FRResult, FRTaskResult } from "./fr-estimator";

export interface OmegaForgettingPressureOptions {
  /**
   * Per-task exposure weights. Keyed by `FRTaskResult.taskId`. Tasks
   * missing from this record default to `1` (uniform fallback). Tasks
   * present with a value of 0 contribute nothing to the pressure scalar.
   *
   * Default: every task gets weight 1 (uniform exposure). With
   * `normalizeWeights: true` this is equivalent to averaging the FR
   * values, weighted equally.
   */
  exposure?: Record<string, number>;
  /**
   * Normalize the weights so they sum to 1 before computing the
   * weighted sum. Default `true` — keeps `Ω-FP ∈ [0, 1]` regardless of
   * the raw weight scale, which is what the UI band coloring assumes.
   *
   * Set to `false` if the caller wants raw weighted sums (e.g., for
   * computing aggregate "expected forgotten capacity" across an
   * adversary mix where the weights aren't probabilities).
   */
  normalizeWeights?: boolean;
}

export interface TaskContribution {
  taskId: string;
  /** Exposure weight actually used (after normalization, if any). */
  exposure: number;
  /** Summary normalizedFR for this task (NaN-stripped). */
  normalizedFR: number;
  /** `exposure × normalizedFR` — this task's contribution to the summary pressure. */
  contribution: number;
}

export interface OmegaForgettingPressureResult {
  /**
   * Summary scalar — `Σ w_k · normalizedFR_k` where `normalizedFR_k`
   * is the trace-level FR scalar (peak − final). With normalized
   * weights this lies in [0, 1]. NaN when every task is degenerate.
   */
  pressure: number;
  /**
   * Time-varying pressure series — `pressureOverTime[t] = Σ w_k ·
   * normalizedFROverTime_k[t]`. Length matches the underlying FR time
   * series. Same `[0, 1]` range when weights are normalized.
   */
  pressureOverTime: number[];
  /**
   * Per-task breakdown of the summary pressure. Useful for the UI
   * drill-down ("which tasks drove the reading"). Sorted by
   * `contribution` descending.
   */
  contributions: TaskContribution[];
  /** Total exposure mass across non-degenerate tasks (1 when normalized). */
  totalExposure: number;
  /** Number of tasks whose `normalizedFR` was NaN and excluded from the sum. */
  degenerateTaskCount: number;
  /** Forwarded from `frResult.sourceKind`. SYNTHETIC-badge gate. */
  sourceKind: "synthetic" | "live";
  /** Forwarded from `frResult.traceId`. */
  traceId: string;
}

// ─── Implementation ─────────────────────────────────────────────────

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * Resolve the per-task exposure used in the weighted sum. Missing
 * tasks get weight 1 (uniform fallback); negative weights are clamped
 * to 0; NaN/Infinity weights are treated as 0.
 */
function resolveExposure(
  tasks: FRTaskResult[],
  override: Record<string, number> | undefined,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of tasks) {
    const raw = override?.[t.taskId];
    const w = raw === undefined ? 1 : raw;
    if (!Number.isFinite(w) || w < 0) {
      out.set(t.taskId, 0);
    } else {
      out.set(t.taskId, w);
    }
  }
  return out;
}

/**
 * Build the live exposure vector — exposure ONLY counted on tasks
 * whose `normalizedFR` is defined (peakAccuracy > 0). Returned vector
 * + total mass; if `normalizeWeights` was requested and the total
 * mass is > 0, the per-task values are scaled to sum to 1.
 */
function liveExposure(
  tasks: FRTaskResult[],
  resolved: Map<string, number>,
  normalize: boolean,
): { live: Map<string, number>; total: number; degenerate: number } {
  const live = new Map<string, number>();
  let total = 0;
  let degenerate = 0;
  for (const t of tasks) {
    const w = resolved.get(t.taskId) ?? 0;
    if (Number.isNaN(t.normalizedFR)) {
      degenerate++;
      continue;
    }
    live.set(t.taskId, w);
    total += w;
  }
  if (normalize && total > 0) {
    for (const [k, v] of live) live.set(k, v / total);
    total = 1;
  }
  return { live, total, degenerate };
}

/**
 * Compute Ω-Forgetting Pressure on an FRResult.
 *
 * Throws when the FRResult has no tasks — caller should already have
 * validated this upstream.
 */
export function computeOmegaForgettingPressure(
  frResult: FRResult,
  options: OmegaForgettingPressureOptions = {},
): OmegaForgettingPressureResult {
  if (frResult.tasks.length === 0) {
    throw new Error(
      "computeOmegaForgettingPressure: FRResult has zero tasks",
    );
  }
  const normalize = options.normalizeWeights ?? true;
  const resolved = resolveExposure(frResult.tasks, options.exposure);
  const { live, total, degenerate } = liveExposure(
    frResult.tasks,
    resolved,
    normalize,
  );

  // ── Summary scalar ──────────────────────────────────────────────
  let pressure = 0;
  let anyContribution = false;
  const contributions: TaskContribution[] = [];
  for (const t of frResult.tasks) {
    const w = live.get(t.taskId);
    if (w === undefined) continue; // degenerate task
    const nfr = clamp01(t.normalizedFR);
    const contribution = w * nfr;
    pressure += contribution;
    anyContribution = true;
    contributions.push({
      taskId: t.taskId,
      exposure: w,
      normalizedFR: nfr,
      contribution,
    });
  }
  contributions.sort((a, b) => b.contribution - a.contribution);

  // ── Time-varying series ─────────────────────────────────────────
  // Use the first non-degenerate task's series length as the canonical
  // epoch count. All series in an FRResult share the same length per
  // PR #396 shape contract.
  let epochCount = 0;
  for (const t of frResult.tasks) {
    if (t.normalizedFROverTime.length > epochCount) {
      epochCount = t.normalizedFROverTime.length;
    }
  }
  const pressureOverTime: number[] = new Array(epochCount).fill(0);
  for (let i = 0; i < epochCount; i++) {
    let acc = 0;
    let anyAtEpoch = false;
    for (const t of frResult.tasks) {
      const w = live.get(t.taskId);
      if (w === undefined) continue;
      const nfr = clamp01(t.normalizedFROverTime[i] ?? 0);
      acc += w * nfr;
      anyAtEpoch = true;
    }
    pressureOverTime[i] = anyAtEpoch ? acc : NaN;
  }

  return {
    pressure: anyContribution ? pressure : NaN,
    pressureOverTime,
    contributions,
    totalExposure: total,
    degenerateTaskCount: degenerate,
    sourceKind: frResult.sourceKind,
    traceId: frResult.traceId,
  };
}

// ─── Convenience helpers ────────────────────────────────────────────

/**
 * The peak pressure observed across the time-varying series. Useful
 * for "this trace reached Ω-FP = X at its worst point" callouts.
 * Ignores NaN entries; returns NaN if the series is all-NaN or empty.
 */
export function peakPressure(result: OmegaForgettingPressureResult): {
  value: number;
  epochIndex: number;
} {
  let peak = -Infinity;
  let epochIndex = -1;
  for (let i = 0; i < result.pressureOverTime.length; i++) {
    const v = result.pressureOverTime[i];
    if (!Number.isFinite(v)) continue;
    if (v > peak) {
      peak = v;
      epochIndex = i;
    }
  }
  if (epochIndex === -1) return { value: NaN, epochIndex: -1 };
  return { value: peak, epochIndex };
}

/**
 * The top-N tasks driving the current summary pressure, by absolute
 * contribution. `contributions` is already sorted descending, so this
 * is just a slice — convenience wrapper so callers don't have to know
 * about the ordering invariant.
 */
export function topContributors(
  result: OmegaForgettingPressureResult,
  n: number,
): TaskContribution[] {
  if (n <= 0) return [];
  return result.contributions.slice(0, n);
}
