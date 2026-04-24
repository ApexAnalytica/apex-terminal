// Nonlinear mixed-effects model for C-peptide-style exponential decay.
//
// Model (per subject i, observation j):
//     C_ij = A_i · exp(−k_i · t_ij) + ε_ij,  ε_ij ~ N(0, σ²)
//
// Random effects on log scale (positivity):
//     log A_i ~ N(μ_A, τ_A²)
//     log k_i ~ N(μ_k, τ_k²)
//
// Fit by Laplace approximation of the marginal likelihood:
//   (1) For each subject, find η_i = (log A_i, log k_i) that maximizes
//       the per-subject log-posterior. Uses the same BFGS routine as
//       the outer solve — Newton worked when the FD Hessian happened
//       to be PD, but blew up when curvature became indefinite during
//       outer sweeps (clamped det→0 poisoned the Laplace term).
//   (2) Laplace-approximate the marginal log-likelihood using the mode
//       and the numerical Hessian at the mode (PD-regularized to avoid
//       FD-noise sign flips on det H).
//   (3) Maximize the summed marginal log-likelihood over population
//       parameters θ = (μ_A, μ_k, log τ_A, log τ_k, log σ) via BFGS
//       with numerical gradient and backtracking line search.
//
// Ported from research/estimators/nlme.py. Validated against that
// reference on a Pinheiro & Bates Indomethacin subset
// (src/lib/__tests__/estimators/fixtures/nlme_reference.json).
//
// Backs C-peptide decay trajectories in the T1D restoration briefs —
// every VX-880 / DCCT / β-cell preservation paper reports decay
// constants k̂ with random effects across patients, and this is the
// estimator that produces them without needing NONMEM / Monolix.

export interface NlmeSubject {
  /** Observation times (same length as y) */
  t: number[];
  /** Observed biomarker (e.g. C-peptide) at each t */
  y: number[];
}

export interface NlmeOptions {
  /** Max BFGS iterations on the outer problem (default 60) */
  maxIter?: number;
  /** Outer-solve tolerance on gradient norm (default 1e-5) */
  tol?: number;
  /** Override initial (μ_A, μ_k) population means (log scale) */
  initMu?: [number, number];
  /** Override initial (τ_A, τ_k) between-subject SDs (natural scale) */
  initTau?: [number, number];
  /** Override initial within-subject residual SD σ */
  initSigma?: number;
}

export interface NlmeFit {
  /** Population means on log scale: [μ_A, μ_k] */
  mu: [number, number];
  /** Between-subject SDs on log scale: [τ_A, τ_k] */
  tau: [number, number];
  /** Within-subject residual SD (natural scale) */
  sigma: number;
  /** Per-subject modes (n_subjects × 2): columns are log A, log k */
  eta: number[][];
  /** Maximum marginal log-likelihood attained */
  logLikelihood: number;
  /** Did the outer BFGS hit the gradient-norm tolerance? */
  converged: boolean;
  /** Outer BFGS iterations actually run */
  iters: number;
}

// ─── Linear algebra for tiny dense matrices ──────────────────────

function zeros2d(n: number, m: number): number[][] {
  return Array.from({ length: n }, () => new Array(m).fill(0));
}

function identity(n: number): number[][] {
  const I = zeros2d(n, n);
  for (let i = 0; i < n; i++) I[i][i] = 1;
  return I;
}

function matVec(A: number[][], x: number[]): number[] {
  const n = A.length;
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < x.length; k++) s += A[i][k] * x[k];
    out[i] = s;
  }
  return out;
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function norm(a: number[]): number {
  return Math.sqrt(dot(a, a));
}

function logdet2x2(H: number[][]): number {
  const det = H[0][0] * H[1][1] - H[0][1] * H[1][0];
  // Clamp away from zero so log is finite even for near-singular H
  return Math.log(Math.max(det, 1e-300));
}

