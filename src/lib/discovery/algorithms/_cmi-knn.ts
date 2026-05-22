// ─── CMI-knn — Nonparametric Conditional Mutual Information ──────────
//
// Frenzel & Pompe (2007) k-nearest-neighbour estimator for
// conditional mutual information I(X; Y | Z), nats. Distance metric is
// Chebyshev (max-norm) following Kraskov–Stögbauer–Grassberger (2004).
//
// For each sample i:
//   ε_i = Chebyshev distance to the k-th nearest neighbour in joint
//         (X, Y, Z) space
//   n_xz(i) = #{j ≠ i : chebyshev(xz_i, xz_j) < ε_i}
//   n_yz(i) = #{j ≠ i : chebyshev(yz_i, yz_j) < ε_i}
//   n_z(i)  = #{j ≠ i : chebyshev(z_i, z_j) < ε_i}
//
// I(X; Y | Z) ≈ ψ(k) + (1/N) · Σ [ψ(n_z+1) − ψ(n_xz+1) − ψ(n_yz+1)]
//
// where ψ is the digamma function. For unconditional MI (|Z| = 0), the
// estimator collapses to KSG with n_z(i) ≡ N − 1.
//
// Honest framing:
//   - k = 5 by default. Smaller k = lower bias, higher variance.
//   - KD-tree neighbour search (Chebyshev / max-norm) — O(N log N) build
//     + O(k · log N) per query average for low-dim point sets (d ≤ ~10).
//     Replaces the v0.6 naive O(N²) sort. The conditional-MI case has
//     dim = 2 + |Z|; for FCI with maxCondsDim ≤ 3 this stays well
//     inside the KD-tree's effective regime.
//   - p-value uses the χ²(1) asymptotic of 2N·CMI (Kullback 1959).
//     Strictly valid for discrete MI; reasonable approximation for
//     k-NN MI with large N. For a rigorous test, use a local-
//     permutation null (Kim et al. 2022) — deferred.

import type { CITestResult } from "./_ci-test";
import { buildKdTree, kNearest, countWithinRadius } from "./_kd-tree";

const DEFAULT_K = 5;

/** Digamma function ψ(x), x > 0. Recurrence ψ(x) = ψ(x+1) − 1/x pushes
 *  small x to x ≥ 6, then the asymptotic expansion ψ(x) ≈ ln(x) − 1/(2x)
 *  − 1/(12x²) + 1/(120x⁴) converges to ~1e-9 precision. */
export function digamma(x: number): number {
  let result = 0;
  while (x < 6) {
    result -= 1 / x;
    x += 1;
  }
  const inv = 1 / x;
  const inv2 = inv * inv;
  result += Math.log(x) - 0.5 * inv - inv2 / 12 + (inv2 * inv2) / 120;
  return result;
}

/** Frenzel-Pompe k-NN estimator for I(X; Y | Z) in nats.
 *  X, Y are length-N arrays; Z is N × |Z| (each row a conditioning
 *  vector). Pass `Z = []` for unconditional MI.
 *
 *  KD-tree variant: one tree per (joint, xz, yz, z) point set is built
 *  once at the start, then queried N times. Per-call complexity drops
 *  from O(N²) to roughly O(N · k · log N). */
