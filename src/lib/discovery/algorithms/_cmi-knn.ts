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
  /** Number of nearest neighbours for the CMI estimator. Default 5. */
  k?: number;
  /** Minimum sample size to run the test. Default 30. */
  minN?: number;
  /**
   * If > 0, use a local-permutation null distribution for the p-value
   * instead of the χ²(1) asymptotic. Each permutation shuffles X via
   * `nPermutationSwaps` random-walk swaps where each swap is between
   * two indices in each other's Z-neighborhood (size `kPerm`). This is
   * the practical variant of Kim et al. (2022) — strictly more
   * rigorous than the χ² asymptotic for conditional-independence
   * testing, at the cost of `nPermutations · cmiKnn` extra work.
   * Default 0 (asymptotic, preserves v0.6 behaviour).
   */
  nPermutations?: number;
  /**
   * Z-space neighbourhood size for the local permutation. Default 10.
   * Smaller = more local (preserves Z structure more tightly, less
   * statistical power); larger → unconditional permutation in the
   * limit. Ignored when `nPermutations` = 0.
   */
  kPerm?: number;
  /**
   * Number of random-walk swaps per permutation. Default 5·N; smaller
   * = less mixing, larger = more expensive. Ignored when
   * `nPermutations` = 0.
   */
  nPermutationSwaps?: number;
  /**
   * Permutation Markov chain. `"swap"` (default) is the practical
   * variant — direct value-swaps within Z-neighbourhoods, fast but the
   * stationary distribution is only approximately uniform over the
   * matching polytope. `"matching"` is the formal Kim et al. (2022)
   * Algorithm 1 — tracks π explicitly and accepts only swaps that
   * respect both endpoints' Z-NN constraints. Strictly more rigorous,
   * at the cost of higher reject rates (so use more swaps for the same
   * mixing).
   */
  permutationMode?: "swap" | "matching";
  /** Deterministic seed for the permutation RNG. Default Date.now(). */
  seed?: number;
}

