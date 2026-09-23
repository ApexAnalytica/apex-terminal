// ─── Matrix operations needed by NOTEARS ─────────────────────────────
//
// Tiny pure helpers — no dependencies, no mutation. NOTEARS needs matrix
// multiplication, transpose, the matrix exponential (via truncated Taylor
// series), Hadamard product, and trace. d (variable count) is small
// (typically ≤ 30 for the cohorts we see), so an O(d³) matmul and a
// 20-term series for `expm` are well within budget.

export type Mat = number[][];

export function zeros(rows: number, cols: number): Mat {
  return Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
}

export function identity(d: number): Mat {
  const I = zeros(d, d);
  for (let i = 0; i < d; i++) I[i][i] = 1;
  return I;
}

export function transpose(A: Mat): Mat {
  const rows = A.length;
  const cols = A[0]?.length ?? 0;
  const T = zeros(cols, rows);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) T[j][i] = A[i][j];
  }
  return T;
}

export function matmul(A: Mat, B: Mat): Mat {
  const m = A.length;
  const n = B[0]?.length ?? 0;
  const k = B.length;
  if (A[0]?.length !== k) {
    throw new Error(`matmul: shape mismatch — A is ${A.length}x${A[0]?.length}, B is ${k}x${n}`);
  }
  const C = zeros(m, n);
  for (let i = 0; i < m; i++) {
    const Ai = A[i];
    for (let p = 0; p < k; p++) {
      const Aip = Ai[p];
      if (Aip === 0) continue;
      const Bp = B[p];
      const Ci = C[i];
      for (let j = 0; j < n; j++) Ci[j] += Aip * Bp[j];
    }
  }
  return C;
}

export function matAdd(A: Mat, B: Mat, scaleB = 1): Mat {
  const m = A.length;
  const n = A[0].length;
  const C = zeros(m, n);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) C[i][j] = A[i][j] + scaleB * B[i][j];
  }
  return C;
}

export function hadamard(A: Mat, B: Mat): Mat {
  const m = A.length;
  const n = A[0].length;
  const C = zeros(m, n);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) C[i][j] = A[i][j] * B[i][j];
  }
  return C;
}

export function scale(A: Mat, s: number): Mat {
  const m = A.length;
  const n = A[0].length;
  const C = zeros(m, n);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) C[i][j] = A[i][j] * s;
  }
  return C;
}

export function trace(A: Mat): number {
  const d = A.length;
  let s = 0;
  for (let i = 0; i < d; i++) s += A[i][i];
  return s;
}

export function frobeniusNorm(A: Mat): number {
  let s = 0;
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < A[i].length; j++) s += A[i][j] * A[i][j];
  }
  return Math.sqrt(s);
}

/**
 * Matrix exponential via truncated Taylor series:
 *   e^M = Σ_{k=0..K} M^k / k!
 *
 * For NOTEARS's acyclicity constraint we only need this for M = W ∘ W
 * (entrywise non-negative, modest spectral radius). K=20 is enough for
 * the d ≤ 30 case to converge to ~1e-12 precision.
 */
export function matExp(M: Mat, terms = 20): Mat {
  const d = M.length;
  let result = identity(d);
  let term: Mat = identity(d);
  let factorial = 1;
  for (let k = 1; k <= terms; k++) {
    term = matmul(term, M);
    factorial *= k;
    const scaled = scale(term, 1 / factorial);
    result = matAdd(result, scaled);
  }
  return result;
}
