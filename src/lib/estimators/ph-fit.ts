// Persistent-homology β₁ template fit
// ─────────────────────────────────────────────────────────────────────────────
// The Pareto panel's PH model overlays an analytic β₁ collapse curve onto the
// empirical β₁ filtration computed from the live graph. The curve has the
// form:
//
//   β₁(t) = amp · rise(t; riseExp, clusterFrac) · collapse(t; center, rate)
//
// where:
//   rise(t)     = t^riseExp · (1 + clusterFrac · 0.5)
//   collapse(t) = exp(−rate · max(0, t − center)²)
//
// Previously the three shape parameters (riseExp, center, rate) were hardcoded
// to (0.6, 0.7, 2). Since the relevance system uses PH in its Akaike-weight
// comparison against CSD and LPPLS, a fixed-template curve meant PH entered
// the comparison with freeParams = 0 — no AIC penalty, inflating its evidence
// weight whenever the template happened to track empirical β₁.
//
// This module fits (riseExp, center, rate) by coarse-to-fine grid search so
// PH's AIC term has k = 3 like LPPLS, and its fit quality (F) reflects a real
// optimisation instead of a lucky template match. Amplitude and cluster-
// coupling remain structural (tied to graph geometry, not fit), so the fitted
// curve still represents a topological story rather than arbitrary regression.

export interface PhFitOptions {
  /** clusterFrac from the graph — fraction of nodes with Ω > 7; coupling stays structural. */
  clusterFrac: number;
  /** Amplitude scale. Kept fixed to match the prior template's overall magnitude. */
  amp?: number;
  /** Coarse grid step counts (default 11 per axis). */
  steps?: number;
  /** Refine-pass step count (default 7). */
  refineSteps?: number;
  /** Refine-pass radius as a fraction of coarse step (default 1.5). */
  refineSpan?: number;
  /** Seed parameters; the prior hardcoded defaults are always evaluated regardless. */
  seed?: { riseExp: number; center: number; rate: number };
}

export interface PhFitResult {
  riseExp: number;
  center: number;
  rate: number;
  /** Fitted curve at the observed indices (length matches `observed`). */
  modelSeries: number[];
  ssRes: number;
  rSquared: number;
  evaluations: number;
}

const DEFAULT_BOUNDS = {
  riseExp: { min: 0.2, max: 1.2 },
  center: { min: 0.4, max: 0.95 },
  rate: { min: 0.5, max: 4.0 },
} as const;

const HARDCODED_PRIOR = { riseExp: 0.6, center: 0.7, rate: 2.0 };
const DEFAULT_AMP = 0.8;

/** Single β₁ sample at normalised filtration position t ∈ [0, 1]. */
export function bettiSample(
  t: number,
  riseExp: number,
  center: number,
  rate: number,
  clusterFrac: number,
  amp = DEFAULT_AMP,
): number {
  const rise = Math.pow(t, riseExp) * (1 + clusterFrac * 0.5);
  const collapse = Math.exp(-rate * Math.pow(Math.max(0, t - center), 2));
  const y = rise * collapse * amp;
  if (y < 0) return 0;
  if (y > 1) return 1;
  return y;
}

/** Generate a template β₁ curve of length n over normalised filtration [0, 1]. */
export function bettiSeries(
  n: number,
  riseExp: number,
  center: number,
  rate: number,
  clusterFrac: number,
  amp = DEFAULT_AMP,
): number[] {
  const out = new Array<number>(n);
  const denom = Math.max(1, n - 1);
  for (let i = 0; i < n; i++) {
    out[i] = bettiSample(i / denom, riseExp, center, rate, clusterFrac, amp);
  }
  return out;
}

/**
 * Fit the β₁ template to an empirical β₁ filtration curve by grid search over
 * (riseExp, center, rate). Amplitude is held at `amp` and cluster-fraction
 * coupling is structural. Returns the best-SSE triple and the corresponding
 * series plus R² against `observed`.
 *
 * Degenerate inputs (n < 3) return the prior hardcoded defaults; at that size
 * there is no meaningful fit to perform.
 */
