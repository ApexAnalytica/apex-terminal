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
//   3. Inner loop: L-BFGS quasi-Newton minimisation of L_ρ. To make
//      the L1 term smooth, W is reparameterised as W = W⁺ − W⁻ with
//      W⁺, W⁻ ≥ 0 (the same trick the reference Python `notears`
//      package uses with scipy.optimize.minimize(method="L-BFGS-B")).
//      Under that split, λ‖W‖₁ = λ·sum(W⁺ + W⁻) is linear, the
//      objective is smooth, and the box constraint (W± ≥ 0, plus
//      diagonals pinned to zero — no self-loops) is enforced by
//      projection during line search.
//   4. Edge extraction: |W[i][j]| > edgeThreshold → emit a directed
//      edge i → j with strength = W[i][j], evidence string carrying
//      the regression coefficient.
//
// What this DOES NOT do (vs. the full implementation):
//
//   - Linear-Gaussian only. NOTEARS-MLP (Yu et al. 2019) handles
//     nonlinear via neural nets; that's a separate algorithm.
//
//   - Sortability sensitivity unaddressed. Reisach et al. (2021)
//     showed NOTEARS exploits varsortability — column ordering /
//     standardisation matters. We standardise each variable before
//     fitting (zero mean, unit variance) which is the recommended
//     mitigation.
//
//   - Contemporaneous edges only. PCMCI handles temporal-lag.

import type { Cohort } from "../cohort-types";
import type { DiscoveryAlgorithm } from "../algorithm-interface";
import type { DiscoveredEdge, DiscoveryResult } from "../run-types";
import { buildSubjectGrid } from "./_cohort-data";
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
import {
  newLBFGSHistory,
  pushHistory,
  lbfgsDirection,
  dot,
  vSub,
  vNorm,
  vAddScaled,
} from "./_lbfgs";

export interface NotearsParams {
  /** L1 regulariser on |W|. Larger → sparser graph. */
  lambda1: number;
  /** |W[i][j]| above this is emitted as a directed edge. */
  edgeThreshold: number;
  /** Max outer (augmented-Lagrangian) iterations. */
  maxOuterIter: number;
  /** Max inner (L-BFGS) iterations per outer step. */
  maxInnerIter: number;
  /** L-BFGS history size (memory). 5–20 is typical. */
  lbfgsMemory: number;
  /** Inner-loop convergence: ‖projected gradient‖ below this stops. */
  innerGradTol: number;
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
  maxInnerIter: 100,
  lbfgsMemory: 10,
  innerGradTol: 1e-5,
  hThreshold: 1e-7,
  rhoMax: 1e16,
  expTerms: 20,
  gridSeconds: 300,
  minGridPoints: 30,
};

// ─── Cohort → data matrix (shared shape with FCI / PCMCI) ────────────

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

// ─── L-BFGS-B inner loop on the (W⁺, W⁻) split ──────────────────────
//
// Variables: v ∈ ℝ^{2d²}, where the first d² entries are W⁺ (row-major)
// and the next d² are W⁻. Effective W = W⁺ − W⁻. Constraints:
//   v_i ≥ 0 for all i  (box lower bound)
//   v_i = 0 on diagonals of W⁺ and W⁻  (no self-loops)
// The diagonal pinning is implemented by clamping to 0 inside `projectBox`,
// which makes the gradient at those positions irrelevant.

function packMatrices(Wpos: Mat, Wneg: Mat): number[] {
  const d = Wpos.length;
  const v = new Array<number>(2 * d * d);
  let k = 0;
  for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) v[k++] = Wpos[i][j];
  for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) v[k++] = Wneg[i][j];
  return v;
}

function unpackW(v: number[], d: number): Mat {
  // W = Wpos − Wneg, with diagonals 0 (by box constraint).
  const W: Mat = zeros(d, d);
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d; j++) {
      if (i === j) continue;
      const ij = i * d + j;
      W[i][j] = v[ij] - v[d * d + ij];
    }
  }
  return W;
}

