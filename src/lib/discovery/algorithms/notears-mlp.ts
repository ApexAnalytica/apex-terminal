// ─── NOTEARS-MLP — Nonlinear DAG-structure learning ──────────────────
//
// HONEST FRAMING — READ FIRST
// ----------------------------
// Yu, Chen, Gu (2019), "DAG-GNN: DAG Structure Learning with Graph
// Neural Networks" — extension of linear NOTEARS to nonlinear
// regressors. Each variable j is predicted by a tiny MLP whose inputs
// are all OTHER variables. The first-layer weight matrix's column
// norms determine the *derived adjacency* W*[i, j] = ‖W₁ⱼ[:, i]‖₂ —
// "how much does variable i influence the prediction of j". The
// acyclicity constraint h(W*) = tr(e^(W*∘W*)) − d operates on this
// derived adjacency.
//
//   min  ½‖X − X̂‖²_F  +  λ·Σⱼ ‖W₁ⱼ‖₂,₁     s.t.   h(W*) = 0
//   {W₁,W₂,b₁,b₂}
//
// where X̂[n,j] = MLP_j(X[n, except j]) and the L1-on-column-norms
// penalty drives unused input columns of each MLP to zero (giving
// sparsity in the derived adjacency).
//
// This is a MINIMUM-VIABLE NOTEARS-MLP. It implements:
//
//   1. Per-variable MLP: one hidden layer (default width 8) with
//      tanh activation, scalar output. d MLPs total. Input column j
//      pinned to zero on MLP_j by construction (no self-loops).
//   2. Manual backprop — no autodiff. ∂L/∂W₁ⱼ + ∂h/∂W₁ⱼ chained per
//      output unit, with the h-gradient derived from
//      ∂A[i,j]/∂W₁ⱼ[h,i] = W₁ⱼ[h,i] / A[i,j].
//   3. Augmented Lagrangian outer loop with the same h, ρ, α
//      schedule as linear NOTEARS.
//   4. Inner loop: projected gradient descent with Armijo backtrack
//      on the combined parameter vector. No L-BFGS yet — the
//      MLP-parameter gradient is non-quadratic enough that the
//      Hessian approximation isn't reliable; pure GD is more honest
//      for this v0.1.
//   5. Edge extraction: A[i, j] > edgeThreshold → emit i → j with
//      strength = A[i, j], evidence string carrying both the
//      derived weight and the final h(A) tolerance.
//
// What this DOES NOT do (vs. the full Yu et al. 2019 implementation):
//
//   - One hidden layer only. Deeper MLPs would catch more involved
//     nonlinearities but multiply the parameter count.
//
//   - No L-BFGS on the MLP parameters. Plain projected GD with
//     Armijo backtrack — slower but more robust for the non-quadratic
//     objective.
//
//   - Contemporaneous edges only. PCMCI handles temporal lag.
//
//   - Same varsortability sensitivity as linear NOTEARS — column
//     standardisation mitigates it but doesn't eliminate.

import type { Cohort } from "../cohort-types";
import type { DiscoveryAlgorithm } from "../algorithm-interface";
import type { DiscoveredEdge, DiscoveryResult } from "../run-types";
import { Mat, matExp, trace, zeros } from "./_matrix-ops";
import { buildSubjectGrid } from "./_cohort-data";

export interface NotearsMlpParams {
  /** Hidden-layer width per MLP. Default 8. */
  hiddenSize: number;
  /** L1-on-column-norms regulariser. Larger → sparser derived adjacency. */
  lambda1: number;
  /** A[i, j] above this is emitted as a directed edge. */
  edgeThreshold: number;
  /** Augmented-Lagrangian outer iterations. */
  maxOuterIter: number;
  /** Gradient-descent inner iterations per outer step. */
  maxInnerIter: number;
  /** Initial inner-loop learning rate. Adapts via Armijo backtrack. */
  innerLR: number;
  /** Outer-loop convergence: |h(A)| below this stops. */
  hThreshold: number;
  /** Cap on ρ to prevent runaway. */
  rhoMax: number;
  /** Series terms in the matrix-exponential acyclicity constraint. */
  expTerms: number;
  /** Grid cadence in seconds for cohort-data resampling. */
  gridSeconds: number;
  /** Minimum grid points per subject — drop subjects shorter than this. */
  minGridPoints: number;
  /** Initial-weight scale (Xavier-like). 0.5 / sqrt(d) is a reasonable default. */
  initScale: number;
}

const DEFAULT_PARAMS: NotearsMlpParams = {
  hiddenSize: 8,
  lambda1: 0.01,
  edgeThreshold: 0.3,
  maxOuterIter: 8,
  maxInnerIter: 100,
  innerLR: 0.05,
  hThreshold: 1e-7,
  rhoMax: 1e16,
  expTerms: 20,
  gridSeconds: 300,
  minGridPoints: 30,
  initScale: 0,
};

