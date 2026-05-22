// ─── Discovery — FR (Forgetting Rate) Estimator ──────────────────────
//
// Phase 3 PR 3 of the Ghauri 2025 dissertation integration. Reads a
// TrainingTrace (from PR #380) and computes per-task Forgetting Rate
// values — how much accuracy on Task A was lost after training shifted
// away from it.
//
// Why this matters for AI Safety: the dissertation's Ch. 8 catastrophic-
// forgetting analysis argues that some attack classes (Heartbleed is
// the archetype) get forgotten dramatically faster than others when
// the curriculum shifts. FR is the per-task scalar that surfaces that
// asymmetry — a high FR on Heartbleed = "the IDS just stopped catching
// this attack class because training moved to DDoS."
//
// DOMAIN GATING
// -------------
// AI-domain only in SEMANTICS. The function signature is profile-
// agnostic — same pattern as `computeBESTemporal` from PR #385 — and
// gating happens upstream in the UI (PR 4 will only render FR on
// AI_SAFETY_PROFILE). Geopolitical / T1D / other domains never invoke
// this; their R-pillar still comes from Pearl-counterfactual recovery.
//
// PROVENANCE
// ----------
// The result forwards `source.kind` from the input trace verbatim.
// UI surfaces displaying values derived from a synthetic result MUST
// render a SYNTHETIC badge (preserving the contract from PR #380).
//
// FORMULAS
// --------
// For each task k tracked in the trace:
//
//   peakAccuracy_k       = max_t acc_{t, k}
//   peakEpoch_k          = argmax_t acc_{t, k}
//   finalAccuracy_k      = acc_{final, k}
//   lastTrainedEpoch_k   = max_{t : k ∈ activeTaskIds_t} t  (or -1 if never)
//   absoluteForgetting_k = peakAccuracy_k − finalAccuracy_k         (≥ 0)
//   normalizedFR_k       = absoluteForgetting_k / peakAccuracy_k    (∈ [0, 1])
//
// And the time-varying signal that PR 4 reads to compute Ω-Forgetting
// Pressure:
//
//   FR_k(t)            = max_{s ≤ t} acc_{s, k} − acc_{t, k}
//   normalizedFR_k(t)  = FR_k(t) / max_{s ≤ t} acc_{s, k}    (or 0 when peak=0)
//
// Plus the empirical decay rate λ, fit on the post-peak window via
// least-squares regression on log-residuals:
//
//   acc(t) − baseline = (peak − baseline) · exp(−λ · (t − peakEpoch))
//   ⇒ log((acc(t) − baseline) / (peak − baseline)) = −λ · (t − peakEpoch)
//
// Linear regression on (t − peakEpoch, −log(...)) gives slope λ. Used
// to verify the dissertation's synthetic-archetype tests (a trace
// built with `forgettingRate: 0.30` should yield decayRate ≈ 0.30).
// Returns NaN when there are fewer than 2 valid post-peak points
// (insufficient data) or the task never decayed below peak (no
// forgetting to fit).

import type { TrainingTrace } from "./training-trace-types";

export interface FRTaskResult {
  taskId: string;
  /** Highest accuracy observed for this task across the full trace. */
  peakAccuracy: number;
  /** Epoch index at which peakAccuracy was reached. */
  peakEpoch: number;
  /** Accuracy at the trace's final epoch. */
  finalAccuracy: number;
  /**
   * Last epoch this task appeared in `activeTaskIds`. -1 if the task
   * never trained — important guard: a task that never trained
   * can't be "forgotten" in any meaningful sense.
   */
  lastTrainedEpoch: number;

  /**
   * Time-varying FR. `frOverTime[i]` = peak-so-far minus accuracy at
   * epoch i. Length matches `trace.epochs.length`. Non-decreasing in
   * the trivial sense (peak-so-far never decreases, and current
   * accuracy can only re-establish a higher peak by replacing it,
   * not by lowering FR).
   */
  frOverTime: number[];
  /**
   * Time-varying normalized FR ∈ [0, 1]. `normalizedFROverTime[i]`
   * = `frOverTime[i] / peakSoFar(i)`. Zero when peakSoFar is 0
   * (no training has happened yet for this task).
   */
  normalizedFROverTime: number[];

