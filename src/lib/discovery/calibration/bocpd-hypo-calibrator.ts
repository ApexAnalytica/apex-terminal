// ─── BOCPD Hypoglycemia-Event Calibration ────────────────────────────
//
// HONEST FRAMING — READ FIRST
// ----------------------------
// This is the validation methodology the Joslin proposal commits to,
// executed end-to-end on a public T1D cohort (D1NAMO). It answers the
// question: does BOCPD's per-step "P(new run started)" actually
// correlate with imminent hypoglycemic events?
//
// What it does:
//   1. For each subject, runs BOCPD on the CGM trace and gets the
//      per-step new-run probability `newRunProb[t]` (0..1).
//   2. For each timestep, defines a binary label: did glucose fall
//      below `hypoThresholdMgdl` within the next `predictionHorizonMin`
//      minutes?
//   3. Pools (score, label) pairs across all subjects.
//   4. Computes AUROC (discrimination), Brier score (calibration loss),
//      Expected Calibration Error (ECE), and a 10-bin reliability
//      diagram.
//
// This is the "calibration of each estimator's relevance score against
// trial-CRF event labels" deliverable in PR #121's reframed Joslin
// proposal — but on a public substrate so the methodology can be shown
// without waiting on a DUA.

import type { Cohort } from "../cohort-types";
import { bocpd } from "@/lib/estimators/bocpd";

export interface BocpdHypoCalibrationParams {
  /** CGM variable id in the cohort. */
  cgmVariableId: string;
  /** Hypoglycemia threshold (mg/dL). Default 70 (ADA standard). */
  hypoThresholdMgdl: number;
  /**
   * How far ahead we predict (minutes). Default 30 — the clinically
   * actionable window for a CGM-based hypo alert.
   */
  predictionHorizonMin: number;
  /**
   * Grid cadence in seconds — should match the CGM sample rate.
   * D1NAMO is 5 min = 300 s.
   */
  gridSeconds: number;
  /** BOCPD hazard rate. Default 0.01 — slow regime shifts. */
  bocpdHazard: number;
  /** Minimum subject CGM length to include. */
  minPointsPerSubject: number;
  /** Number of reliability bins. Default 10. */
  nReliabilityBins: number;
}

export const DEFAULT_PARAMS: BocpdHypoCalibrationParams = {
  cgmVariableId: "cgm_glucose_mgdl",
  hypoThresholdMgdl: 70,
  predictionHorizonMin: 30,
  gridSeconds: 300,
  bocpdHazard: 0.01,
  minPointsPerSubject: 50,
  nReliabilityBins: 10,
};

export interface ReliabilityBin {
  /** Bin lower bound (inclusive). */
  binLow: number;
  /** Bin upper bound (exclusive, except top bin). */
  binHigh: number;
  /** Mean predicted score in this bin. */
  predictedMean: number;
  /** Empirical event rate in this bin (0..1). */
  observedRate: number;
  /** Number of (score, label) pairs in this bin. */
  count: number;
}

export interface BocpdHypoCalibrationResult {
  auroc: number;
  brierScore: number;
  /** Expected calibration error — Σ (|predicted − observed| · bin_count) / N. */
  ece: number;
  reliabilityBins: ReliabilityBin[];
  /** Total (score, label) pairs across all subjects. */
  nPairs: number;
  /** Subjects that contributed at least one valid pair. */
  nSubjects: number;
  /** Empirical hypo-event prevalence in the labeled window. */
  baseRate: number;
  /** Diagnostic params + per-subject summary. */
  perSubject: { id: string; nPairs: number; nEvents: number }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────

/** Build per-subject CGM grid (sample-and-hold to uniform `gridSeconds`). */
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

/**
 * Compute AUROC via the rank-based formula:
 *   AUROC = (sum of ranks of positive class − n_pos·(n_pos+1)/2) / (n_pos · n_neg)
 * Handles ties by averaging ranks. O(n log n).
 */
function auroc(scores: number[], labels: number[]): number {
  const n = scores.length;
  if (n === 0) return 0.5;
  const idx = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => scores[a] - scores[b],
  );
  // Average ranks for ties.
  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && scores[idx[j + 1]] === scores[idx[i]]) j += 1;
    const avgRank = (i + j) / 2 + 1; // 1-based
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
  if (nPos === 0 || nNeg === 0) return 0.5; // undefined, return uninformative
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

export function calibrateBocpdHypo(
  cohort: Cohort,
  params: Partial<BocpdHypoCalibrationParams> = {},
): BocpdHypoCalibrationResult {
  const p = { ...DEFAULT_PARAMS, ...params };
  const horizonSteps = Math.max(
    1,
    Math.round((p.predictionHorizonMin * 60) / p.gridSeconds),
  );

  const allScores: number[] = [];
  const allLabels: number[] = [];
  const perSubject: { id: string; nPairs: number; nEvents: number }[] = [];
  let nSubjectsUsed = 0;

  for (const subj of cohort.subjects) {
    const grid = buildCgmGrid(
      subj.measurements,
      p.cgmVariableId,
      p.gridSeconds,
    );
    if (!grid || grid.length < p.minPointsPerSubject) {
      perSubject.push({ id: subj.id, nPairs: 0, nEvents: 0 });
      continue;
    }

    // Drop NaN tail (sample-and-hold may have a leading NaN before the
    // first reading); BOCPD requires finite values.
    const cleaned: number[] = [];
    const cleanIdxToOrig: number[] = [];
    for (let i = 0; i < grid.length; i++) {
      if (Number.isFinite(grid[i])) {
        cleaned.push(grid[i]);
        cleanIdxToOrig.push(i);
      }
    }
    if (cleaned.length < p.minPointsPerSubject) {
      perSubject.push({ id: subj.id, nPairs: 0, nEvents: 0 });
      continue;
    }

    // Run BOCPD on the cleaned series.
    const result = bocpd(cleaned, { hazard: p.bocpdHazard });
    const newRunProb = result.newRunProb;

    // For each cleaned-index t, label = 1 if any glucose value in the
    // next `horizonSteps` (also in cleaned coords) falls below threshold.
    let nPairs = 0;
    let nEvents = 0;
    for (let t = 0; t < cleaned.length - horizonSteps; t++) {
      const score = newRunProb[t];
      if (!Number.isFinite(score)) continue;
      let event = 0;
      for (let h = 1; h <= horizonSteps; h++) {
        if (cleaned[t + h] < p.hypoThresholdMgdl) {
          event = 1;
          break;
        }
      }
      allScores.push(Math.max(0, Math.min(1, score)));
      allLabels.push(event);
      nPairs += 1;
      nEvents += event;
    }

    perSubject.push({ id: subj.id, nPairs, nEvents });
    if (nPairs > 0) nSubjectsUsed += 1;
  }

  const N = allScores.length;
  const baseRate =
    N === 0 ? 0 : allLabels.reduce((a, b) => a + b, 0) / N;
  const auc = auroc(allScores, allLabels);
  const bs = brier(allScores, allLabels);
  const { bins, ece } = reliabilityDiagram(
    allScores,
    allLabels,
    p.nReliabilityBins,
  );

  return {
    auroc: auc,
    brierScore: bs,
    ece,
    reliabilityBins: bins,
    nPairs: N,
    nSubjects: nSubjectsUsed,
    baseRate,
    perSubject,
  };
}
