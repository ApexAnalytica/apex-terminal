// Bayesian Online Change-Point Detection (Adams & MacKay 2007).
//
// Student-t posterior predictive from a Normal-Inverse-Gamma conjugate prior
// on (mean, variance) of Gaussian observations. With constant hazard H the
// posterior P(r_t = 0) ≡ H — not a useful change-point score — so we expose:
//
//   - runLengthPosterior  (T × T+1)
//   - mapRunLength        per-step argmax
//   - newRunProb          P(r_t < cpWindow): the trace to threshold
//   - predictiveMean / logEvidence
//
// Ported from research/estimators/bocpd.py; validated against the same
// reference fixture (src/lib/__tests__/estimators/fixtures/bocpd_reference.json).

export interface BocpdOptions {
  hazard?: number;
  mu0?: number;
  kappa0?: number;
  alpha0?: number;
  beta0?: number;
  cpWindow?: number;
}

export interface BocpdResult {
  runLengthPosterior: number[][];
  mapRunLength: number[];
  newRunProb: number[];
  predictiveMean: number[];
  logEvidence: number[];
  cpWindow: number;
}

// Lanczos approximation to log Γ, accurate to ~1e-13 on ℝ⁺.
const LANCZOS_G = 7;
const LANCZOS_C = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function lgamma(x: number): number {
  if (x < 0.5) {
    // Reflection: Γ(x)Γ(1-x) = π / sin(πx)
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  }
  x -= 1;
  let a = LANCZOS_C[0];
  const t = x + LANCZOS_G + 0.5;
  for (let i = 1; i < LANCZOS_C.length; i++) a += LANCZOS_C[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

export function logsumexp(a: number[]): number {
  let m = -Infinity;
  for (const v of a) if (v > m) m = v;
  if (!Number.isFinite(m)) return m;
  let s = 0;
  for (const v of a) s += Math.exp(v - m);
  return m + Math.log(s);
}

// Student-t log-density at scalar x with df, loc, scale.
function studentTLogpdf(x: number, df: number, loc: number, scale: number): number {
  const z = (x - loc) / scale;
  return (
    lgamma((df + 1) / 2) -
    lgamma(df / 2) -
    0.5 * Math.log(df * Math.PI) -
    Math.log(scale) -
    ((df + 1) / 2) * Math.log1p((z * z) / df)
  );
}

export function bocpd(x: ArrayLike<number>, opts: BocpdOptions = {}): BocpdResult {
  const hazard = opts.hazard ?? 1 / 250;
  const mu0 = opts.mu0 ?? 0;
  const kappa0 = opts.kappa0 ?? 1;
  const alpha0 = opts.alpha0 ?? 1;
  const beta0 = opts.beta0 ?? 1;
  const cpWindow = opts.cpWindow ?? 20;

  const T = x.length;
  const logH = Math.log(hazard);
  const log1mH = Math.log1p(-hazard);

  // log_R[t][r] in log-domain, shape (T+1, T+1), init to -Infinity.
  const logR: number[][] = new Array(T + 1);
  for (let t = 0; t <= T; t++) logR[t] = new Array(T + 1).fill(-Infinity);
  logR[0][0] = 0;

  let mu = [mu0];
  let kappa = [kappa0];
  let alpha = [alpha0];
  let beta = [beta0];

  const predictiveMean = new Array<number>(T).fill(0);
  const logEvidence = new Array<number>(T).fill(0);

  for (let t = 0; t < T; t++) {
    const xt = x[t];
    const nr = mu.length; // = t + 1
    const logPred = new Array<number>(nr);
    for (let r = 0; r < nr; r++) {
      const df = 2 * alpha[r];
      const scale = Math.sqrt((beta[r] * (kappa[r] + 1)) / (alpha[r] * kappa[r]));
      logPred[r] = studentTLogpdf(xt, df, mu[r], scale);
    }

    const prev = logR[t].slice(0, nr);
    // joint(r_t = r+1) = prev[r] + logPred[r] + log(1 - h)
    const logGrowth = new Array<number>(nr);
    const combined = new Array<number>(nr);
    for (let r = 0; r < nr; r++) {
      logGrowth[r] = prev[r] + logPred[r] + log1mH;
      combined[r] = prev[r] + logPred[r];
    }
    const logCp = logsumexp(combined) + logH;

    logR[t + 1][0] = logCp;
    for (let r = 0; r < nr; r++) logR[t + 1][r + 1] = logGrowth[r];

    // log evidence at step t = logsumexp over row 0..t+1
    const row = logR[t + 1].slice(0, nr + 1);
    const logEv = logsumexp(row);
    logEvidence[t] = logEv;

    // Normalize row to posterior.
    for (let r = 0; r <= nr; r++) logR[t + 1][r] -= logEv;

    // Predictive mean weighted by run-length posterior; mu extended with prior.
    const muExt = [mu0, ...mu];
    let pm = 0;
    for (let r = 0; r <= nr; r++) pm += Math.exp(logR[t + 1][r]) * muExt[r];
    predictiveMean[t] = pm;

    // NIG sufficient-statistic updates (Murphy 2007 §3).
    const kappaNew = new Array<number>(nr);
    const muNew = new Array<number>(nr);
    const alphaNew = new Array<number>(nr);
    const betaNew = new Array<number>(nr);
    for (let r = 0; r < nr; r++) {
      kappaNew[r] = kappa[r] + 1;
      muNew[r] = (kappa[r] * mu[r] + xt) / kappaNew[r];
      alphaNew[r] = alpha[r] + 0.5;
      betaNew[r] = beta[r] + (kappa[r] * (xt - mu[r]) * (xt - mu[r])) / (2 * kappaNew[r]);
    }
    mu = [mu0, ...muNew];
    kappa = [kappa0, ...kappaNew];
    alpha = [alpha0, ...alphaNew];
    beta = [beta0, ...betaNew];
  }

  const runLengthPosterior: number[][] = new Array(T);
  const mapRunLength = new Array<number>(T).fill(0);
  const newRunProb = new Array<number>(T).fill(0);
  for (let t = 0; t < T; t++) {
    const row = new Array<number>(T + 1);
    let best = -Infinity;
    let bestIdx = 0;
    let winSum = 0;
    for (let r = 0; r <= T; r++) {
      const p = Math.exp(logR[t + 1][r]);
      row[r] = p;
      if (p > best) {
        best = p;
        bestIdx = r;
      }
      if (r < cpWindow) winSum += p;
    }
    runLengthPosterior[t] = row;
    mapRunLength[t] = bestIdx;
    newRunProb[t] = winSum;
  }

  return {
    runLengthPosterior,
    mapRunLength,
    newRunProb,
    predictiveMean,
    logEvidence,
    cpWindow,
  };
}

export function detectChangepointsFromMap(
  mapRunLength: ArrayLike<number>,
  minDrop = 10,
  refractory = 10,
): number[] {
  const out: number[] = [];
  let last = -refractory - 1;
  for (let i = 1; i < mapRunLength.length; i++) {
    if (mapRunLength[i] - mapRunLength[i - 1] < -minDrop) {
      if (i - last >= refractory) {
        out.push(i);
        last = i;
      }
    }
  }
  return out;
}