// ─── Cohort → contemporaneous data matrix ────────────────────────────
//
// Inlined version (mirrors notears.ts / fci.ts / pcmci.ts). DRY across
// algorithms is a deferred refactor — each algorithm currently owns its
// own resampling so per-algorithm grid params can drift independently.

function buildDataMatrix(
  cohort: Cohort,
  params: NotearsMlpParams,
): { X: number[][]; variableIds: string[] } | null {
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

  // Standardise columns — Reisach et al. 2021 varsortability mitigation.
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

// ─── Per-variable MLP ─────────────────────────────────────────────────
//
// MLP_j: R^d → R. Input column j is pinned to zero (no self-prediction).
// Hidden = tanh(W1 · x + b1); output = W2 · hidden + b2.

interface PerVarMLP {
  /** Hidden × d. Column j is pinned to 0. */
  W1: number[][];
  /** Hidden. */
  b1: number[];
  /** Hidden. */
  W2: number[];
  /** Scalar. */
  b2: number;
}

function initMLP(d: number, hidden: number, pinnedInput: number, scale: number): PerVarMLP {
  // Deterministic init — small uniform values scaled by 1/√d (Xavier-ish)
  // so the optimiser doesn't have to fight randomness. A real impl would
  // seed an RNG; for v0.1 we use a position-derived value.
  const s = scale > 0 ? scale : 1 / Math.sqrt(Math.max(1, d));
  const W1: number[][] = Array.from({ length: hidden }, (_, h) =>
    Array.from({ length: d }, (_, i) => {
      if (i === pinnedInput) return 0;
      return ((((h * 131) + i * 17) % 1000) / 1000 - 0.5) * 2 * s;
    }),
  );
  const b1 = new Array<number>(hidden).fill(0);
  const W2 = Array.from({ length: hidden }, (_, h) => (((h * 31) % 100) / 100 - 0.5) * s);
  return { W1, b1, W2, b2: 0 };
}

/** Forward + cache for backprop. */
function mlpForward(mlp: PerVarMLP, x: number[]): { z: number[]; a: number[]; y: number } {
  const H = mlp.b1.length;
  const z = new Array<number>(H); // pre-activation
  const a = new Array<number>(H); // post-activation (tanh)
  for (let h = 0; h < H; h++) {
    let s = mlp.b1[h];
    const row = mlp.W1[h];
    for (let i = 0; i < x.length; i++) s += row[i] * x[i];
    z[h] = s;
    a[h] = Math.tanh(s);
  }
  let y = mlp.b2;
  for (let h = 0; h < H; h++) y += mlp.W2[h] * a[h];
  return { z, a, y };
}

// ─── Derived adjacency: A[i, j] = ‖W₁ⱼ[:, i]‖₂ ────────────────────────

function derivedAdjacency(mlps: PerVarMLP[]): Mat {
  const d = mlps.length;
  const A = zeros(d, d);
  for (let j = 0; j < d; j++) {
    const W1 = mlps[j].W1;
    const H = W1.length;
    for (let i = 0; i < d; i++) {
      if (i === j) continue;
      let sq = 0;
      for (let h = 0; h < H; h++) sq += W1[h][i] * W1[h][i];
      A[i][j] = Math.sqrt(sq);
    }
  }
  return A;
}

// ─── Acyclicity: h(A) = tr(e^(A∘A)) − d ──────────────────────────────

function hAndGradOnAdj(A: Mat, expTerms: number): { h: number; gradA: Mat } {
  const d = A.length;
  // M = A ∘ A (Hadamard square)
  const M = zeros(d, d);
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d; j++) M[i][j] = A[i][j] * A[i][j];
  }
  const E = matExp(M, expTerms);
  const h = trace(E) - d;
  // ∂h/∂A_ij = (E^T)_ij · 2A_ij
  const gradA = zeros(d, d);
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d; j++) {
      gradA[i][j] = 2 * A[i][j] * E[j][i];
    }
  }
  return { h, gradA };
}

// ─── Objective + gradient ────────────────────────────────────────────
//
// L_ρ = ½‖X − X̂‖²  +  λ·Σⱼ Σᵢ ‖W₁ⱼ[:, i]‖₂  +  α·h(A)  +  ½ρ·h(A)²

interface MlpGrads {
  dW1: number[][]; // hidden × d
  db1: number[];
  dW2: number[];
  db2: number;
}

function zeroGrads(d: number, hidden: number): MlpGrads {
  return {
    dW1: Array.from({ length: hidden }, () => new Array<number>(d).fill(0)),
    db1: new Array<number>(hidden).fill(0),
    dW2: new Array<number>(hidden).fill(0),
    db2: 0,
  };
}

