// ─── CSD-Fit-Quality Hypoglycemia Calibration on D1NAMO ──────────────
//
// HONEST FRAMING — READ FIRST
// ----------------------------
// This validates the **F sub-score** of the F·E·G·S·M relevance composite
// — the out-of-sample one-step fit quality of an AR(1) (CSD's underlying
// model) against per-window labels of "did glucose fall below threshold
// in the next N minutes?"
//
// Why F-only and not full F·E·G·S·M:
//   D1NAMO is single-subject CGM. The F·E·G·S·M composite was designed
//   for graph-coupled multi-node systems. On single-subject CGM:
//
//     F  fully applicable — AR(1) fit on a CGM window is a real test.
//     E  partial — Akaike across a single-model set degenerates.
//     G  partial — CSD's variance/autocorr trend gates apply, but the
//        spectral term needs a graph's λmax (degenerate here).
//     S  degenerate — there's no edge graph; only the n-of-points axis
//        of trajectory sufficiency applies.
//     M  fully degenerate — no multi-node graph means M ≡ 1.0.
//
// So: this is the F-on-D1NAMO calibration. Fuller F·E·G·S·M validation
// requires a multi-subject-graph cohort like nPOD. We say so explicitly
// in the algorithm's `id` and in the diagnostics' `validatedSubScores`.
//
// What it does:
//   1. For each subject, slides a window of length `windowSize` across
//      the CGM grid.
//   2. At each window, fits an AR(1) (= CSD's model) on the leading
//      part, holds out the trailing 20%, computes the held-out NRMSE
//      and maps to F = exp(−NRMSE) — exactly the same `outOfSampleFit`
//      from `pareto-relevance.ts` we ship in the UI.
//   3. Optionally also computes the bootstrap CI half-width for that
//      window via `bootstrapOutOfSampleFit`.
//   4. Defines a binary label: did glucose fall below `hypoThresholdMgdl`
//      within the next `predictionHorizonMin` minutes from the end of
//      the window?
//   5. Pools (F, label) pairs across all subjects.
//   6. Computes AUROC, Brier score, ECE, and a 10-bin reliability diagram.
//
// Two scoring directions worth measuring:
//   - "high F predicts hypo" — does well-fitting CSD precede events?
//     Doesn't have an obvious mechanism; mostly a sanity check.
//   - "low F predicts hypo" — does CSD-fit-collapse precede events?
//     This is the regime-shift hypothesis: AR(1) stops describing the
//     trace as the system approaches a tipping point.
//
// The calibrator computes BOTH AUROCs (high-F-predicts and 1−F-predicts)
// so the result reads as "F is informative in direction X with AUROC Y."

import type { Cohort } from "../cohort-types";
import {
  PARETO_RELEVANCE_CONSTANTS,
  outOfSampleFit,
} from "@/lib/pareto-relevance";
import {
  bootstrapOutOfSampleFit,
  seededRng,
} from "@/lib/pareto-relevance-bootstrap";

const PR = PARETO_RELEVANCE_CONSTANTS;

export interface CsdFitHypoCalibrationParams {
  /** CGM variable id in the cohort. */
  cgmVariableId: string;
  /** Hypoglycemia threshold (mg/dL). Default 70 (ADA standard). */
  hypoThresholdMgdl: number;
  /**
   * How far ahead we predict (minutes). Default 30 — clinically actionable
   * window for a CGM-based hypo alert.
   */
  predictionHorizonMin: number;
  /** Grid cadence in seconds — should match CGM sample rate (D1NAMO 5min = 300). */
  gridSeconds: number;
  /**
   * Sliding window size in points used to fit the AR(1) and compute F.
   * Default 24 = 2 hours at 5-min cadence — enough for a stable AR(1) fit
   * with a 5-point holdout (24 · 0.2 ≈ 5).
   */
  windowSize: number;
  /** Minimum subject CGM length to include. */
  minPointsPerSubject: number;
  /** Number of reliability bins. Default 10. */
  nReliabilityBins: number;
  /** Bootstrap samples per window for CI half-width. 0 disables bootstrap. */
  bootstrapSamples: number;
  /** Bootstrap confidence level. Default 0.9. */
  bootstrapLevel: number;
  /** Seed for the bootstrap RNG. */
  bootstrapSeed: number;
}

