// Cox proportional-hazards regression from scratch (Breslow ties).
//
// Model:  h(t | x) = h_0(t) · exp(x'β)
// Partial log-likelihood (Breslow):
//
//   ℓ(β) = Σ_{i: event}  [ x_i'β  −  log Σ_{j ∈ R(t_i)} exp(x_j'β) ]
//
// where R(t_i) is the risk set at t_i. Fit β by Newton-Raphson with
// ridge regularization and backtracking line search. Standard errors
// via the inverse of the observed negative Hessian. Concordance via
// Harrell's c-index.
//
// Ported from research/estimators/cox.py — same Breslow ties, same
// Newton loop, same ridge, same SE / c-index definitions. Validated
// against the Python reference on a deterministic synthetic fixture
// (src/lib/__tests__/estimators/fixtures/cox_reference.json).
//
// Backs the time-to-event threads in the T1D restoration briefs —
// time to graft failure, time to first severe hypo, time to C-peptide
// drop below threshold. Every VX-880 / Edmonton-protocol paper leans
// on Cox for the hazard story, so this is a prerequisite for any
// institutional demo that speaks trial-data vocabulary.

export interface CoxOptions {
  l2?: number;
  maxIter?: number;
  tol?: number;
}

export interface CoxFit {
  /** Log-hazard ratios, one per covariate (length d) */
  beta: number[];
  /** Standard errors (length d) */
  se: number[];
  /** Partial log-likelihood at the fitted β */
  logPartialLikelihood: number;
  /** Harrell's c-index */
  concordance: number;
  /** Number of Newton iterations performed */
  iters: number;
  /** Whether the Newton loop hit the tolerance criterion */
  converged: boolean;
}

// ─── Linear algebra helpers (local — no numpy dependency) ────────

/** Cholesky decomposition A = L·Lᵀ for symmetric positive-definite A.
 *  Returns the lower-triangular L as an array of rows, or null if A
 *  is not PD to working precision. */
function cholesky(A: number[][]): number[][] | null {
  const n = A.length;
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i][j];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) {
        if (sum <= 0) return null; // not PD
        L[i][j] = Math.sqrt(sum);
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }
  return L;
}

/** Solve A·x = b where A = L·Lᵀ (Cholesky factor passed in). */
function choleskySolve(L: number[][], b: number[]): number[] {
  const n = L.length;
  // Forward: L·y = b
  const y = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = b[i];
    for (let k = 0; k < i; k++) sum -= L[i][k] * y[k];
    y[i] = sum / L[i][i];
  }
  // Back: Lᵀ·x = y
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = y[i];
    for (let k = i + 1; k < n; k++) sum -= L[k][i] * x[k];
    x[i] = sum / L[i][i];
  }
  return x;
}

/** Solve A·x = b for symmetric A via Cholesky; fallback to ridge-
 *  augmented Cholesky if A is not PD to working precision (matches
 *  np.linalg.solve → np.linalg.lstsq fallback in cox.py). */
function solveSymmetric(A: number[][], b: number[]): number[] {
  const L = cholesky(A);
  if (L) return choleskySolve(L, b);
  // Ridge fallback
  const n = A.length;
  const A2 = A.map((row, i) =>
    row.map((v, j) => (i === j ? v + 1e-8 : v)),
  );
  const L2 = cholesky(A2);
  if (L2) return choleskySolve(L2, b);
  throw new Error("Cox solve failed: Hessian not invertible");
}

/** Invert a symmetric positive-definite matrix via Cholesky. */
function invertSymmetric(A: number[][]): number[][] {
  const n = A.length;
  const L = cholesky(A);
  if (!L) {
    const A2 = A.map((row, i) =>
      row.map((v, j) => (i === j ? v + 1e-8 : v)),
    );
    const L2 = cholesky(A2);
    if (!L2) throw new Error("Cox invertSymmetric: matrix not PD");
    return invertViaL(L2);
  }
  return invertViaL(L);
}

function invertViaL(L: number[][]): number[][] {
  const n = L.length;
  const inv: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let col = 0; col < n; col++) {
    const e = new Array(n).fill(0);
    e[col] = 1;
    const x = choleskySolve(L, e);
    for (let row = 0; row < n; row++) inv[row][col] = x[row];
  }
  return inv;
}

// ─── Partial log-likelihood, gradient, Hessian (Breslow ties) ────

interface BreslowResult {
  ll: number;
  grad: number[];
  /** Negative Hessian (so it's positive-definite under ridge). */
  negHess: number[][];
}