/** Regularize a 2×2 symmetric matrix to be positive-definite by adding
 *  λI where λ is just enough to lift the smaller eigenvalue above `floor`.
 *  This matters for Laplace: an indefinite FD Hessian at a non-mode
 *  produces spurious huge logdet clamps that poison the outer fit. */
function makePD2x2(H: number[][], floor: number = 1e-6): number[][] {
  const a = H[0][0];
  const b = 0.5 * (H[0][1] + H[1][0]);
  const d = H[1][1];
  const tr = a + d;
  const disc = Math.sqrt(Math.max(0.25 * (a - d) * (a - d) + b * b, 0));
  const lamMin = 0.5 * tr - disc;
  if (lamMin >= floor) {
    return [
      [a, b],
      [b, d],
    ];
  }
  const shift = floor - lamMin;
  return [
    [a + shift, b],
    [b, d + shift],
  ];
}

// ─── Numerical differentiation ────────────────────────────────────

function gradientFD(
  f: (x: number[]) => number,
  x: number[],
  eps: number = 1e-5,
): number[] {
  const n = x.length;
  const g = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const xp = x.slice();
    const xm = x.slice();
    xp[i] += eps;
    xm[i] -= eps;
    g[i] = (f(xp) - f(xm)) / (2 * eps);
  }
  return g;
}

function hessianFD2x2(
  f: (x: number[]) => number,
  x: number[],
  eps: number = 1e-4,
): number[][] {
  // Symmetric-difference mixed-partials (matches the numpy reference).
  const H = zeros2d(2, 2);
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const xpp = x.slice();
      const xpn = x.slice();
      const xnp = x.slice();
      const xnn = x.slice();
      xpp[i] += eps;
      xpp[j] += eps;
      xpn[i] += eps;
      xpn[j] -= eps;
      xnp[i] -= eps;
      xnp[j] += eps;
      xnn[i] -= eps;
      xnn[j] -= eps;
      H[i][j] = (f(xpp) - f(xpn) - f(xnp) + f(xnn)) / (4 * eps * eps);
    }
  }
  // Symmetrize
  const s = (H[0][1] + H[1][0]) / 2;
  H[0][1] = s;
  H[1][0] = s;
  return H;
}

// ─── Per-subject log-posterior ────────────────────────────────────

function predictSubject(eta: number[], t: number[]): number[] {
  const A = Math.exp(eta[0]);
  const k = Math.exp(eta[1]);
  return t.map((ti) => A * Math.exp(-k * ti));
}

function subjectNegLogPost(
  eta: number[],
  subj: NlmeSubject,
  mu: number[],
  tau: number[],
  sigma: number,
): number {
  const pred = predictSubject(eta, subj.t);
  let resid2 = 0;
  for (let j = 0; j < subj.y.length; j++) {
    const r = subj.y[j] - pred[j];
    resid2 += r * r;
  }
  const ll =
    -0.5 * (resid2 / (sigma * sigma)) - subj.y.length * Math.log(sigma);
  const e0 = (eta[0] - mu[0]) / tau[0];
  const e1 = (eta[1] - mu[1]) / tau[1];
  const lp =
    -0.5 * (e0 * e0 + e1 * e1) - Math.log(tau[0]) - Math.log(tau[1]);
  return -(ll + lp);
}

// ─── Per-subject Laplace marginal ─────────────────────────────────

interface LaplaceResult {
  logMarg: number;
  etaHat: number[];
  hess: number[][];
}

function laplaceMarginal(
  subj: NlmeSubject,
  mu: number[],
  tau: number[],
  sigma: number,
): LaplaceResult {
  const f = (eta: number[]) => subjectNegLogPost(eta, subj, mu, tau, sigma);
  // BFGS inner solve (robust to indefinite curvature). Matches the
  // scipy.optimize.minimize(method="BFGS") used in the Python reference.
  const res = bfgsMinimize(f, mu.slice(), 50, 1e-6);
  const etaHat = res.x;

  // Laplace Hessian at the mode — force PD before taking logdet so a
  // small amount of FD noise can't flip the sign of det(H).
  const Hraw = hessianFD2x2(f, etaHat);
  const H = makePD2x2(Hraw, 1e-6);
  const fVal = f(etaHat);
  const logdet = logdet2x2(H);
  const logMarg = -fVal + Math.log(2 * Math.PI) - 0.5 * logdet;
  return { logMarg, etaHat, hess: H };
}