export const DEFAULT_PARAMS: CsdFitHypoCalibrationParams = {
  cgmVariableId: "cgm_glucose_mgdl",
  hypoThresholdMgdl: 70,
  predictionHorizonMin: 30,
  gridSeconds: 300,
  windowSize: 24,
  minPointsPerSubject: 50,
  nReliabilityBins: 10,
  bootstrapSamples: 100,
  bootstrapLevel: 0.9,
  bootstrapSeed: 0xa9e7c5,
};

export interface ReliabilityBin {
  binLow: number;
  binHigh: number;
  predictedMean: number;
  observedRate: number;
  count: number;
}

export interface CsdFitHypoCalibrationResult {
  /** AUROC of F directly predicting hypo (high F → event). */
  aurocFitHigh: number;
  /** AUROC of (1 − F) predicting hypo (fit collapse → event). */
  aurocFitLow: number;
  /** Brier of F vs label (treats F as P(event)). */
  brierScore: number;
  /** ECE of F as predictor. */
  ece: number;
  /** Reliability bins on F. */
  reliabilityBins: ReliabilityBin[];
  /**
   * Mean bootstrap CI half-width on F across all (subject, window) pairs.
   * Larger = noisier per-window F estimate. Reported as a sanity check on
   * the bootstrap CI we ship in the UI; its value here is an empirical
   * "what does the band typically look like on real CGM" number.
   */
  meanCiHalfWidth: number;
  nPairs: number;
  nSubjects: number;
  /** Empirical hypo-event prevalence in the labelled window. */
  baseRate: number;
  /** Per-subject summary. */
  perSubject: { id: string; nPairs: number; nEvents: number; meanF: number }[];
  /** Which sub-scores of F·E·G·S·M this run validates. */
  validatedSubScores: string[];
  /** Sub-scores that are degenerate on this substrate (single-subject CGM). */
  degenerateSubScores: string[];
}

// ─── AR(1) helpers ────────────────────────────────────────────────────

/**
 * Fit AR(1) on the first `n − holdout` points and produce a one-step
 * prediction series of the same length as `obs`. The training portion
 * of the prediction is the AR(1) one-step-ahead prediction at each t;
 * the holdout portion uses the same fitted (α, μ) extrapolated from
 * obs[t-1]. Returns null if the input has zero variance (AR(1) undefined).
 */
function arOneFitAndPredict(
  obs: ReadonlyArray<number>,
  holdoutStart: number,
): number[] | null {
  const n = obs.length;
  // Fit on obs[0..holdoutStart) — slope α and intercept μ via OLS.
  let xMean = 0;
  let yMean = 0;
  let nFit = 0;
  for (let t = 1; t < holdoutStart; t++) {
    xMean += obs[t - 1];
    yMean += obs[t];
    nFit += 1;
  }
  if (nFit < 2) return null;
  xMean /= nFit;
  yMean /= nFit;
  let num = 0;
  let den = 0;
  for (let t = 1; t < holdoutStart; t++) {
    const dx = obs[t - 1] - xMean;
    num += dx * (obs[t] - yMean);
    den += dx * dx;
  }
  if (den <= 0) return null;
  const alpha = num / den;
  const mu = yMean - alpha * xMean;

  const pred = new Array<number>(n);
  pred[0] = obs[0]; // no model at t=0
  for (let t = 1; t < n; t++) {
    pred[t] = alpha * obs[t - 1] + mu;
  }
  return pred;
}

// ─── CGM grid (same logic as BOCPD calibrator) ───────────────────────

