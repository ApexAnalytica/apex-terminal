// ─── L-BFGS two-loop recursion ───────────────────────────────────────
//
// Limited-memory BFGS quasi-Newton optimisation. Given the gradient g_k
// at the current iterate and a history of the last m (s, y) pairs where
//   s_i = x_{i+1} - x_i        (position differences)
//   y_i = g_{i+1} - g_i        (gradient differences)
// the two-loop recursion produces the search direction d_k = -H_k · g_k
// in O(m · n) time, where H_k is the L-BFGS inverse Hessian approximation.
//
// References:
//   Nocedal, J. (1980). "Updating Quasi-Newton Matrices with Limited Storage."
//   Liu & Nocedal (1989). "On the Limited Memory BFGS Method for Large Scale
//     Optimization." Math. Prog. 45.
//
// Used by NOTEARS to replace plain proximal-gradient inner loop. Same
// optimum, fewer iterations.

export interface LBFGSHistory {
  /** Most-recent (s, y) at the highest index. FIFO when full. */
  s: number[][];
  y: number[][];
  /** Memory size cap — typically 5–20. */
  m: number;
}

export function newLBFGSHistory(m: number): LBFGSHistory {
  return { s: [], y: [], m };
}

export function pushHistory(hist: LBFGSHistory, s: number[], y: number[]): void {
  hist.s.push(s);
  hist.y.push(y);
  if (hist.s.length > hist.m) {
    hist.s.shift();
    hist.y.shift();
  }
}

/**
 * Compute the search direction d = -H_k · g via the two-loop recursion.
 * With empty history, falls back to steepest descent (d = -g).
 *
 * Standard Nocedal–Liu algorithm:
 *   q ← g
 *   for i = m-1 .. 0:  α_i = ρ_i · sᵢᵀ q;  q ← q - α_i · y_i
 *   r ← γ · q                                   (γ = (s_{m-1}ᵀ y_{m-1}) / (y_{m-1}ᵀ y_{m-1}))
 *   for i = 0 .. m-1:  β = ρ_i · y_iᵀ r;       r ← r + (α_i - β) · s_i
 *   return -r
 * where ρ_i = 1 / (y_iᵀ s_i).
 */
export function lbfgsDirection(g: number[], hist: LBFGSHistory): number[] {
  const m = hist.s.length;
  if (m === 0) return g.map((x) => -x);

  const q = [...g];
  const alphas = new Array<number>(m);
  const rhos = new Array<number>(m);

  for (let i = m - 1; i >= 0; i--) {
    const si = hist.s[i];
    const yi = hist.y[i];
    const ys = dot(yi, si);
    rhos[i] = ys !== 0 ? 1 / ys : 0;
    alphas[i] = rhos[i] * dot(si, q);
    for (let k = 0; k < q.length; k++) q[k] -= alphas[i] * yi[k];
  }

  // Initial Hessian scaling — uses the most recent (s, y) curvature pair.
  const lastS = hist.s[m - 1];
  const lastY = hist.y[m - 1];
  const sy = dot(lastS, lastY);
  const yy = dot(lastY, lastY);
  const gamma = yy > 0 ? sy / yy : 1;
  const r = q.map((x) => gamma * x);

  for (let i = 0; i < m; i++) {
    const yi = hist.y[i];
    const si = hist.s[i];
    const beta = rhos[i] * dot(yi, r);
    for (let k = 0; k < r.length; k++) r[k] += (alphas[i] - beta) * si[k];
  }

  return r.map((x) => -x);
}

export function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function vSub(a: number[], b: number[]): number[] {
  const out = new Array<number>(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] - b[i];
  return out;
}

export function vNorm(a: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s);
}

export function vAddScaled(a: number[], b: number[], s: number): number[] {
  const out = new Array<number>(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + s * b[i];
  return out;
}