  // ── Summary scalars ─────────────────────────────────────────────
  /** peakAccuracy − finalAccuracy. ≥ 0. */
  absoluteForgetting: number;
  /** absoluteForgetting / peakAccuracy. ∈ [0, 1]. NaN when peakAccuracy ≤ 0. */
  normalizedFR: number;
  /**
   * Empirical decay rate λ fit on the post-peak window.
   * `acc(t) ≈ baseline + (peak − baseline) · exp(−λ · (t − peakEpoch))`.
   * NaN when the fit is unreliable (< 2 valid post-peak points, or
   * task never decayed below peak).
   */
  decayRate: number;
}

export interface FRResult {
  tasks: FRTaskResult[];
  /** Inherited verbatim from `trace.source.kind`. SYNTHETIC-badge gate. */
  sourceKind: "synthetic" | "live";
  /** Echo of the input trace id for downstream cross-reference. */
  traceId: string;
}

export interface ComputeFROptions {
  /**
   * Baseline accuracy used in the decay-rate fit. The fit converges
   * to exp(-λ·n) only when `(acc − baseline) / (peak − baseline)`
   * stays in (0, 1]. If the caller knows the architecture's
   * pre-training baseline, pass it here per task.
   *
   * Default: each task uses the minimum accuracy seen for it across
   * the full trace as its baseline. Robust to traces where the
   * "pre-training" epoch isn't 0.
   */
  baselinePerTask?: Record<string, number>;
}

// ─── Implementation helpers ─────────────────────────────────────────

/**
 * Least-squares linear regression of y on x. Returns the slope
 * (β = Σ(x_i − x̄)(y_i − ȳ) / Σ(x_i − x̄)²). NaN when there are
 * fewer than 2 points or all x values are identical (degenerate).
 */
function linRegressionSlope(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2 || ys.length !== n) return NaN;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    num += dx * (ys[i] - meanY);
    den += dx * dx;
  }
  if (den === 0) return NaN;
  return num / den;
}

/**
 * Fit decay rate λ on a post-peak accuracy window.
 *
 *   acc(t) = baseline + (peak − baseline) · exp(−λ · (t − peakEpoch))
 *
 * Returns NaN when the fit is unreliable (insufficient data, no
 * decay, or numerical degenerate cases — accuracy below baseline at
 * every post-peak point, etc.).
 */
function fitDecayRate(
  epochs: number[],
  accs: number[],
  peakEpoch: number,
  peakAcc: number,
  baseline: number,
): number {
  if (peakAcc <= baseline) return NaN;
  const range = peakAcc - baseline;
  const xs: number[] = [];
  const negLogYs: number[] = [];
  for (let i = 0; i < epochs.length; i++) {
    const t = epochs[i];
    if (t <= peakEpoch) continue;
    const dt = t - peakEpoch;
    const y = (accs[i] - baseline) / range;
    if (y <= 0 || y > 1) continue; // out of the model's valid range
    xs.push(dt);
    negLogYs.push(-Math.log(y));
  }
  return linRegressionSlope(xs, negLogYs);
}

// ─── Main entry point ───────────────────────────────────────────────

/**
 * Compute per-task FR values from a TrainingTrace. AI-domain semantics
 * (gating happens upstream); profile-agnostic at the function level.
 *
 * Throws on empty trace — the caller should validate upstream via
 * `validateTrainingTrace` before this point. Returns NaN entries
 * gracefully for tasks that never trained or never decayed.
 */