/** Tiny LCG — same constants we use elsewhere in the discovery suite.
 *  Returned values are in [0, 1). */
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  if (state === 0) state = 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * Build a locally-permuted copy of `x` via random-walk swaps. Each
 * swap exchanges X_i and X_j where j is randomly chosen from i's Z-
 * neighbourhood. Approximates a draw from the conditional permutation
 * distribution X | (Y, Z); see Kim et al. (2022, "Local Permutation
 * Test for Conditional Independence") for the formal treatment.
 *
 * Stationary distribution: NOT uniform over the matching polytope —
 * direct swaps on the value array don't enforce the bijection
 * constraint that π(j) must also be a valid Z-neighbour of i (only
 * the forward direction is checked). For a uniform sample over the
 * matching polytope use `localMatchingPermutation` instead.
 */
function localPermuteX(
  x: number[],
  zNeighbours: number[][],
  nSwaps: number,
  rng: () => number,
): number[] {
  const N = x.length;
  const out = x.slice();
  for (let s = 0; s < nSwaps; s++) {
    const i = Math.floor(rng() * N);
    const neighbours = zNeighbours[i];
    if (neighbours.length === 0) continue;
    const j = neighbours[Math.floor(rng() * neighbours.length)];
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/**
 * Formal Kim et al. (2022) Algorithm 1 — Markov chain over the matching
 * polytope. Tracks the permutation π explicitly. At each step propose
 * swapping π(i) ↔ π(j); accept iff the resulting assignment respects
 * BOTH endpoints' Z-neighbourhood constraints:
 *   π'(i) ∈ NN_Z(i) ∪ {i}  AND  π'(j) ∈ NN_Z(j) ∪ {j}
 * The bijection constraint (only valid swaps) makes the stationary
 * distribution uniform over the matching polytope — strictly more
 * rigorous than the direct-swap chain in `localPermuteX`, at the cost
 * of higher reject rates (and so longer mixing time).
 *
 * Returns the permutation array; apply via `applyPermutationToX`.
 */
function localMatchingPermutation(
  zNeighbours: number[][],
  nSwaps: number,
  rng: () => number,
): number[] {
  const N = zNeighbours.length;
  const pi = Array.from({ length: N }, (_, i) => i);
  // Per-i neighbour sets for O(1) lookup. Include self so the identity
  // permutation is always a valid start state.
  const nnSet: Set<number>[] = zNeighbours.map((arr) => {
    const s = new Set(arr);
    return s;
  });

  for (let s = 0; s < nSwaps; s++) {
    const i = Math.floor(rng() * N);
    const j = Math.floor(rng() * N);
    if (i === j) continue;
    const newPiI = pi[j]; // would assign pi[j] to position i
    const newPiJ = pi[i]; // would assign pi[i] to position j
    const validI = newPiI === i || nnSet[i].has(newPiI);
    const validJ = newPiJ === j || nnSet[j].has(newPiJ);
    if (validI && validJ) {
      pi[i] = newPiI;
      pi[j] = newPiJ;
    }
  }
  return pi;
}

/** Apply a permutation to an X array: out[i] = x[π[i]]. */
function applyPermutationToX(x: number[], pi: number[]): number[] {
  const out = new Array<number>(x.length);
  for (let i = 0; i < pi.length; i++) out[i] = x[pi[i]];
  return out;
}

/**
 * Empirical p-value for H0: X ⊥ Y | Z via the local-permutation test.
 * Returns the standard (1 + ge) / (1 + B) form with +1 smoothing so
 * the p-value is never 0 (which would mean "infinitely confident in
 * dependence" — Monte-Carlo error makes that overclaim).
 */
function localPermutationPValue(
  x: number[],
  y: number[],
  Z: number[][],
  observedCmi: number,
  k: number,
  kPerm: number,
  nPermutations: number,
  nSwaps: number,
  rng: () => number,
  mode: "swap" | "matching",
): number {
  const N = x.length;
  const nCond = Z.length === 0 ? 0 : Z[0].length;
  // Pre-build the Z-neighbourhood list once. When |Z|=0, every other
  // sample is a valid swap partner (the "unconditional" baseline).
  const zNeighbours: number[][] = new Array(N);
  if (nCond > 0) {
    const zTree = buildKdTree(Z);
    for (let i = 0; i < N; i++) {
      const nn = kNearest(zTree, Z[i], kPerm, i);
      zNeighbours[i] = nn.map((n) => n.index);
    }
  } else {
    for (let i = 0; i < N; i++) {
      const all: number[] = [];
      for (let j = 0; j < N; j++) if (j !== i) all.push(j);
      zNeighbours[i] = all;
    }
  }

  let ge = 0;
  for (let b = 0; b < nPermutations; b++) {
    let xPerm: number[];
    if (mode === "matching") {
      const pi = localMatchingPermutation(zNeighbours, nSwaps, rng);
      xPerm = applyPermutationToX(x, pi);
    } else {
      xPerm = localPermuteX(x, zNeighbours, nSwaps, rng);
    }
    const cmiPerm = cmiKnn(xPerm, y, Z, k);
    if (cmiPerm >= observedCmi) ge += 1;
  }
  // +1 smoothing — p-value is never exactly 0.
  return (1 + ge) / (1 + nPermutations);
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

  const nPermutations = options?.nPermutations ?? 0;
  if (nPermutations > 0) {
    const kPerm = Math.min(options?.kPerm ?? 10, n - 1);
    const nSwaps = options?.nPermutationSwaps ?? 5 * n;
    const rng = makeRng(options?.seed ?? Date.now());
    const mode = options?.permutationMode ?? "swap";
    const pValue = localPermutationPValue(
      xc,
      yc,
      Zc,
      cmi,
      k,
      kPerm,
      nPermutations,
      nSwaps,
      rng,
      mode,
    );
    return { r: cmi, p: pValue, n };
  }

  // Default: χ²(1) asymptotic — fast, v0.6 behaviour.
  const stat = 2 * n * cmi;
  const pValue = 1 - chi2Cdf1(stat);
  return { r: cmi, p: pValue, n };
}