function projectBox(v: number[], d: number): number[] {
  const out = new Array<number>(v.length);
  for (let k = 0; k < v.length; k++) out[k] = v[k] > 0 ? v[k] : 0;
  // Pin diagonals (Wpos_ii and Wneg_ii) to 0 — no self-loops.
  for (let i = 0; i < d; i++) {
    out[i * d + i] = 0;
    out[d * d + i * d + i] = 0;
  }
  return out;
}

/** Projected (or "reduced") gradient: zero out components that are
 *  blocked by an active lower-bound constraint, and the pinned diagonals.
 *  This gives the norm we use for convergence and the direction we hand
 *  to L-BFGS — keeping the curvature update consistent with the feasible
 *  search space. */
function projectedGrad(v: number[], g: number[], d: number): number[] {
  const out = new Array<number>(g.length);
  for (let i = 0; i < g.length; i++) {
    // Active lower bound: v_i = 0 and we'd want to go further negative.
    out[i] = v[i] <= 0 && g[i] > 0 ? 0 : g[i];
  }
  for (let i = 0; i < d; i++) {
    out[i * d + i] = 0;
    out[d * d + i * d + i] = 0;
  }
  return out;
}

/** Objective + gradient in the (W⁺, W⁻) parameterisation. */
function objectiveAndGrad(
  v: number[],
  d: number,
  X: Mat,
  XtX: Mat,
  alpha: number,
  rho: number,
  params: NotearsParams,
): { f: number; g: number[]; h: number } {
  const W = unpackW(v, d);
  const mse = mseLoss(X, W);
  // L1 = sum(W⁺ + W⁻) because both are ≥ 0 ⇒ |W_ij| ≤ W⁺_ij + W⁻_ij,
  // and at the optimum at most one of W⁺_ij, W⁻_ij is non-zero.
  let l1 = 0;
  for (let k = 0; k < v.length; k++) l1 += v[k];
  const { h, grad: hG } = hAndGrad(W, params.expTerms);
  const f = mse + params.lambda1 * l1 + alpha * h + 0.5 * rho * h * h;

  // Smooth gradient w.r.t. W: ∇mse + (α + ρ·h)·∇h
  const lG = mseGrad(X, W, XtX);
  const factor = alpha + rho * h;
  const g = new Array<number>(2 * d * d);
  let k = 0;
  // W⁺ block: ∂f/∂W⁺_ij = (smooth grad)_ij + λ
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d; j++) {
      const dW = lG[i][j] + factor * hG[i][j];
      g[k++] = dW + params.lambda1;
    }
  }
  // W⁻ block: ∂f/∂W⁻_ij = -(smooth grad)_ij + λ
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d; j++) {
      const dW = lG[i][j] + factor * hG[i][j];
      g[k++] = -dW + params.lambda1;
    }
  }
  return { f, g, h };
}

/**
 * Quadratic-interpolation backtracking step. Given the values at α=0
 * (φ₀, φ'₀) and at the most-recent failed trial (α, φ(α)), returns
 * the minimiser of the parabola interpolating those three constraints:
 *
 *   q(α) = φ₀ + φ'₀·α + ((φ(α) − φ₀ − φ'₀·α) / α²) · α²
 *   q'(α*) = 0  ⟹  α* = −φ'₀·α² / (2·(φ(α) − φ₀ − φ'₀·α))
 *
 * Safeguarded into [0.1·α, 0.5·α] — if the quadratic is concave or
 * the minimiser lands outside the safeguard band, fall back to plain
 * halving. Exported for unit testing.
 */
export function quadraticInterpStep(
  phi0: number,
  dphi0: number,
  alpha: number,
  phiAlpha: number,
): number {
  const denom = 2 * (phiAlpha - phi0 - dphi0 * alpha);
  const lo = 0.1 * alpha;
  const hi = 0.5 * alpha;
  if (!Number.isFinite(denom) || denom <= 1e-20) {
    return hi; // concave or degenerate — fall back to halving
  }
  const alphaStar = (-dphi0 * alpha * alpha) / denom;
  if (!Number.isFinite(alphaStar)) return hi;
  return Math.max(lo, Math.min(hi, alphaStar));
}