function partialLL(
  beta: number[],
  X: number[][],       // X[i] is the feature vector for subject i, in DESC time order
  events: number[],    // binary, same order as X
  l2: number,
): BreslowResult {
  const n = X.length;
  const d = beta.length;

  // η_i = x_i · β
  const eta = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < d; k++) s += X[i][k] * beta[k];
    eta[i] = s;
  }

  // Numerical stability: subtract running max before exp.
  let etaMax = -Infinity;
  for (let i = 0; i < n; i++) if (eta[i] > etaMax) etaMax = eta[i];

  const expEta = new Array(n).fill(0);
  for (let i = 0; i < n; i++) expEta[i] = Math.exp(eta[i] - etaMax);

  // Cumulative risk-set sums (rows sorted DESC time → running partial sum
  // over subjects who are still at risk at time t_i).
  //   cumExp[i]  = Σ_{j ≤ i} exp(η_j − max)
  //   cumX[i][k] = Σ_{j ≤ i} exp_eta_j · X_j[k]
  //   cumXX[i]   = Σ_{j ≤ i} exp_eta_j · X_j X_jᵀ
  const cumExp = new Array(n).fill(0);
  const cumX: number[][] = Array.from({ length: n }, () => new Array(d).fill(0));
  const cumXX: number[][][] = Array.from({ length: n }, () =>
    Array.from({ length: d }, () => new Array(d).fill(0)),
  );

  for (let i = 0; i < n; i++) {
    const w = expEta[i];
    cumExp[i] = (i > 0 ? cumExp[i - 1] : 0) + w;
    for (let k = 0; k < d; k++) {
      cumX[i][k] = (i > 0 ? cumX[i - 1][k] : 0) + w * X[i][k];
      for (let l = 0; l < d; l++) {
        const prev = i > 0 ? cumXX[i - 1][k][l] : 0;
        cumXX[i][k][l] = prev + w * X[i][k] * X[i][l];
      }
    }
  }

  let ll = 0;
  const grad = new Array(d).fill(0);
  const negHess: number[][] = Array.from({ length: d }, () => new Array(d).fill(0));

  for (let i = 0; i < n; i++) {
    if (!events[i]) continue;
    const logDenom = Math.log(cumExp[i]) + etaMax;
    ll += eta[i] - logDenom;
    // E[X | at risk] = cumX[i] / cumExp[i]
    const E = new Array(d).fill(0);
    for (let k = 0; k < d; k++) E[k] = cumX[i][k] / cumExp[i];
    for (let k = 0; k < d; k++) grad[k] += X[i][k] - E[k];
    // Hessian contribution: − (E[XXᵀ] − E[X] E[X]ᵀ)
    for (let k = 0; k < d; k++) {
      for (let l = 0; l < d; l++) {
        const second = cumXX[i][k][l] / cumExp[i] - E[k] * E[l];
        // hess -= second  →  negHess += second
        negHess[k][l] += second;
      }
    }
  }

  // Ridge: ll -= 0.5 * l2 * β·β ;  grad -= l2·β ;  hess -= l2·I
  //        → negHess += l2·I
  let bb = 0;
  for (let k = 0; k < d; k++) bb += beta[k] * beta[k];
  ll -= 0.5 * l2 * bb;
  for (let k = 0; k < d; k++) grad[k] -= l2 * beta[k];
  for (let k = 0; k < d; k++) negHess[k][k] += l2;

  return { ll, grad, negHess };
}

// ─── Harrell's c-index (O(n²); fine for n ≤ few thousand) ────────

function concordance(
  times: number[],
  events: number[],
  risk: number[],
): number {
  const n = times.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    if (!events[i]) continue;
    for (let j = 0; j < n; j++) {
      if (times[j] <= times[i]) continue;
      den += 1;
      if (risk[i] > risk[j]) num += 1;
      else if (risk[i] === risk[j]) num += 0.5;
    }
  }
  return den > 0 ? num / den : NaN;
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Fit a Cox proportional-hazards model with Breslow ties.
 *
 * @param X       (n × d) covariate matrix (no intercept — Cox has none)
 * @param times   (n,) survival / censoring times
 * @param events  (n,) 1 = event observed, 0 = censored
 * @param opts    ridge l2 (default 1e-6), maxIter (50), tol (1e-6)
 */
export function coxFit(
  X: number[][],
  times: number[],
  events: number[],
  opts: CoxOptions = {},
): CoxFit {
  const l2 = opts.l2 ?? 1e-6;
  const maxIter = opts.maxIter ?? 50;
  const tol = opts.tol ?? 1e-6;

  const n = X.length;
  if (n === 0) throw new Error("coxFit: empty data");
  const d = X[0].length;
  if (times.length !== n || events.length !== n) {
    throw new Error("coxFit: X, times, events length mismatch");
  }

  // Descending time order (stable) — lets us compute risk-set cumulative
  // sums in one forward pass.
  const idx = Array.from({ length: n }, (_, i) => i);
  idx.sort((a, b) => {
    if (times[b] !== times[a]) return times[b] - times[a];
    return a - b; // stable tiebreak matches numpy mergesort behaviour
  });
  const Xo = idx.map((i) => X[i].slice());
  const eo = idx.map((i) => events[i]);

  let beta = new Array(d).fill(0);
  let converged = false;
  let iters = 0;
  let finalLL = -Infinity;

  for (let it = 0; it < maxIter; it++) {
    iters = it + 1;
    const { ll, grad, negHess } = partialLL(beta, Xo, eo, l2);
    // Newton step: negHess · δ = grad   (since real hess is negative-def
    // and we negate both sides: −hess·δ = grad)
    const delta = solveSymmetric(negHess, grad);

    // Backtracking line search
    let step = 1.0;
    let newBeta = beta.slice();
    let newLL = ll;
    for (let ls = 0; ls < 30; ls++) {
      newBeta = beta.map((b, k) => b + step * delta[k]);
      const trial = partialLL(newBeta, Xo, eo, l2);
      if (trial.ll > ll) {
        newLL = trial.ll;
        break;
      }
      step *= 0.5;
    }
    beta = newBeta;
    finalLL = newLL;

    if (Math.abs(newLL - ll) < tol * (Math.abs(ll) + 1)) {
      converged = true;
      break;
    }
  }

  // Final negHess at converged β for SE
  const { negHess } = partialLL(beta, Xo, eo, l2);
  const cov = invertSymmetric(negHess);
  const se = new Array(d).fill(0);
  for (let k = 0; k < d; k++) se[k] = Math.sqrt(Math.max(0, cov[k][k]));

  // Risk score x·β on the ORIGINAL (unsorted) order for c-index
  const risk = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < d; k++) s += X[i][k] * beta[k];
    risk[i] = s;
  }
  const c = concordance(times, events, risk);

  return {
    beta,
    se,
    logPartialLikelihood: finalLL,
    concordance: c,
    iters,
    converged,
  };
}