export function fitBettiTemplate(
  observed: number[],
  options: PhFitOptions,
): PhFitResult {
  const n = observed.length;
  const amp = options.amp ?? DEFAULT_AMP;
  const steps = options.steps ?? 11;
  const refineSteps = options.refineSteps ?? 7;
  const refineSpan = options.refineSpan ?? 1.5;

  if (n < 3) {
    const params = options.seed ?? HARDCODED_PRIOR;
    const modelSeries = bettiSeries(n, params.riseExp, params.center, params.rate, options.clusterFrac, amp);
    return { ...params, modelSeries, ssRes: 0, rSquared: 0, evaluations: 0 };
  }

  const denom = n - 1;
  const sse = (riseExp: number, center: number, rate: number): number => {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const y = bettiSample(i / denom, riseExp, center, rate, options.clusterFrac, amp);
      const e = observed[i] - y;
      s += e * e;
    }
    return s;
  };

  let best = { riseExp: NaN, center: NaN, rate: NaN, ssRes: Number.POSITIVE_INFINITY };
  let evaluations = 0;
  const update = (riseExp: number, center: number, rate: number) => {
    const s = sse(riseExp, center, rate);
    evaluations++;
    if (s < best.ssRes) best = { riseExp, center, rate, ssRes: s };
  };

  // Always evaluate the prior so we can't regress below the hardcoded template.
  update(HARDCODED_PRIOR.riseExp, HARDCODED_PRIOR.center, HARDCODED_PRIOR.rate);
  if (options.seed) {
    update(options.seed.riseExp, options.seed.center, options.seed.rate);
  }

  // Coarse pass
  const riseGrid = linspace(DEFAULT_BOUNDS.riseExp.min, DEFAULT_BOUNDS.riseExp.max, steps);
  const centerGrid = linspace(DEFAULT_BOUNDS.center.min, DEFAULT_BOUNDS.center.max, steps);
  const rateGrid = linspace(DEFAULT_BOUNDS.rate.min, DEFAULT_BOUNDS.rate.max, steps);
  for (const r of riseGrid) {
    for (const c of centerGrid) {
      for (const k of rateGrid) {
        update(r, c, k);
      }
    }
  }

  // Refine pass around the coarse best
  const riseStep = (DEFAULT_BOUNDS.riseExp.max - DEFAULT_BOUNDS.riseExp.min) / Math.max(1, steps - 1);
  const centerStep = (DEFAULT_BOUNDS.center.max - DEFAULT_BOUNDS.center.min) / Math.max(1, steps - 1);
  const rateStep = (DEFAULT_BOUNDS.rate.max - DEFAULT_BOUNDS.rate.min) / Math.max(1, steps - 1);
  const refineRise = refineWindow(best.riseExp, riseStep * refineSpan, refineSteps, DEFAULT_BOUNDS.riseExp);
  const refineCenter = refineWindow(best.center, centerStep * refineSpan, refineSteps, DEFAULT_BOUNDS.center);
  const refineRate = refineWindow(best.rate, rateStep * refineSpan, refineSteps, DEFAULT_BOUNDS.rate);
  for (const r of refineRise) {
    for (const c of refineCenter) {
      for (const k of refineRate) {
        update(r, c, k);
      }
    }
  }

  const modelSeries = bettiSeries(n, best.riseExp, best.center, best.rate, options.clusterFrac, amp);
  let mean = 0;
  for (const v of observed) mean += v;
  mean /= n;
  let ssTot = 0;
  for (const v of observed) ssTot += (v - mean) ** 2;
  const rSquared = ssTot > 0 ? Math.max(0, 1 - best.ssRes / ssTot) : 0;

  return {
    riseExp: best.riseExp,
    center: best.center,
    rate: best.rate,
    modelSeries,
    ssRes: best.ssRes,
    rSquared,
    evaluations,
  };
}

function linspace(min: number, max: number, steps: number): number[] {
  if (steps <= 1) return [min];
  const step = (max - min) / (steps - 1);
  const out = new Array<number>(steps);
  for (let i = 0; i < steps; i++) out[i] = min + i * step;
  return out;
}

function refineWindow(
  center: number,
  halfSpan: number,
  steps: number,
  bounds: { min: number; max: number },
): number[] {
  const lo = Math.max(bounds.min, center - halfSpan);
  const hi = Math.min(bounds.max, center + halfSpan);
  if (hi <= lo) return [center];
  return linspace(lo, hi, steps);
}
