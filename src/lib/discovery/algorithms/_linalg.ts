// ─── Tiny linear-algebra primitives for the discovery layer ──────────
//
// Used by partial-correlation / PCMCI+. Conditioning sets in PCMCI+ are
// typically 0–5 variables, so we never need the heavy artillery — a
// naive Gauss elimination with partial pivoting is enough and stays
// dependency-free.
//
// All operations use plain `number[][]` so they're easy to test and
// inspect. No mutation of inputs.

/**
 * Solve A·x = b for a small square matrix A (n×n) via Gauss elimination
 * with partial pivoting. Returns null if A is singular (within `eps`).
 */
export function linsolve(A: number[][], b: number[], eps = 1e-12): number[] | null {
  const n = A.length;
  if (n === 0) return [];
  if (b.length !== n || A.some((row) => row.length !== n)) {
    throw new Error("linsolve: shape mismatch");
  }
  // Augmented matrix [A | b], deep-copied.
  const M = A.map((row, i) => [...row, b[i]]);

  for (let k = 0; k < n; k++) {
    // Partial pivot: find row with max |M[i][k]| for i ≥ k.
    let maxRow = k;
    let maxAbs = Math.abs(M[k][k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(M[i][k]);
      if (v > maxAbs) {
        maxAbs = v;
        maxRow = i;
      }
    }
    if (maxAbs < eps) return null; // singular
    if (maxRow !== k) [M[k], M[maxRow]] = [M[maxRow], M[k]];

    // Eliminate below.
    for (let i = k + 1; i < n; i++) {
      const f = M[i][k] / M[k][k];
      for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j];
    }
  }

  // Back-substitute.
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

/**
 * OLS regression: solve (Z^T Z) β = Z^T y for β where Z is N×k.
 * Returns the fitted coefficients, or null if Z^T Z is singular.
 *
 * Z columns should already include an intercept column if one is desired.
 */
export function olsFit(Z: number[][], y: number[]): number[] | null {
  const N = Z.length;
  if (N === 0) return [];
  const k = Z[0].length;
  // ZtZ (k×k)
  const ZtZ: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  const Zty: number[] = new Array(k).fill(0);
  for (let i = 0; i < N; i++) {
    const row = Z[i];
    const yi = y[i];
    for (let a = 0; a < k; a++) {
      Zty[a] += row[a] * yi;
      for (let b = a; b < k; b++) ZtZ[a][b] += row[a] * row[b];
    }
  }
  for (let a = 0; a < k; a++) {
    for (let b = 0; b < a; b++) ZtZ[a][b] = ZtZ[b][a];
  }
  return linsolve(ZtZ, Zty);
}

/**
 * OLS residuals: returns y − Z·β where β is the least-squares fit.
 * Returns null on singular Z^T Z.
 */
export function olsResiduals(Z: number[][], y: number[]): number[] | null {
  const beta = olsFit(Z, y);
  if (!beta) return null;
  return y.map((yi, i) => {
    let pred = 0;
    for (let j = 0; j < beta.length; j++) pred += Z[i][j] * beta[j];
    return yi - pred;
  });
}