function buildCgmGrid(
  measurements: { variableId: string; t: number; value: number | string }[],
  variableId: string,
  gridSeconds: number,
): Float64Array | null {
  const events: { t: number; value: number }[] = [];
  for (const m of measurements) {
    if (m.variableId !== variableId) continue;
    const v = typeof m.value === "number" ? m.value : Number(m.value);
    if (!Number.isFinite(v)) continue;
    events.push({ t: m.t, value: v });
  }
  if (events.length < 2) return null;
  events.sort((a, b) => a.t - b.t);
  const tMin = events[0].t;
  const tMax = events[events.length - 1].t;
  const span = tMax - tMin;
  const nGrid = Math.floor(span / gridSeconds);
  if (nGrid < 2) return null;

  const out = new Float64Array(nGrid);
  let cursor = 0;
  let lastVal = NaN;
  for (let i = 0; i < nGrid; i++) {
    const tCenter = tMin + (i + 0.5) * gridSeconds;
    while (cursor < events.length && events[cursor].t <= tCenter) {
      lastVal = events[cursor].value;
      cursor += 1;
    }
    out[i] = lastVal;
  }
  return out;
}

// ─── Metrics (same shape as BOCPD calibrator) ────────────────────────

function auroc(scores: number[], labels: number[]): number {
  const n = scores.length;
  if (n === 0) return 0.5;
  const idx = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => scores[a] - scores[b],
  );
  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && scores[idx[j + 1]] === scores[idx[i]]) j += 1;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[idx[k]] = avgRank;
    i = j + 1;
  }
  let sumPos = 0;
  let nPos = 0;
  let nNeg = 0;
  for (let k = 0; k < n; k++) {
    if (labels[k] === 1) {
      sumPos += ranks[k];
      nPos += 1;
    } else {
      nNeg += 1;
    }
  }
  if (nPos === 0 || nNeg === 0) return 0.5;
  return (sumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

function brier(scores: number[], labels: number[]): number {
  if (scores.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < scores.length; i++) {
    const d = scores[i] - labels[i];
    s += d * d;
  }
  return s / scores.length;
}

function reliabilityDiagram(
  scores: number[],
  labels: number[],
  nBins: number,
): { bins: ReliabilityBin[]; ece: number } {
  const bins: ReliabilityBin[] = [];
  for (let b = 0; b < nBins; b++) {
    const lo = b / nBins;
    const hi = (b + 1) / nBins;
    let predSum = 0;
    let obsSum = 0;
    let count = 0;
    for (let i = 0; i < scores.length; i++) {
      const s = scores[i];
      const inBin = b === nBins - 1
        ? s >= lo && s <= hi
        : s >= lo && s < hi;
      if (!inBin) continue;
      predSum += s;
      obsSum += labels[i];
      count += 1;
    }
    bins.push({
      binLow: lo,
      binHigh: hi,
      predictedMean: count === 0 ? (lo + hi) / 2 : predSum / count,
      observedRate: count === 0 ? 0 : obsSum / count,
      count,
    });
  }
  const N = scores.length;
  let ece = 0;
  for (const b of bins) {
    if (b.count === 0 || N === 0) continue;
    ece += (b.count / N) * Math.abs(b.predictedMean - b.observedRate);
  }
  return { bins, ece };
}

// ─── Calibrator entry point ──────────────────────────────────────────

export function calibrateCsdFitHypo(
  cohort: Cohort,
  params: Partial<CsdFitHypoCalibrationParams> = {},
): CsdFitHypoCalibrationResult {
  const p = { ...DEFAULT_PARAMS, ...params };
  const horizonSteps = Math.max(
    1,
    Math.round((p.predictionHorizonMin * 60) / p.gridSeconds),
  );
  const holdoutFrac = PR.HOLDOUT_FRACTION;

  const allF: number[] = [];
  const allLabels: number[] = [];
  const allCiHalfWidths: number[] = [];
  const perSubject: {
    id: string;
    nPairs: number;
    nEvents: number;
    meanF: number;
  }[] = [];
  let nSubjectsUsed = 0;

  for (const subj of cohort.subjects) {
    const grid = buildCgmGrid(
      subj.measurements,
      p.cgmVariableId,
      p.gridSeconds,
    );
    if (!grid || grid.length < p.minPointsPerSubject) {
      perSubject.push({ id: subj.id, nPairs: 0, nEvents: 0, meanF: 0 });
      continue;
    }
    // Drop NaN tails (sample-and-hold may leave a leading NaN).
    const cleaned: number[] = [];
    for (let i = 0; i < grid.length; i++) {
      if (Number.isFinite(grid[i])) cleaned.push(grid[i]);
    }
    if (cleaned.length < p.windowSize + horizonSteps + 1) {
      perSubject.push({ id: subj.id, nPairs: 0, nEvents: 0, meanF: 0 });
      continue;
    }

    let nPairs = 0;
    let nEvents = 0;
    let fSum = 0;
    // Sliding window of length `windowSize` ending at `wEnd` (exclusive).
    // Label is determined by the next `horizonSteps` after wEnd.
    for (let wEnd = p.windowSize; wEnd + horizonSteps <= cleaned.length; wEnd++) {
      const window = cleaned.slice(wEnd - p.windowSize, wEnd);
      const holdoutStart = Math.floor(window.length * (1 - holdoutFrac));
      if (holdoutStart < 2 || holdoutStart >= window.length) continue;

      const pred = arOneFitAndPredict(window, holdoutStart);
      if (!pred) continue;

      // F via the same `outOfSampleFit` we ship.
      const fit = outOfSampleFit(window, pred);
      if (!Number.isFinite(fit.score)) continue;

      // Bootstrap CI (point-estimate path is identical to fit.score).
      let halfWidth = NaN;
      if (p.bootstrapSamples > 0) {
        const boot = bootstrapOutOfSampleFit(window, pred, {
          samples: p.bootstrapSamples,
          level: p.bootstrapLevel,
          rng: seededRng(p.bootstrapSeed + wEnd),
        });
        halfWidth = (boot.ci.high - boot.ci.low) / 2;
      }

      // Label: any glucose < threshold in the next `horizonSteps`.
      let event = 0;
      for (let h = 1; h <= horizonSteps; h++) {
        if (cleaned[wEnd + h - 1] < p.hypoThresholdMgdl) {
          event = 1;
          break;
        }
      }

      allF.push(fit.score);
      allLabels.push(event);
      if (Number.isFinite(halfWidth)) allCiHalfWidths.push(halfWidth);
      fSum += fit.score;
      nPairs += 1;
      nEvents += event;
    }

    perSubject.push({
      id: subj.id,
      nPairs,
      nEvents,
      meanF: nPairs === 0 ? 0 : fSum / nPairs,
    });
    if (nPairs > 0) nSubjectsUsed += 1;
  }

  const N = allF.length;
  const baseRate =
    N === 0 ? 0 : allLabels.reduce((a, b) => a + b, 0) / N;
  const aurocHigh = auroc(allF, allLabels);
  // For "low F predicts hypo" we negate the score. AUROC is rank-based, so
  // AUROC(−F, label) = 1 − AUROC(F, label) when there are no ties; we
  // recompute via the negated score to handle ties correctly.
  const aurocLow = auroc(allF.map((v) => -v), allLabels);
  const bs = brier(allF, allLabels);
  const { bins, ece } = reliabilityDiagram(allF, allLabels, p.nReliabilityBins);
  const meanCiHalfWidth =
    allCiHalfWidths.length === 0
      ? 0
      : allCiHalfWidths.reduce((a, b) => a + b, 0) / allCiHalfWidths.length;

  return {
    aurocFitHigh: aurocHigh,
    aurocFitLow: aurocLow,
    brierScore: bs,
    ece,
    reliabilityBins: bins,
    meanCiHalfWidth,
    nPairs: N,
    nSubjects: nSubjectsUsed,
    baseRate,
    perSubject,
    validatedSubScores: ["F", "F-bootstrap-CI"],
    degenerateSubScores: ["E", "G-spectral", "S-edges", "M"],
  };
}
