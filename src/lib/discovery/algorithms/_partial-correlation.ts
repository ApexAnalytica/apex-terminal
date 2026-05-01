// ─── Partial Correlation (linear, Gaussian) ──────────────────────────
//
// For continuous variables under a linear-Gaussian assumption, partial
// correlation is the canonical conditional-independence test:
//
//   ρ(X, Y | Z) = corr(residuals(X | Z), residuals(Y | Z))
//
// Convert to a Fisher z-statistic
//
//   z = ½ · ln((1+r)/(1-r)) · √(N − |Z| − 3)
//
// and compare to a normal CDF for a two-sided p-value.
//
// Limitations (honest):
//   - Linear association only; nonlinear deps go undetected.
//   - Gaussian noise assumption for the p-value; departures bias p.
//   - Partial-correlation CI testing is what classical PCMCI+ ships
//     with as a baseline (`ParCorr` in tigramite). Nonparametric
//     variants (CMI-knn, GP-DC) are the upgrade path.

import { olsResiduals } from "./_linalg";

export interface PartialCorrelationResult {
  r: number;
  /** Fisher-z statistic (signed). */
  z: number;
  /** Two-sided p-value via normal-CDF approximation. */
  p: number;
  /** Effective sample size after dropping NaN-pair entries. */
  n: number;
}

// Standard normal CDF via Abramowitz & Stegun 26.2.17.
function normalCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * ax);
  const y =
    1 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

function pearson(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i];
    sy += y[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  if (denom === 0) return 0;
  return num / denom;
}

/**
 * Partial correlation of x and y, conditioning on the columns of Z.
 *
 * Inputs are length-N arrays. Z is N×|Z| (each Z[i] is a row, the
 * conditioning vector at observation i). Pass `Z = []` for plain
 * correlation. NaN/Infinity entries on any of x/y/Z[i][j] cause the
 * row to be dropped.
 *
 * An intercept column is added internally — pass Z without one.
 *
 * Returns null if (a) the design matrix is rank-deficient, (b) the
 * effective sample size after NaN-drop is below `min_n`.
 */
export function partialCorrelation(
  x: number[],
  y: number[],
  Z: number[][],
  options?: { min_n?: number },
): PartialCorrelationResult | null {
  const min_n = options?.min_n ?? 10;
  const N = x.length;
  if (y.length !== N) throw new Error("partialCorrelation: x/y length mismatch");
  if (Z.length !== 0 && Z.length !== N) {
    throw new Error("partialCorrelation: Z row count mismatch");
  }
  const nCond = Z.length === 0 ? 0 : Z[0].length;

  // Drop rows with any non-finite value across x, y, and Z[i].
  const xc: number[] = [];
  const yc: number[] = [];
  const Zc: number[][] = [];
  for (let i = 0; i < N; i++) {
    const xi = x[i];
    const yi = y[i];
    if (!Number.isFinite(xi) || !Number.isFinite(yi)) continue;
    if (nCond > 0) {
      const row = Z[i];
      let ok = true;
      for (let j = 0; j < nCond; j++) {
        if (!Number.isFinite(row[j])) { ok = false; break; }
      }
      if (!ok) continue;
      Zc.push(row);
    }
    xc.push(xi);
    yc.push(yi);
  }

  const n = xc.length;
  if (n < min_n) return null;

  let rxz: number[];
  let ryz: number[];

  if (nCond === 0) {
    rxz = xc;
    ryz = yc;
  } else {
    // Augment Z with an intercept column.
    const Za = Zc.map((row) => [1, ...row]);
    const ex = olsResiduals(Za, xc);
    const ey = olsResiduals(Za, yc);
    if (!ex || !ey) return null; // rank-deficient
    rxz = ex;
    ryz = ey;
  }

  const r = pearson(rxz, ryz);
  // Clamp to avoid atanh(±1) → ±∞ for tiny n / perfect correlation.
  const rc = Math.max(-0.9999, Math.min(0.9999, r));
  const dfAdj = n - nCond - 3;
  if (dfAdj <= 0) return null;
  const z = 0.5 * Math.log((1 + rc) / (1 - rc)) * Math.sqrt(dfAdj);
  const p = 2 * (1 - normalCdf(Math.abs(z)));
  return { r, z, p, n };
}

/**
 * Stouffer's combination of K independent z-scores. Each input z is
 * already a standard-normal Fisher-z (variance 1 under H0), so the
 * combined statistic is Z = Σ z_i / √K, also ~ N(0,1) under H0.
 *
 * The `nCond` parameter is unused in the math (each input z already
 * baked it into the per-subject Fisher transform); it is kept on the
 * signature so callers reading the code see what conditioning level
 * the upstream test was at.
 */
export function combineFisherZ(
  results: { z: number; n: number }[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _nCond: number,
): { z: number; p: number } {
  const k = results.length;
  if (k === 0) return { z: 0, p: 1 };
  let zSum = 0;
  for (const r of results) zSum += r.z;
  const Z = zSum / Math.sqrt(k);
  const p = 2 * (1 - normalCdf(Math.abs(Z)));
  return { z: Z, p };
}