// ─── BFGS outer optimizer (5D) ────────────────────────────────────

interface BfgsResult {
  x: number[];
  fVal: number;
  converged: boolean;
  iters: number;
}

function bfgsMinimize(
  f: (x: number[]) => number,
  x0: number[],
  maxIter: number,
  tol: number,
): BfgsResult {
  const n = x0.length;
  let x = x0.slice();
  let H: number[][] = identity(n); // inverse-Hessian approximation
  let g = gradientFD(f, x);
  let fx = f(x);
  let converged = false;
  let iters = 0;

  for (let it = 0; it < maxIter; it++) {
    iters = it + 1;
    const gNorm = norm(g);
    if (gNorm < tol) {
      converged = true;
      break;
    }

    // Descent direction: p = -H·g
    const p = matVec(H, g).map((v) => -v);

    // Backtracking line search (Armijo) — simple, robust
    const phi0 = fx;
    const dphi0 = dot(g, p);
    if (dphi0 >= 0) {
      // Not a descent direction (numerical noise) — reset to steepest
      // descent on this step.
      for (let i = 0; i < n; i++) p[i] = -g[i];
    }
    let alpha = 1.0;
    const c1 = 1e-4;
    let xNew = x.slice();
    let fNew = fx;
    for (let ls = 0; ls < 30; ls++) {
      xNew = x.map((v, k) => v + alpha * p[k]);
      fNew = f(xNew);
      if (fNew <= phi0 + c1 * alpha * dphi0) break;
      alpha *= 0.5;
    }

    const gNew = gradientFD(f, xNew);
    const s = xNew.map((v, k) => v - x[k]);
    const yv = gNew.map((v, k) => v - g[k]);
    const sy = dot(s, yv);

    // BFGS inverse-Hessian update (skip if curvature pair ill-conditioned)
    if (sy > 1e-10) {
      const rho = 1.0 / sy;
      // H_new = (I - ρ s yᵀ) H (I - ρ y sᵀ) + ρ s sᵀ
      // Implement via three vector ops (small-n so explicit is fine).
      const Hy = matVec(H, yv); // H·y
      const yHy = dot(yv, Hy);
      const coeff1 = (1 + rho * yHy) * rho;
      const newH = zeros2d(n, n);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          newH[i][j] =
            H[i][j]
            - rho * (s[i] * Hy[j] + Hy[i] * s[j])
            + coeff1 * s[i] * s[j];
        }
      }
      H = newH;
    }

    // Check function-value stagnation
    if (Math.abs(fNew - fx) < tol * (Math.abs(fx) + 1)) {
      x = xNew;
      g = gNew;
      fx = fNew;
      converged = true;
      break;
    }

    x = xNew;
    g = gNew;
    fx = fNew;
  }

  return { x, fVal: fx, converged, iters };
}

// ─── Initial population estimates from per-subject log-linear fits ─

