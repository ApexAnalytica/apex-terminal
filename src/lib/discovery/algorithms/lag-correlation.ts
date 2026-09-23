// ─── Lag-Correlation Discovery Algorithm (v0) ────────────────────────
//
// HONEST FRAMING — READ FIRST
// ----------------------------
// This is NOT PCMCI+. It's a v0 placeholder whose only job is to push
// real T1D data through the discovery pipeline end-to-end while we
// build out the real algorithm.
//
// What it does: for each ordered (X, Y) variable pair and each integer
// lag k ∈ [0, maxLag], compute Pearson correlation between X(t) and
// Y(t+k) on a per-subject regular grid, then meta-analyse across
// subjects (Fisher r-to-z), then apply Benjamini–Hochberg FDR control
// on the resulting p-values.
//
// Why this is NOT enough on its own:
//   - No conditioning sets (X→Y survives even if both depend on Z)
//   - No partial correlation, so confounders inflate edges
//   - No directionality test beyond temporal precedence (Granger-light)
//   - No nonlinear dependence (mutual information / TE)
//
// Why it's still useful as v0:
//   - It produces real edges from real data
//   - The output shape is identical to what PCMCI+ will produce
//   - Replacing this with PCMCI+ is a one-file change later
//
// VARIABLES & GRID
// ----------------
// CGM is dense (5-min cadence). Insulin and meals are sparse events.
// We resample everything to a common regular grid (`gridSeconds` param,
// default 300 s = 5 min) by:
//   - Continuous variables: sample-and-hold from the nearest prior measurement
//   - Event variables: count of events in each grid bucket
// This gives a uniformly-sampled (n_grid, n_variables) matrix per
// subject that the lag scan can run over.

import type { Cohort } from "../cohort-types";
import type { DiscoveryAlgorithm } from "../algorithm-interface";
import type { DiscoveredEdge, DiscoveryResult } from "../run-types";
import { buildSubjectGrid } from "./_cohort-data";

export interface LagCorrelationParams {
  /** Maximum lag in seconds. Default 1800 (30 min) — sane for T1D dynamics. */
  maxLagSeconds: number;
  /** Grid cadence in seconds. Default 300 (5 min) — matches CGM cadence. */
  gridSeconds: number;
  /** Two-sided FDR-adjusted p-value threshold. Default 0.05. */
  alpha: number;
  /** Minimum |correlation| to even consider as an edge candidate. */
  minAbsR: number;
  /** Minimum number of subjects an edge must appear in to count. Default 2. */
  minSubjects: number;
  /** Minimum number of grid points per subject — drop subjects shorter than this. */
  minGridPoints: number;
}

const DEFAULT_PARAMS: LagCorrelationParams = {
  maxLagSeconds: 1800,
  gridSeconds: 300,
  alpha: 0.05,
  minAbsR: 0.1,
  minSubjects: 2,
  minGridPoints: 50,
};

// ─── Helpers ──────────────────────────────────────────────────────────
//
// `buildSubjectGrid` is shared with the other contemporaneous-discovery
// algorithms and now lives in `_cohort-data.ts`.

/** Pearson correlation on aligned arrays, skipping NaN-pair entries. */
function pearson(x: Float64Array, y: Float64Array): { r: number; n: number } {
  const len = Math.min(x.length, y.length);
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < len; i++) {
    const a = x[i];
    const b = y[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    sx += a;
    sy += b;
    n += 1;
  }
  if (n < 5) return { r: 0, n };
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < len; i++) {
    const a = x[i];
    const b = y[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const da = a - mx;
    const db = b - my;
    num += da * db;
    dx2 += da * da;
    dy2 += db * db;
  }
  const denom = Math.sqrt(dx2 * dy2);
  if (denom === 0) return { r: 0, n };
  return { r: num / denom, n };
}

/** Fisher r-to-z transform. */
function rToZ(r: number): number {
  // Clamp to avoid atanh(±1) → ±∞.
  const rc = Math.max(-0.9999, Math.min(0.9999, r));
  return 0.5 * Math.log((1 + rc) / (1 - rc));
}

/**
 * Approximate two-sided p-value for a meta-analysed Fisher-z statistic.
 * Uses a normal-CDF approximation (Z-score with Var(z) = 1/(n-3)).
 */
function fisherMetaP(rs: number[], ns: number[]): { z: number; p: number } {
  let zSum = 0;
  let wSum = 0;
  for (let i = 0; i < rs.length; i++) {
    const w = Math.max(1, ns[i] - 3);
    zSum += w * rToZ(rs[i]);
    wSum += w;
  }
  if (wSum === 0) return { z: 0, p: 1 };
  const zMean = zSum / Math.sqrt(wSum); // weighted z-score under H0
  const p = 2 * (1 - normalCdf(Math.abs(zMean)));
  return { z: zMean, p };
}

/** Standard normal CDF via erfc-style approximation (Abramowitz & Stegun 26.2.17). */
function normalCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * ax);
  const y =
    1 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

