// ─── NOTEARS — Continuous DAG-structure learning ─────────────────────
//
// HONEST FRAMING — READ FIRST
// ----------------------------
// NOTEARS (Zheng et al., NeurIPS 2018, "DAGs with NO TEARS") recasts
// causal-DAG learning as a continuous optimisation problem:
//
//     min  ½‖X − X·W‖²_F  +  λ·‖W‖_1     subject to   h(W) = 0
//      W
//
// where W is a real d×d weighted adjacency matrix and the acyclicity
// constraint is the smooth function
//
//     h(W) = tr(e^(W ∘ W)) − d
//
// (Hadamard squared, then matrix exponential, then trace minus d.)
// h(W) = 0 iff W has no cycles. Because h is smooth, the whole problem
// becomes a constrained continuous-optimisation problem solvable with
// gradient descent + an augmented-Lagrangian outer loop instead of
// combinatorial search.
//
// This is a MINIMUM-VIABLE NOTEARS. It implements:
//
//   1. Cohort → contemporaneous data matrix (same grid construction
//      used by PCMCI / FCI in this codebase).
//   2. Augmented Lagrangian outer loop:
//        L_ρ(W; α) = ½‖X − XW‖²  +  λ‖W‖_1  +  α·h(W)  +  ½ρ·h(W)²
//      Updates α += ρ·h(W); doubles ρ when h doesn't shrink fast
//      enough; terminates when |h(W)| < hThreshold or maxOuter reached.
//   3. Inner loop: proximal gradient descent on L_ρ. The smooth part
//      (MSE + augmented terms) gets a gradient step; the L1 term gets
//      soft-thresholding (the proximal operator). Diagonal pinned to
//      zero — no self-loops by construction.
//   4. Edge extraction: |W[i][j]| > edgeThreshold → emit a directed
//      edge i → j with strength = W[i][j], evidence string carrying
//      the regression coefficient.
//
// What this DOES NOT do (vs. the full implementation):
//
//   - Linear-Gaussian only. NOTEARS-MLP (Yu et al. 2019) handles
//     nonlinear via neural nets; that's a separate algorithm.
//
//   - No L-BFGS-B. The original uses scipy's L-BFGS for the inner
//     loop; this uses plain proximal gradient descent (slower
//     convergence but simpler and dependency-free). For d ≤ 30 this
//     is fine; larger d may need more inner iterations.
//
//   - Sortability sensitivity unaddressed. Reisach et al. (2021)
//     showed NOTEARS exploits varsortability — column ordering /
//     standardisation matters. We standardise each variable before
//     fitting (zero mean, unit variance) which is the recommended
//     mitigation.
//
//   - Contemporaneous edges only. PCMCI handles temporal-lag.

import type { Cohort, Subject, Variable } from "../cohort-types";
import type { DiscoveryAlgorithm } from "../algorithm-interface";
import type { DiscoveredEdge, DiscoveryResult } from "../run-types";
import {
  Mat,
  matmul,
  transpose,
  matAdd,
  hadamard,
  matExp,
  trace,
  zeros,
  scale,
} from "./_matrix-ops";

export interface NotearsParams {
  /** L1 regulariser on |W|. Larger → sparser graph. */
  lambda1: number;
  /** |W[i][j]| above this is emitted as a directed edge. */
  edgeThreshold: number;
  /** Max outer (augmented-Lagrangian) iterations. */
  maxOuterIter: number;
  /** Max inner (proximal gradient) iterations per outer step. */
  maxInnerIter: number;
  /** Initial inner learning rate. */
  innerLR: number;
  /** Outer-loop convergence: |h(W)| below this stops. */
  hThreshold: number;
  /** Cap on ρ to prevent runaway. */
  rhoMax: number;
  /** Series terms in matrix-exponential. */
  expTerms: number;
  /** Grid cadence in seconds for cohort-data resampling. */
  gridSeconds: number;
  /** Minimum grid points per subject — drop subjects shorter than this. */
  minGridPoints: number;
}

const DEFAULT_PARAMS: NotearsParams = {
  lambda1: 0.01,
  edgeThreshold: 0.3,
  maxOuterIter: 12,
  maxInnerIter: 200,
  innerLR: 0.01,
  hThreshold: 1e-7,
  rhoMax: 1e16,
  expTerms: 20,
  gridSeconds: 300,
  minGridPoints: 30,
};

// ─── Cohort → data matrix (shared shape with FCI / PCMCI) ────────────