function objectiveAndGrad(
  X: number[][],
  mlps: PerVarMLP[],
  alpha: number,
  rho: number,
  params: NotearsMlpParams,
): { f: number; grads: MlpGrads[]; h: number } {
  const N = X.length;
  const d = mlps.length;
  const H = params.hiddenSize;

  let mse = 0;
  // Accumulate MSE gradient onto MLP parameters via backprop.
  const grads = Array.from({ length: d }, () => zeroGrads(d, H));
  for (let n = 0; n < N; n++) {
    const xn = X[n];
    for (let j = 0; j < d; j++) {
      const mlp = mlps[j];
      const { a, y } = mlpForward(mlp, xn);
      const residual = y - xn[j];
      mse += 0.5 * residual * residual;
      // dL/dy = residual
      grads[j].db2 += residual;
      for (let h = 0; h < H; h++) {
        grads[j].dW2[h] += residual * a[h];
        const dz = residual * mlp.W2[h] * (1 - a[h] * a[h]); // tanh'(z) = 1 - a²
        grads[j].db1[h] += dz;
        const row = grads[j].dW1[h];
        for (let i = 0; i < d; i++) {
          if (i === j) continue; // pinned input column
          row[i] += dz * xn[i];
        }
      }
    }
  }

  // L1-on-column-norms: λ · Σⱼ Σᵢ A[i, j]. d/dW1_j[h, i] = λ · W1_j[h, i] / A[i, j]
  let l1 = 0;
  for (let j = 0; j < d; j++) {
    const W1 = mlps[j].W1;
    for (let i = 0; i < d; i++) {
      if (i === j) continue;
      let sq = 0;
      for (let h = 0; h < H; h++) sq += W1[h][i] * W1[h][i];
      const colNorm = Math.sqrt(sq);
      l1 += colNorm;
      if (colNorm > 1e-12) {
        for (let h = 0; h < H; h++) {
          grads[j].dW1[h][i] += params.lambda1 * W1[h][i] / colNorm;
        }
      }
    }
  }

  // Acyclicity contribution. h on derived adjacency A; per-W1 gradient
  // chains through A[i, j] = ‖W₁ⱼ[:, i]‖₂.
  const A = derivedAdjacency(mlps);
  const { h: hVal, gradA } = hAndGradOnAdj(A, params.expTerms);
  const factor = alpha + rho * hVal;
  for (let j = 0; j < d; j++) {
    const W1 = mlps[j].W1;
    for (let i = 0; i < d; i++) {
      if (i === j) continue;
      const a_ij = A[i][j];
      if (a_ij < 1e-12) continue;
      const partial = factor * gradA[i][j] / a_ij;
      for (let h = 0; h < H; h++) {
        grads[j].dW1[h][i] += partial * W1[h][i];
      }
    }
  }

  const f = mse + params.lambda1 * l1 + alpha * hVal + 0.5 * rho * hVal * hVal;
  return { f, grads, h: hVal };
}

// ─── Inner-loop GD with Armijo backtrack ──────────────────────────────

function cloneMLPs(mlps: PerVarMLP[]): PerVarMLP[] {
  return mlps.map((m) => ({
    W1: m.W1.map((row) => row.slice()),
    b1: m.b1.slice(),
    W2: m.W2.slice(),
    b2: m.b2,
  }));
}

function applyGradStep(mlps: PerVarMLP[], grads: MlpGrads[], lr: number): void {
  const d = mlps.length;
  for (let j = 0; j < d; j++) {
    const m = mlps[j];
    const g = grads[j];
    const H = m.b1.length;
    for (let h = 0; h < H; h++) {
      for (let i = 0; i < m.W1[h].length; i++) {
        if (i === j) continue; // keep pinned
        m.W1[h][i] -= lr * g.dW1[h][i];
      }
      m.b1[h] -= lr * g.db1[h];
      m.W2[h] -= lr * g.dW2[h];
    }
    m.b2 -= lr * g.db2;
  }
}

function gradientNormSq(grads: MlpGrads[]): number {
  let s = 0;
  for (const g of grads) {
    for (const row of g.dW1) for (const v of row) s += v * v;
    for (const v of g.db1) s += v * v;
    for (const v of g.dW2) s += v * v;
    s += g.db2 * g.db2;
  }
  return s;
}