export function cmiKnn(
  x: number[],
  y: number[],
  Z: number[][],
  k: number = DEFAULT_K,
): number {
  const N = x.length;
  if (N <= k + 1) return 0;

  const nCond = Z.length === 0 ? 0 : Z[0].length;
  const joint: number[][] = new Array(N);
  const xz: number[][] = new Array(N);
  const yz: number[][] = new Array(N);
  const zOnly: number[][] = new Array(N);
  for (let i = 0; i < N; i++) {
    const zi = nCond > 0 ? Z[i] : [];
    joint[i] = [x[i], y[i], ...zi];
    xz[i] = [x[i], ...zi];
    yz[i] = [y[i], ...zi];
    zOnly[i] = zi;
  }

  // Build KD-trees once. Z-tree is skipped when |Z| = 0 (unconditional
  // MI shortcuts n_z(i) ≡ N − 1).
  const jointTree = buildKdTree(joint);
  const xzTree = buildKdTree(xz);
  const yzTree = buildKdTree(yz);
  const zTree = nCond > 0 ? buildKdTree(zOnly) : null;

  let sumDigamma = 0;
  let validCount = 0;
  for (let i = 0; i < N; i++) {
    const neighbours = kNearest(jointTree, joint[i], k, i);
    if (neighbours.length < k) continue;
    const eps = neighbours[k - 1].dist;
    if (!Number.isFinite(eps) || eps === 0) continue;

    const nxz = countWithinRadius(xzTree, xz[i], eps, i);
    const nyz = countWithinRadius(yzTree, yz[i], eps, i);
    const nz = nCond > 0 ? countWithinRadius(zTree, zOnly[i], eps, i) : N - 1;

    sumDigamma +=
      digamma(nz + 1) - digamma(nxz + 1) - digamma(nyz + 1);
    validCount += 1;
  }

  if (validCount === 0) return 0;
  const cmi = digamma(k) + sumDigamma / validCount;
  // The estimator can produce small negative values (estimator bias);
  // CMI is non-negative in theory, so clip.
  return cmi > 0 ? cmi : 0;
}

/** P(χ²(1) ≤ x) = erf(√(x/2)) for x ≥ 0. */
function chi2Cdf1(x: number): number {
  if (x <= 0) return 0;
  return erf(Math.sqrt(x / 2));
}

/** erf via Abramowitz & Stegun 7.1.26 — ~1e-7 precision. */
function erf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + p * ax);
  const y =
    1 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

export interface CmiKnnOptions {
  /** Number of nearest neighbours. Default 5. */
  k?: number;
  /** Minimum sample size to run the test. Default 30. */
  minN?: number;
}

/**
 * Conditional-independence test via the k-NN CMI estimator.
 *
 * Returns the same shape as `partialCorrelation` so FCI can swap test
 * implementations without further changes:
 *   - `r` carries the CMI estimate in nats (non-negative — different
 *     semantics from a Pearson correlation, but works as an edge
 *     "strength" downstream where larger = stronger dependence).
 *   - `p` is from the χ²(1) asymptotic of 2N·CMI.
 *   - `n` is the effective sample size after NaN-drop.
 */
export function cmiKnnTest(
  x: number[],
  y: number[],
  Z: number[][],
  options?: CmiKnnOptions,
): CITestResult | null {
  const minN = options?.minN ?? 30;
  const k = options?.k ?? DEFAULT_K;
  if (y.length !== x.length) {
    throw new Error("cmiKnnTest: x/y length mismatch");
  }
  if (Z.length !== 0 && Z.length !== x.length) {
    throw new Error("cmiKnnTest: Z row count mismatch");
  }
  const nCond = Z.length === 0 ? 0 : Z[0].length;

  // Drop rows with any non-finite value (matches partial-correlation behaviour).
  const xc: number[] = [];
  const yc: number[] = [];
  const Zc: number[][] = [];
  for (let i = 0; i < x.length; i++) {
    if (!Number.isFinite(x[i]) || !Number.isFinite(y[i])) continue;
    if (nCond > 0) {
      const row = Z[i];
      let ok = true;
      for (let j = 0; j < nCond; j++) {
        if (!Number.isFinite(row[j])) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      Zc.push(row);
    }
    xc.push(x[i]);
    yc.push(y[i]);
  }
  const n = xc.length;
  if (n < minN) return null;
  if (n <= k + 1) return null;

  const cmi = cmiKnn(xc, yc, Zc, k);
  const stat = 2 * n * cmi;
  const pValue = 1 - chi2Cdf1(stat);
  return { r: cmi, p: pValue, n };
}
