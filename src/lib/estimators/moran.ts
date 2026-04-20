// Global Moran's I + Wartenberg 1985 bivariate Moran's I.
//
//   I(x)     = (n / S0) · (z^T W z) / (z^T z),   z = x - mean(x)
//   I_xy     = (n / S0) · (zx^T W zy) / sqrt((zx^T zx)(zy^T zy))
//   S0       = Σ_ij W_ij
//
// Weights W are row-standardized symmetric-averaged k-NN by default —
// each row has k entries of 1/k, then (W + W^T)/2 for symmetry.
//
// Ported from research/estimators/spatial_coupling.py; validated against
// the same reference fixture (identical W to eliminate k-NN tie-break
// differences across numpy/sklearn vs TS).

export interface MoranResult {
  I: number;
  expected: number;
  pPerm: number;
  nPermutations: number;
}

export type WeightMatrix = number[][];

// Brute-force k-nearest-neighbors on 2-D or n-D Euclidean coords.
// Ties broken by original index (ascending) to mirror sklearn's default
// stable ordering for equal-distance neighbors.
export function knnWeights(
  coords: ArrayLike<ArrayLike<number>>,
  k: number,
): WeightMatrix {
  const n = coords.length;
  const W: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const pts: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = coords[i];
    const arr = new Array<number>(row.length);
    for (let j = 0; j < row.length; j++) arr[j] = row[j] as number;
    pts.push(arr);
  }

  for (let i = 0; i < n; i++) {
    const dists: { j: number; d: number }[] = [];
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      let d2 = 0;
      for (let dim = 0; dim < pts[i].length; dim++) {
        const diff = pts[i][dim] - pts[j][dim];
        d2 += diff * diff;
      }
      dists.push({ j, d: d2 });
    }
    dists.sort((a, b) => (a.d !== b.d ? a.d - b.d : a.j - b.j));
    for (let m = 0; m < k; m++) {
      W[i][dists[m].j] = 1 / k;
    }
  }

  // Symmetrize: (W + W^T) / 2
  const S: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      S[i][j] = 0.5 * (W[i][j] + W[j][i]);
    }
  }
  return S;
}

function mean(x: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i];
  return s / x.length;
}

// Sparse-aware z^T W z: iterate non-zeros of W.
function quadForm(
  zRow: Float64Array,
  W: WeightMatrix,
  zCol: Float64Array,
): number {
  let s = 0;
  const n = zRow.length;
  for (let i = 0; i < n; i++) {
    const wi = W[i];
    let rowSum = 0;
    for (let j = 0; j < n; j++) {
      if (wi[j] !== 0) rowSum += wi[j] * zCol[j];
    }
    s += zRow[i] * rowSum;
  }
  return s;
}

// Minimal PCG-style RNG so permutation p-values are deterministic in
// TS. This does NOT reproduce numpy's PCG64 — we just need a
// deterministic Fisher-Yates shuffle keyed by seed.
class LcgRng {
  private state: number;
  constructor(seed: number) {
    // Mix seed to avoid poor first outputs.
    let s = (seed >>> 0) + 0x9e3779b9;
    s = Math.imul(s ^ (s >>> 16), 0x85ebca6b);
    s = Math.imul(s ^ (s >>> 13), 0xc2b2ae35);
    this.state = (s ^ (s >>> 16)) >>> 0 || 0x9e3779b9;
  }
  next(): number {
    // xorshift32
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0x100000000;
  }
}

function shuffled(z: Float64Array, rng: LcgRng): Float64Array {
  const out = new Float64Array(z);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return out;
}

export function moransI(
  x: ArrayLike<number>,
  W: WeightMatrix,
  opts: { nPermutations?: number; seed?: number } = {},
): MoranResult {
  const nPermutations = opts.nPermutations ?? 199;
  const seed = opts.seed ?? 0;
  const n = x.length;
  const mx = mean(x);
  const z = new Float64Array(n);
  let denom = 0;
  for (let i = 0; i < n; i++) {
    z[i] = x[i] - mx;
    denom += z[i] * z[i];
  }
  const expected = -1 / Math.max(n - 1, 1);
  if (denom <= 0) {
    return { I: 0, expected, pPerm: 1, nPermutations };
  }
  let S0 = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) S0 += W[i][j];
  }
  const num = quadForm(z, W, z);
  const I = (n / S0) * (num / denom);

  const rng = new LcgRng(seed);
  const dev = Math.abs(I - expected);
  let extreme = 0;
  for (let t = 0; t < nPermutations; t++) {
    const zp = shuffled(z, rng);
    const numP = quadForm(zp, W, zp);
    const Ip = (n / S0) * (numP / denom);
    if (Math.abs(Ip - expected) >= dev) extreme++;
  }
  return { I, expected, pPerm: extreme / nPermutations, nPermutations };
}

export function bivariateMoransI(
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  W: WeightMatrix,
): number {
  const n = x.length;
  const mx = mean(x);
  const my = mean(y);
  const zx = new Float64Array(n);
  const zy = new Float64Array(n);
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    zx[i] = x[i] - mx;
    zy[i] = y[i] - my;
    sx += zx[i] * zx[i];
    sy += zy[i] * zy[i];
  }
  let S0 = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) S0 += W[i][j];
  }
  const denom = Math.sqrt(sx * sy);
  if (denom <= 0) return 0;
  const num = quadForm(zx, W, zy);
  return ((n / S0) * num) / denom;
}