function innerLoop(
  X: number[][],
  mlps: PerVarMLP[],
  alpha: number,
  rho: number,
  params: NotearsMlpParams,
): void {
  let lr = params.innerLR;
  let prev = objectiveAndGrad(X, mlps, alpha, rho, params);
  for (let iter = 0; iter < params.maxInnerIter; iter++) {
    const gNorm = Math.sqrt(gradientNormSq(prev.grads));
    if (gNorm < 1e-5) break;

    // Trial step.
    const candidate = cloneMLPs(mlps);
    applyGradStep(candidate, prev.grads, lr);
    const next = objectiveAndGrad(X, candidate, alpha, rho, params);

    // Armijo: accept if f decreased; otherwise halve lr and retry.
    if (next.f < prev.f) {
      // commit
      for (let j = 0; j < mlps.length; j++) {
        mlps[j].W1 = candidate[j].W1;
        mlps[j].b1 = candidate[j].b1;
        mlps[j].W2 = candidate[j].W2;
        mlps[j].b2 = candidate[j].b2;
      }
      prev = next;
      // Mild lr growth so we don't shrink permanently on the first failure.
      lr = Math.min(lr * 1.1, params.innerLR);
    } else {
      lr *= 0.5;
      if (lr < 1e-9) break;
    }
  }
}

function notearsMlpOuter(
  X: number[][],
  d: number,
  params: NotearsMlpParams,
): PerVarMLP[] {
  const mlps: PerVarMLP[] = Array.from({ length: d }, (_, j) =>
    initMLP(d, params.hiddenSize, j, params.initScale),
  );

  let alpha = 0;
  let rho = 1.0;
  let hPrev = Infinity;
  for (let outer = 0; outer < params.maxOuterIter; outer++) {
    innerLoop(X, mlps, alpha, rho, params);
    const A = derivedAdjacency(mlps);
    const { h: hNew } = hAndGradOnAdj(A, params.expTerms);
    if (Math.abs(hNew) > 0.25 * Math.abs(hPrev) && rho < params.rhoMax) {
      rho *= 10;
      continue;
    }
    alpha += rho * hNew;
    hPrev = hNew;
    if (Math.abs(hNew) < params.hThreshold) break;
  }
  return mlps;
}

// ─── Algorithm export ────────────────────────────────────────────────

export const notearsMlpAlgorithm: DiscoveryAlgorithm<NotearsMlpParams> = {
  id: "notears-mlp",
  version: "0.1.0",
  description:
    "NOTEARS-MLP — nonlinear DAG-structure learning. Per-variable MLPs (one hidden layer, tanh activation) predict each variable from the others; the derived adjacency A[i, j] = ‖W₁ⱼ[:, i]‖₂ feeds the same smooth acyclicity constraint h(A) = tr(e^(A∘A)) − d as linear NOTEARS. Augmented-Lagrangian outer loop with projected gradient-descent inner loop (Armijo backtrack). Yu, Chen, Gu (2019). Default hidden=8, lambda1=0.01.",
  defaultParams: DEFAULT_PARAMS,
  run(
    cohort: Cohort,
    paramOverrides?: Partial<NotearsMlpParams>,
  ): DiscoveryResult {
    const params: NotearsMlpParams = { ...DEFAULT_PARAMS, ...paramOverrides };

    const data = buildDataMatrix(cohort, params);
    if (!data) {
      return {
        variables: cohort.variables.map((v) => v.id),
        edges: [],
        diagnostics: { reason: "no subject grids met minGridPoints" },
      };
    }
    const { X, variableIds } = data;
    const d = variableIds.length;
    const mlps = notearsMlpOuter(X, d, params);
    const A = derivedAdjacency(mlps);
    const { h: hFinal } = hAndGradOnAdj(A, params.expTerms);

    const edges: DiscoveredEdge[] = [];
    for (let i = 0; i < d; i++) {
      for (let j = 0; j < d; j++) {
        if (i === j) continue;
        const a = A[i][j];
        if (a <= params.edgeThreshold) continue;
        edges.push({
          source: variableIds[i],
          target: variableIds[j],
          strength: a,
          evidence: `NOTEARS-MLP A=${a.toFixed(3)} (|A| > ${params.edgeThreshold} threshold; h(A)=${hFinal.toExponential(2)}; hidden=${params.hiddenSize})`,
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
      hiddenSize: params.hiddenSize,
      params,
    };
    if (edges.length === 0) {
      diagnostics.reason = `no edges above |A| > ${params.edgeThreshold} threshold (data may be only lag-coupled or noise-dominated; NOTEARS-MLP models contemporaneous structure only)`;
    }
    return {
      variables: variableIds,
      edges,
      diagnostics,
    };
  },
};

// Re-exported test helpers — keep the algorithm's surface as small as
// possible in production, but make the parts the test file pokes at
// directly available without breaking encapsulation more than necessary.
export const __testing = {
  initMLP,
  mlpForward,
  derivedAdjacency,
  hAndGradOnAdj,
  buildDataMatrix,
};