function buildSubjectGrid(
  subject: Subject,
  variables: Variable[],
  gridSeconds: number,
  minGridPoints: number,
): Float64Array[] | null {
  if (subject.measurements.length === 0) return null;
  let tMin = Infinity;
  let tMax = -Infinity;
  for (const m of subject.measurements) {
    if (m.t < tMin) tMin = m.t;
    if (m.t > tMax) tMax = m.t;
  }
  const nGrid = Math.floor((tMax - tMin) / gridSeconds);
  if (nGrid < minGridPoints) return null;

  const byVar = new Map<string, { t: number; value: number }[]>();
  for (const v of variables) byVar.set(v.id, []);
  for (const m of subject.measurements) {
    const arr = byVar.get(m.variableId);
    if (!arr) continue;
    if (typeof m.value === "number" && Number.isFinite(m.value)) {
      arr.push({ t: m.t - tMin, value: m.value });
    }
  }

  return variables.map((v) => {
    const out = new Float64Array(nGrid);
    const events = byVar.get(v.id) ?? [];
    if (v.kind === "event" || v.kind === "binary") {
      for (const e of events) {
        const idx = Math.min(nGrid - 1, Math.max(0, Math.floor(e.t / gridSeconds)));
        out[idx] += e.value;
      }
    } else {
      events.sort((a, b) => a.t - b.t);
      let lastVal = NaN;
      let cursor = 0;
      for (let i = 0; i < nGrid; i++) {
        const tCenter = (i + 0.5) * gridSeconds;
        while (cursor < events.length && events[cursor].t <= tCenter) {
          lastVal = events[cursor].value;
          cursor += 1;
        }
        out[i] = lastVal;
      }
    }
    return out;
  });
}

/** Build the standardised contemporaneous data matrix X (N × d). */
function buildDataMatrix(
  cohort: Cohort,
  params: NotearsParams,
): { X: Mat; variableIds: string[] } | null {
  const grids: Float64Array[][] = [];
  for (const subject of cohort.subjects) {
    const grid = buildSubjectGrid(
      subject,
      cohort.variables,
      params.gridSeconds,
      params.minGridPoints,
    );
    if (grid) grids.push(grid);
  }
  if (grids.length === 0) return null;

  const variableIds = cohort.variables.map((v) => v.id);
  const d = variableIds.length;
  const Nrows: number[] = [];
  for (const grid of grids) Nrows.push(grid[0].length);
  const N = Nrows.reduce((a, b) => a + b, 0);
  if (N < 10) return null;

  const X: number[][] = Array.from({ length: N }, () => new Array<number>(d).fill(0));
  let row = 0;
  for (const grid of grids) {
    const subjectN = grid[0].length;
    for (let i = 0; i < subjectN; i++) {
      for (let v = 0; v < d; v++) X[row][v] = grid[v][i];
      row += 1;
    }
  }

  // Standardise each column: zero mean, unit variance. Mitigates
  // varsortability (Reisach et al. 2021) and stabilises the gradient.
  for (let v = 0; v < d; v++) {
    let mean = 0;
    let nFinite = 0;
    for (let i = 0; i < N; i++) {
      if (Number.isFinite(X[i][v])) {
        mean += X[i][v];
        nFinite += 1;
      }
    }
    mean = nFinite > 0 ? mean / nFinite : 0;
    let varSum = 0;
    for (let i = 0; i < N; i++) {
      const x = Number.isFinite(X[i][v]) ? X[i][v] : mean;
      varSum += (x - mean) * (x - mean);
    }
    const std = Math.sqrt(varSum / Math.max(1, N - 1));
    const denom = std < 1e-9 ? 1 : std;
    for (let i = 0; i < N; i++) {
      X[i][v] = (Number.isFinite(X[i][v]) ? X[i][v] - mean : 0) / denom;
    }
  }
  return { X, variableIds };
}

// ─── Loss / acyclicity / gradients ──────────────────────────────────

/** ∇_W ½‖X − X·W‖²_F = X^T·X·W − X^T·X. */
function mseGrad(X: Mat, W: Mat, XtX: Mat): Mat {
  const XtXW = matmul(XtX, W);
  // gradient = XtXW - XtX
  return matAdd(XtXW, XtX, -1);
}

/** ½‖X − X·W‖²_F evaluated. */
function mseLoss(X: Mat, W: Mat): number {
  const XW = matmul(X, W);
  let s = 0;
  for (let i = 0; i < X.length; i++) {
    for (let j = 0; j < X[i].length; j++) {
      const r = X[i][j] - XW[i][j];
      s += r * r;
    }
  }
  return 0.5 * s;
}

/**
 * h(W) = tr(e^(W ∘ W)) − d, plus its gradient
 * ∇h(W) = (e^(W ∘ W))^T ∘ 2W.
 */
function hAndGrad(W: Mat, expTerms: number): { h: number; grad: Mat } {
  const d = W.length;
  const M = hadamard(W, W);
  const E = matExp(M, expTerms);
  const h = trace(E) - d;
  const Et = transpose(E);
  const twoW = scale(W, 2);
  const grad = hadamard(Et, twoW);
  return { h, grad };
}

/** Element-wise soft-threshold (proximal operator for L1): sign(x)·max(0, |x|−t). */
function softThreshold(W: Mat, t: number): Mat {
  const m = W.length;
  const n = W[0].length;
  const out = zeros(m, n);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      const v = W[i][j];
      if (v > t) out[i][j] = v - t;
      else if (v < -t) out[i][j] = v + t;
      else out[i][j] = 0;
    }
  }
  return out;
}

