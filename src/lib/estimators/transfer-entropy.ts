// Transfer entropy — directed information flow X → Y (Schreiber 2000).
//
//   TE(X → Y) = H(Y_fut, Y_past) + H(Y_past, X_past)
//             − H(Y_past) − H(Y_fut, Y_past, X_past)
//
// Binning-based plug-in estimator with Miller-Madow bias correction.
// Biased at small n but deterministic and dependency-free, which is what
// we need for a TS port. For higher-accuracy estimates on longer records,
// use the KSG k-NN estimator instead (not ported — needs a k-NN index).
//
// Ported from research/estimators/transfer_entropy.py and validated against
// the same reference fixture.

export interface TeOptions {
  nBins?: number;
  historyK?: number;
  historyL?: number;
}

export interface TeResult {
  teXy: number;
  teYx: number;
  nBins: number;
  historyK: number;
  historyL: number;
}

// Equal-frequency (quantile) binning — robust to heavy tails.
// Ranks are computed with stable tie-breaking by index so output is
// deterministic across engines (numpy quicksort is not stable but the
// double-argsort pattern produces the same ranks when no ties exist,
// which is the case on the validation fixtures).
function quantileBin(x: ArrayLike<number>, nBins: number): Int32Array {
  const n = x.length;
  const order = new Int32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  // Stable sort of indices by value, then by index as tiebreaker.
  const arr = Array.from(order).sort((a, b) => {
    const d = (x[a] as number) - (x[b] as number);
    return d !== 0 ? d : a - b;
  });
  const ranks = new Int32Array(n);
  for (let r = 0; r < n; r++) ranks[arr[r]] = r;
  const bins = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    // Match numpy: `(rank * n_bins) // n`, clipped to [0, n_bins-1].
    let b = Math.floor((ranks[i] * nBins) / n);
    if (b < 0) b = 0;
    else if (b >= nBins) b = nBins - 1;
    bins[i] = b;
  }
  return bins;
}

// Count unique integer tuples via mixed-radix hashing into a bincount.
function jointCount(cols: Int32Array[], nBins: number): Int32Array {
  const n = cols[0].length;
  const nc = cols.length;
  const codes = new Float64Array(n); // may exceed 2^31
  for (let i = 0; i < n; i++) {
    let c = 0;
    for (let j = 0; j < nc; j++) c = c * nBins + cols[j][i];
    codes[i] = c;
  }
  let maxCode = 0;
  for (let i = 0; i < n; i++) if (codes[i] > maxCode) maxCode = codes[i];
  const h = new Int32Array(maxCode + 1);
  for (let i = 0; i < n; i++) h[codes[i]]++;
  return h;
}

// Plug-in Shannon entropy (nats) with Miller-Madow correction.
function entropy(counts: Int32Array): number {
  let n = 0;
  for (let i = 0; i < counts.length; i++) n += counts[i];
  if (n === 0) return 0;
  let H = 0;
  let kHat = 0;
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] > 0) {
      const p = counts[i] / n;
      H -= p * Math.log(p);
      kHat++;
    }
  }
  if (kHat > 1) H += (kHat - 1) / (2 * n);
  return H;
}

// Build a k-lagged window and flatten each row to a mixed-radix code.
function laggedCode(
  binned: Int32Array,
  start: number,
  lag: number,
  nBins: number,
): Int32Array {
  // Row i corresponds to original index start + i. We want indices
  //   [start - 1 - j,  start - 1 - j + rows,  ...] for j = 0..lag-1.
  const rows = binned.length - start;
  const out = new Int32Array(rows);
  for (let i = 0; i < rows; i++) {
    let code = 0;
    for (let j = 0; j < lag; j++) {
      code = code * nBins + binned[start - 1 - j + i];
    }
    out[i] = code;
  }
  return out;
}

function directedTe(
  src: Int32Array,
  dst: Int32Array,
  k: number,
  l: number,
  nBins: number,
): number {
  const T = Math.max(k, l);
  // dst_fut is a single column; we still encode it in the mixed-radix
  // space alongside lag-flattened src_past/dst_past.
  const rows = dst.length - T;
  const dstFut = new Int32Array(rows);
  for (let i = 0; i < rows; i++) dstFut[i] = dst[T + i];

  const dstPast = laggedCode(dst, T, l, nBins);
  const srcPast = laggedCode(src, T, k, nBins);

  // The Python implementation uses eff_bins = max(n_bins^max(k,l), n_bins)
  // so every col's contribution to the hash fits a common radix. We
  // preserve that: each col (flat code) already lives in [0, eff_bins).
  const effBins = Math.max(Math.pow(nBins, Math.max(k, l)), nBins);

  const Hfp = entropy(jointCount([dstFut, dstPast], effBins));
  const Hfps = entropy(jointCount([dstFut, dstPast, srcPast], effBins));
  const Hp = entropy(jointCount([dstPast], effBins));
  const Hps = entropy(jointCount([dstPast, srcPast], effBins));

  const te = Hfp + Hps - Hp - Hfps;
  // Clip small negative finite-sample noise (Miller-Madow artifact).
  return te > 0 ? te : 0;
}

export function transferEntropy(
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  opts: TeOptions = {},
): TeResult {
  const nBins = opts.nBins ?? 4;
  const historyK = opts.historyK ?? 1;
  const historyL = opts.historyL ?? 1;
  if (x.length !== y.length) {
    throw new Error(`series must be equal length, got ${x.length} vs ${y.length}`);
  }
  const bx = quantileBin(x, nBins);
  const by = quantileBin(y, nBins);
  const teXy = directedTe(bx, by, historyK, historyL, nBins);
  const teYx = directedTe(by, bx, historyL, historyK, nBins);
  return { teXy, teYx, nBins, historyK, historyL };
}