export function computeFR(
  trace: TrainingTrace,
  options: ComputeFROptions = {},
): FRResult {
  if (trace.epochs.length === 0) {
    throw new Error("computeFR: trace has zero epochs");
  }
  if (trace.tasks.length === 0) {
    throw new Error("computeFR: trace has zero tasks");
  }

  const baselineOverride = options.baselinePerTask ?? {};
  const taskResults: FRTaskResult[] = trace.tasks.map((task) => {
    // ── Walk the trace once for this task. ──────────────────────
    let peakAccuracy = -Infinity;
    let peakEpoch = -1;
    let lastTrainedEpoch = -1;
    let minAccuracy = Infinity;
    const accs: number[] = [];
    const epochIndices: number[] = [];
    const frOverTime: number[] = [];
    const normalizedFROverTime: number[] = [];
    let peakSoFar = -Infinity;

    for (const epoch of trace.epochs) {
      epochIndices.push(epoch.index);
      const entry = epoch.accuracy.find((a) => a.taskId === task.id);
      // Missing accuracy entries (shouldn't happen on validated traces
      // but we defend) treat as 0 to keep the time series length
      // consistent.
      const acc = entry?.value ?? 0;
      accs.push(acc);
      if (acc > peakAccuracy) {
        peakAccuracy = acc;
        peakEpoch = epoch.index;
      }
      if (acc < minAccuracy) minAccuracy = acc;
      if (acc > peakSoFar) peakSoFar = acc;
      const fr = Math.max(0, peakSoFar - acc);
      frOverTime.push(fr);
      normalizedFROverTime.push(peakSoFar > 0 ? fr / peakSoFar : 0);
      if (epoch.activeTaskIds.includes(task.id)) {
        lastTrainedEpoch = epoch.index;
      }
    }

    const finalAccuracy = accs[accs.length - 1];
    const absoluteForgetting = Math.max(0, peakAccuracy - finalAccuracy);
    const normalizedFR =
      peakAccuracy > 0 ? absoluteForgetting / peakAccuracy : NaN;

    // ── Decay-rate fit ─────────────────────────────────────────
    // Default baseline: minimum accuracy observed across the trace.
    // Override available per-task via options.
    const baseline = baselineOverride[task.id] ?? minAccuracy;
    const decayRate = fitDecayRate(
      epochIndices,
      accs,
      peakEpoch,
      peakAccuracy,
      baseline,
    );

    return {
      taskId: task.id,
      peakAccuracy: peakAccuracy === -Infinity ? 0 : peakAccuracy,
      peakEpoch: peakEpoch === -1 ? 0 : peakEpoch,
      finalAccuracy,
      lastTrainedEpoch,
      frOverTime,
      normalizedFROverTime,
      absoluteForgetting,
      normalizedFR,
      decayRate,
    };
  });

  return {
    tasks: taskResults,
    sourceKind: trace.source.kind,
    traceId: trace.id,
  };
}

// ─── Convenience helpers ────────────────────────────────────────────

/**
 * Rank tasks by `normalizedFR` descending. The dissertation's
 * Heartbleed-archetype is exactly the task at the top of this list:
 * highest fraction of peak accuracy lost. Useful for the
 * forgetting-pressure surface (PR 4).
 */
export function rankTasksByNormalizedFR(result: FRResult): FRTaskResult[] {
  // Sort with NaN at the end (NaN comparisons always return false).
  return [...result.tasks].sort((a, b) => {
    const an = Number.isNaN(a.normalizedFR);
    const bn = Number.isNaN(b.normalizedFR);
    if (an && bn) return 0;
    if (an) return 1;
    if (bn) return -1;
    return b.normalizedFR - a.normalizedFR;
  });
}

/**
 * Aggregate per-task FR into a single trace-level scalar — the mean
 * of `normalizedFR` across tasks that have a defined (non-NaN) value.
 * Returns NaN when no task has a defined FR (degenerate trace).
 *
 * This is NOT yet the Ω-Forgetting Pressure metric — that one weights
 * each task's FR by an exposure value (Σ exposure × FR), and exposure
 * comes from outside the trace. PR 4 builds Ω-FP on top of this.
 */
export function meanNormalizedFR(result: FRResult): number {
  let sum = 0;
  let count = 0;
  for (const t of result.tasks) {
    if (!Number.isNaN(t.normalizedFR)) {
      sum += t.normalizedFR;
      count++;
    }
  }
  return count === 0 ? NaN : sum / count;
}