/** Proximal-gradient inner loop minimising L_ρ(W; α). */
function innerLoop(
  X: Mat,
  XtX: Mat,
  Winit: Mat,
  alpha: number,
  rho: number,
  params: NotearsParams,
): Mat {
  let W = Winit;
  let lr = params.innerLR;
  let prevLoss = Infinity;
  for (let iter = 0; iter < params.maxInnerIter; iter++) {
    const { h, grad: hG } = hAndGrad(W, params.expTerms);
    const lG = mseGrad(X, W, XtX);
    // Smooth gradient: MSE + α·∇h + ρ·h·∇h
    const d = W.length;
    const smoothGrad: Mat = zeros(d, d);
    for (let i = 0; i < d; i++) {
      for (let j = 0; j < d; j++) {
        smoothGrad[i][j] = lG[i][j] + alpha * hG[i][j] + rho * h * hG[i][j];
      }
    }
    // Gradient step + soft-threshold for L1.
    const stepped = matAdd(W, smoothGrad, -lr);
    let next = softThreshold(stepped, lr * params.lambda1);
    // Pin diagonal to zero — no self-loops.
    for (let i = 0; i < d; i++) next[i][i] = 0;
    // Compute L_ρ at next; backtrack on increase.
    const { h: hNext } = hAndGrad(next, params.expTerms);
    const lossNext =
      mseLoss(X, next) +
      params.lambda1 * l1Norm(next) +
      alpha * hNext +
      0.5 * rho * hNext * hNext;
    if (lossNext > prevLoss && lr > 1e-6) {
      lr *= 0.5;
      continue;
    }
    W = next;
    prevLoss = lossNext;
  }
  return W;
}

function l1Norm(W: Mat): number {
  let s = 0;
  for (let i = 0; i < W.length; i++) {
    for (let j = 0; j < W[i].length; j++) s += Math.abs(W[i][j]);
  }
  return s;
}

/** Augmented-Lagrangian outer loop: NOTEARS proper. */
function notearsOuter(X: Mat, params: NotearsParams): Mat {
  const d = X[0].length;
  const Xt = transpose(X);
  const XtX = matmul(Xt, X);
  let W: Mat = zeros(d, d);
  let alpha = 0;
  let rho = 1.0;
  let hPrev = Infinity;
  for (let outer = 0; outer < params.maxOuterIter; outer++) {
    const Wcandidate = innerLoop(X, XtX, W, alpha, rho, params);
    const { h: hNew } = hAndGrad(Wcandidate, params.expTerms);
    if (Math.abs(hNew) > 0.25 * Math.abs(hPrev) && rho < params.rhoMax) {
      // h didn't shrink fast enough — bump ρ and re-run inner with same W.
      rho *= 10;
      continue;
    }
    W = Wcandidate;
    alpha += rho * hNew;
    hPrev = hNew;
    if (Math.abs(hNew) < params.hThreshold) break;
  }
  return W;
}

// ─── Algorithm export ───────────────────────────────────────────────

export const notearsAlgorithm: DiscoveryAlgorithm<NotearsParams> = {
  id: "notears",
  version: "0.1.0",
  description:
    "NOTEARS — continuous DAG-structure learning via the smooth acyclicity constraint h(W) = tr(e^(W∘W)) − d. Linear-Gaussian model, augmented-Lagrangian outer loop, proximal gradient descent inner loop with L1 sparsity. Standardises columns to mitigate varsortability.",
  defaultParams: DEFAULT_PARAMS,
  run(cohort: Cohort, paramOverrides?: Partial<NotearsParams>): DiscoveryResult {
    const params: NotearsParams = { ...DEFAULT_PARAMS, ...paramOverrides };

    const data = buildDataMatrix(cohort, params);
    if (!data) {
      return {
        variables: cohort.variables.map((v) => v.id),
        edges: [],
        diagnostics: { reason: "no subject grids met minGridPoints" },
      };
    }
    const { X, variableIds } = data;
    const W = notearsOuter(X, params);
    const { h: hFinal } = hAndGrad(W, params.expTerms);

    const edges: DiscoveredEdge[] = [];
    const d = variableIds.length;
    for (let i = 0; i < d; i++) {
      for (let j = 0; j < d; j++) {
        if (i === j) continue;
        const w = W[i][j];
        if (Math.abs(w) <= params.edgeThreshold) continue;
        edges.push({
          source: variableIds[i],
          target: variableIds[j],
          strength: w,
          evidence: `NOTEARS β=${w.toFixed(3)} (|β| > ${params.edgeThreshold} threshold; h(W)=${hFinal.toExponential(2)})`,
        });
      }
    }
    edges.sort((a, b) => {
      if (a.source !== b.source) return a.source.localeCompare(b.source);
      return a.target.localeCompare(b.target);
    });

    const diagnostics: Record<string, unknown> = {
      sampleSize: X.length,
      finalH: hFinal,
      params,
    };
    if (edges.length === 0) {
      diagnostics.reason = `no edges above |W| > ${params.edgeThreshold} threshold (data may be only lag-coupled or noise-dominated; NOTEARS models contemporaneous structure only)`;
    }
    return {
      variables: variableIds,
      edges,
      diagnostics,
    };
  },
};