/** L-BFGS-B inner loop on L_ρ(W; α) using the (W⁺, W⁻) split + projected
 *  backtracking line search with quadratic-interpolation step choice. */
function lbfgsInner(
  X: Mat,
  XtX: Mat,
  Winit: Mat,
  alpha: number,
  rho: number,
  params: NotearsParams,
): Mat {
  const d = Winit.length;
  // Initialise (W⁺, W⁻) by splitting Winit into positive/negative parts.
  const Wpos = zeros(d, d);
  const Wneg = zeros(d, d);
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d; j++) {
      if (i === j) continue;
      const w = Winit[i][j];
      if (w > 0) Wpos[i][j] = w;
      else if (w < 0) Wneg[i][j] = -w;
    }
  }
  let v = packMatrices(Wpos, Wneg);
  const hist = newLBFGSHistory(params.lbfgsMemory);

  let cur = objectiveAndGrad(v, d, X, XtX, alpha, rho, params);
  let f = cur.f;
  let g = cur.g;

  for (let iter = 0; iter < params.maxInnerIter; iter++) {
    const pg = projectedGrad(v, g, d);
    if (vNorm(pg) < params.innerGradTol) break;

    const dir = lbfgsDirection(pg, hist);
    // Sanity: if direction isn't a descent direction (numerical hiccup),
    // fall back to steepest descent on the projected gradient.
    let directionalDeriv = dot(g, dir);
    let searchDir = dir;
    if (directionalDeriv >= 0) {
      searchDir = pg.map((x) => -x);
      directionalDeriv = dot(g, searchDir);
      if (directionalDeriv >= 0) break; // truly stuck
    }

    // Projected backtracking line search with quadratic-interpolation
    // step choice. On Armijo rejection, fit the parabola through
    // (0, φ(0), φ'(0)) and (step, φ(step)) and pick its minimiser as
    // the next trial, safeguarded into [0.1·step, 0.5·step]. This is
    // the cheap variant of Moré–Thuente (1994) — same model order but
    // without the bracketing / zoom phases. For projected line search
    // it's the right trade-off: projection breaks the smoothness
    // assumption the full Wolfe conditions need, so the extra
    // bracketing machinery wouldn't pay off here.
    let step = 1.0;
    const phi0 = f;
    const dphi0 = directionalDeriv; // already = dot(g, searchDir)
    let accepted = false;
    let vNext = v;
    let fNext = f;
    let gNext = g;
    for (let ls = 0; ls < 25; ls++) {
      const trial = projectBox(vAddScaled(v, searchDir, step), d);
      const res = objectiveAndGrad(trial, d, X, XtX, alpha, rho, params);
      const diff = vSub(trial, v);
      const armijoRhs = f + 1e-4 * dot(g, diff);
      if (res.f <= armijoRhs) {
        vNext = trial;
        fNext = res.f;
        gNext = res.g;
        accepted = true;
        break;
      }
      step = quadraticInterpStep(phi0, dphi0, step, res.f);
      if (step < 1e-12) break;
    }
    if (!accepted) break; // line search failed — gradient too noisy to make progress

    // L-BFGS curvature update — only when y⁻ᵀs > 0 (positive curvature).
    const s = vSub(vNext, v);
    const y = vSub(gNext, g);
    const ys = dot(y, s);
    if (ys > 1e-10 * vNorm(s) * vNorm(y)) pushHistory(hist, s, y);

    v = vNext;
    f = fNext;
    g = gNext;
  }

  return unpackW(v, d);
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
    const Wcandidate = lbfgsInner(X, XtX, W, alpha, rho, params);
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
  version: "0.2.0",
  description:
    "NOTEARS — continuous DAG-structure learning via the smooth acyclicity constraint h(W) = tr(e^(W∘W)) − d. Linear-Gaussian model, augmented-Lagrangian outer loop, L-BFGS-B inner loop on the (W⁺, W⁻) split with projected line search. Standardises columns to mitigate varsortability.",
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