/** Benjamini–Hochberg FDR control. Returns adjusted p-values. */
function bhAdjust(ps: number[]): number[] {
  const n = ps.length;
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => ps[a] - ps[b],
  );
  const adj = new Array<number>(n);
  let prev = 1;
  for (let i = n - 1; i >= 0; i--) {
    const orig = order[i];
    const rank = i + 1;
    const value = Math.min(prev, (ps[orig] * n) / rank);
    adj[orig] = value;
    prev = value;
  }
  return adj;
}

// ─── Algorithm body ───────────────────────────────────────────────────

interface LagCandidate {
  source: string;
  target: string;
  lagSteps: number; // grid units
  rs: number[];
  ns: number[];
  z: number;
  p: number;
}

export const lagCorrelationAlgorithm: DiscoveryAlgorithm<LagCorrelationParams> = {
  id: "lag-correlation",
  version: "0.1.0",
  description:
    "v0 placeholder: Pearson correlation X(t) vs Y(t+k) per subject, " +
    "Fisher meta-analysed across subjects, BH-FDR controlled. Replace " +
    "with PCMCI+ once that ports.",
  defaultParams: DEFAULT_PARAMS,

  run(cohort: Cohort, params?: Partial<LagCorrelationParams>): DiscoveryResult {
    const p = { ...this.defaultParams, ...params };

    // 1. Build per-subject regular grids.
    const variables = cohort.variables;
    const varIds = variables.map((v) => v.id);
    const subjectGrids: Float64Array[][] = [];
    for (const subj of cohort.subjects) {
      const grid = buildSubjectGrid(
        subj,
        variables,
        p.gridSeconds,
        p.minGridPoints,
      );
      if (grid) subjectGrids.push(grid);
    }

    if (subjectGrids.length < p.minSubjects) {
      return {
        variables: varIds,
        edges: [],
        diagnostics: {
          reason: "fewer than minSubjects subjects had enough grid points",
          minSubjects: p.minSubjects,
          gridSubjects: subjectGrids.length,
        },
      };
    }

    // 2. Scan every (source, target, lag) candidate. Skip ALL self-edges
    //    — at lag=0 they are trivially r=1, and at k>0 they're just
    //    autocorrelation (a property of any continuous time series, not
    //    discovered structure).
    const maxLagSteps = Math.floor(p.maxLagSeconds / p.gridSeconds);
    const candidates: LagCandidate[] = [];
    for (let i = 0; i < varIds.length; i++) {
      for (let j = 0; j < varIds.length; j++) {
        if (i === j) continue;
        for (let k = 0; k <= maxLagSteps; k++) {
          const rs: number[] = [];
          const ns: number[] = [];
          for (const grid of subjectGrids) {
            const x = grid[i];
            const y = grid[j];
            // Lag the target: align x[0..N-k] with y[k..N].
            const len = x.length - k;
            if (len < p.minGridPoints) continue;
            const xView = x.subarray(0, len);
            const yView = y.subarray(k, k + len);
            const { r, n } = pearson(xView, yView);
            if (n >= 5 && Number.isFinite(r)) {
              rs.push(r);
              ns.push(n);
            }
          }
          if (rs.length < p.minSubjects) continue;
          const meanAbsR =
            rs.reduce((a, b) => a + Math.abs(b), 0) / rs.length;
          if (meanAbsR < p.minAbsR) continue;
          const { z, p: pVal } = fisherMetaP(rs, ns);
          candidates.push({
            source: varIds[i],
            target: varIds[j],
            lagSteps: k,
            rs,
            ns,
            z,
            p: pVal,
          });
        }
      }
    }

    // 3. BH-FDR adjust.
    const ps = candidates.map((c) => c.p);
    const adjPs = bhAdjust(ps);

    // 4. Emit edges that pass the FDR threshold.
    const edges: DiscoveredEdge[] = [];
    for (let idx = 0; idx < candidates.length; idx++) {
      if (adjPs[idx] > p.alpha) continue;
      const c = candidates[idx];
      const meanR = c.rs.reduce((a, b) => a + b, 0) / c.rs.length;
      edges.push({
        source: c.source,
        target: c.target,
        lag: c.lagSteps * p.gridSeconds,
        strength: meanR,
        pValue: adjPs[idx],
        evidence:
          `Fisher meta r=${meanR.toFixed(3)} across ${c.rs.length} subjects ` +
          `at lag ${c.lagSteps * p.gridSeconds}s; BH-adjusted p=${adjPs[idx].toExponential(2)}.`,
      });
    }

    // Sort by strongest |strength| then lowest p.
    edges.sort((a, b) => {
      const ds = Math.abs(b.strength) - Math.abs(a.strength);
      return ds !== 0 ? ds : (a.pValue ?? 1) - (b.pValue ?? 1);
    });

    return {
      variables: varIds,
      edges,
      diagnostics: {
        nSubjectsUsed: subjectGrids.length,
        nCandidates: candidates.length,
        nEdgesAfterFDR: edges.length,
        params: p,
      },
    };
  },
};
