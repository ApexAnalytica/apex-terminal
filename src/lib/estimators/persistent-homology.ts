// Persistent-homology utilities — Takens delay embedding + pairwise-distance
// helpers for scale-adaptive ε selection.
//
// The full β₁(ε) sliding-window computation requires a Vietoris-Rips
// persistence engine; the Python reference uses `ripser` (Cython). We
// deliberately do NOT port a Rips engine here — the criticality layer
// can bind a JS/WASM persistence backend later and use the embedding +
// median-distance helpers below to feed it.
//
// Ported from research/estimators/persistent_homology.py; the embedding
// and median pairwise distance match the Python reference exactly.

// Takens delay embedding of a 1-D signal.
// Returns an (n - (dim-1)*delay, dim) point cloud whose k-th row is
// [x_k, x_{k+delay}, ..., x_{k+(dim-1)*delay}].
export function takensEmbedding(
  x: ArrayLike<number>,
  dim = 3,
  delay = 1,
): number[][] {
  const n = x.length;
  const m = n - (dim - 1) * delay;
  if (m <= 0) {
    throw new Error(`signal too short (${n}) for embedding dim=${dim} delay=${delay}`);
  }
  const out: number[][] = new Array(m);
  for (let i = 0; i < m; i++) {
    const row = new Array<number>(dim);
    for (let k = 0; k < dim; k++) row[k] = x[i + k * delay] as number;
    out[i] = row;
  }
  return out;
}

// Euclidean pairwise distances, upper-triangular (i < j), as a flat array.
export function pairwiseDistancesUpper(points: ArrayLike<ArrayLike<number>>): number[] {
  const m = points.length;
  if (m < 2) return [];
  const dim = points[0].length;
  const out: number[] = new Array(((m * (m - 1)) / 2) | 0);
  let idx = 0;
  for (let i = 0; i < m; i++) {
    for (let j = i + 1; j < m; j++) {
      let d2 = 0;
      for (let k = 0; k < dim; k++) {
        const diff = (points[i][k] as number) - (points[j][k] as number);
        d2 += diff * diff;
      }
      out[idx++] = Math.sqrt(d2);
    }
  }
  return out;
}

// Median of an unsorted array. Matches numpy.median on even-length arrays
// (average of the two middle values after sorting).
export function median(values: ArrayLike<number>): number {
  const n = values.length;
  if (n === 0) return NaN;
  const arr = new Array<number>(n);
  for (let i = 0; i < n; i++) arr[i] = values[i] as number;
  arr.sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) return arr[mid];
  return 0.5 * (arr[mid - 1] + arr[mid]);
}

// Scale-adaptive default ε: median pairwise distance of an embedded
// window. Same convention as the Python reference.
export function medianPairwiseDistance(points: ArrayLike<ArrayLike<number>>): number {
  return median(pairwiseDistancesUpper(points));
}

// Types useful to a future Rips/persistence backend binding.
export interface PersistenceBar {
  birth: number;
  death: number;
}

export interface BettiAtEpsilon {
  beta1: number;
  maxPersistence: number;
}

// Count H₁ intervals alive at ε (birth ≤ ε < death), given a precomputed
// H₁ persistence diagram. Pair this with any JS/WASM Rips backend that
// returns the diagram for an embedded window.
export function betti1FromDiagram(
  h1: ArrayLike<PersistenceBar>,
  epsilon: number,
): BettiAtEpsilon {
  let alive = 0;
  let maxPers = 0;
  for (let i = 0; i < h1.length; i++) {
    const bar = h1[i];
    if (bar.birth <= epsilon && epsilon < bar.death) alive++;
    if (Number.isFinite(bar.death)) {
      const p = bar.death - bar.birth;
      if (p > maxPers) maxPers = p;
    }
  }
  return { beta1: alive, maxPersistence: maxPers };
}