function initialEstimates(subjects: NlmeSubject[]): {
  mu: [number, number];
  tau: [number, number];
  sigma: number;
} {
  const etas: number[][] = [];
  for (const s of subjects) {
    // Log-linear: log(y) = log(A) - k·t  →  OLS on (t, log y)
    const tPos: number[] = [];
    const logY: number[] = [];
    for (let j = 0; j < s.y.length; j++) {
      if (s.y[j] > 0) {
        tPos.push(s.t[j]);
        logY.push(Math.log(s.y[j]));
      }
    }
    if (tPos.length < 2) {
      const meanY = s.y.reduce((a, b) => a + b, 0) / Math.max(s.y.length, 1);
      etas.push([Math.log(Math.max(meanY, 1e-3)), Math.log(0.01)]);
      continue;
    }
    const n = tPos.length;
    const meanT = tPos.reduce((a, b) => a + b, 0) / n;
    const meanLY = logY.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let j = 0; j < n; j++) {
      num += (tPos[j] - meanT) * (logY[j] - meanLY);
      den += (tPos[j] - meanT) * (tPos[j] - meanT);
    }
    const slope = den > 0 ? num / den : 0;
    const intercept = meanLY - slope * meanT;
    // log A = intercept;  log k = log(-slope) when slope < 0 (decay),
    // else fall back to a small positive k.
    const kGuess = slope < 0 ? -slope : 0.01;
    etas.push([intercept, Math.log(kGuess)]);
  }

  const n = etas.length;
  const mu: [number, number] = [0, 0];
  for (const e of etas) {
    mu[0] += e[0];
    mu[1] += e[1];
  }
  mu[0] /= n;
  mu[1] /= n;
  const tau: [number, number] = [0, 0];
  for (const e of etas) {
    tau[0] += (e[0] - mu[0]) ** 2;
    tau[1] += (e[1] - mu[1]) ** 2;
  }
  tau[0] = Math.max(Math.sqrt(tau[0] / Math.max(n - 1, 1)), 0.1);
  tau[1] = Math.max(Math.sqrt(tau[1] / Math.max(n - 1, 1)), 0.1);

  // Residual sigma: rough SD of per-subject log-linear residuals
  let rs = 0;
  let rn = 0;
  for (let i = 0; i < subjects.length; i++) {
    const pred = predictSubject(etas[i], subjects[i].t);
    for (let j = 0; j < subjects[i].y.length; j++) {
      rs += (subjects[i].y[j] - pred[j]) ** 2;
      rn++;
    }
  }
  const sigma = rn > 0 ? Math.max(Math.sqrt(rs / rn), 1e-3) : 1;
  return { mu, tau, sigma };
}

// ─── Public API ──────────────────────────────────────────────────

export function nlmeFit(
  subjects: NlmeSubject[],
  opts: NlmeOptions = {},
): NlmeFit {
  if (subjects.length === 0) throw new Error("nlmeFit: no subjects");
  for (const s of subjects) {
    if (s.t.length !== s.y.length) {
      throw new Error("nlmeFit: subject t/y length mismatch");
    }
  }

  const init = initialEstimates(subjects);
  const mu0 = opts.initMu ?? init.mu;
  const tau0 = opts.initTau ?? init.tau;
  const sigma0 = opts.initSigma ?? init.sigma;
  const maxIter = opts.maxIter ?? 60;
  const tol = opts.tol ?? 1e-5;

  const negMarginal = (params: number[]): number => {
    const muP: [number, number] = [params[0], params[1]];
    const tauP: [number, number] = [Math.exp(params[2]), Math.exp(params[3])];
    const sigmaP = Math.exp(params[4]);
    let total = 0;
    for (const s of subjects) {
      const { logMarg } = laplaceMarginal(s, muP, tauP, sigmaP);
      total += logMarg;
    }
    return -total;
  };

  const x0 = [
    mu0[0],
    mu0[1],
    Math.log(tau0[0]),
    Math.log(tau0[1]),
    Math.log(sigma0),
  ];

  const { x, fVal, converged, iters } = bfgsMinimize(
    negMarginal,
    x0,
    maxIter,
    tol,
  );

  const mu: [number, number] = [x[0], x[1]];
  const tau: [number, number] = [Math.exp(x[2]), Math.exp(x[3])];
  const sigma = Math.exp(x[4]);

  const eta: number[][] = [];
  for (const s of subjects) {
    const { etaHat } = laplaceMarginal(s, mu, tau, sigma);
    eta.push(etaHat);
  }

  return {
    mu,
    tau,
    sigma,
    eta,
    logLikelihood: -fVal,
    converged,
    iters,
  };
}
