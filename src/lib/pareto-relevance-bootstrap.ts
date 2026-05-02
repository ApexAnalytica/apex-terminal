// Pareto relevance — bootstrap confidence intervals
// ─────────────────────────────────────────────────────────────────────────────
// Adds a confidence band around the F sub-score (out-of-sample NRMSE → exp(−NRMSE))
// and propagates it through the composite relevance formula:
//
//   composite = S · G · (FIT_WEIGHT · F + (1 − FIT_WEIGHT) · E)
//
// E, G, and S are point estimates of structural quantities (Akaike weights of
// the active model set, regime gates, sufficiency saturations) — they don't
// have a meaningful sampling distribution to bootstrap. F is the only piece
// driven by random draws from the residual distribution, so propagating
// uncertainty *only* through F is honest: the band reads as "given the
// observed residual variability, here's what the relevance number could
// have been."
//
// Method: moving-block bootstrap on the held-out residuals. Default block
// length = 1 (i.i.d. resampling). Use blockLength > 1 if the residuals are
// autocorrelated.
//
// Output: low/high quantile bounds on F and on the propagated composite,
// plus the raw bootstrap samples so downstream callers can compute a
// different confidence level without redoing the work.
//
// Determinism: callers can pass a seeded RNG. Tests use mulberry32 to make
// bootstrap distributions reproducible.

import {
  akaikeEvidenceWeights,
  PARETO_RELEVANCE_CONSTANTS,
  type ComposeOptions,
  type ConfidenceInterval,
  type ModelRelevanceInput,
  type RelevanceBreakdown,
  type SubScore,
} from "./pareto-relevance";

const C = PARETO_RELEVANCE_CONSTANTS;

// ─────────────────────────────────────────────────────────────────────────────
// Types

export interface BootstrapOptions {
  /** Number of bootstrap resamples. Default 500. */
  samples?: number;
  /** Block length for moving-block resampling. Default 1 (i.i.d.). */
  blockLength?: number;
  /** Confidence level in (0, 1). Default 0.9 → 5th/95th percentiles. */
  level?: number;
  /** Seeded PRNG returning [0, 1). Default Math.random. */
  rng?: () => number;
}

export interface BootstrapFitResult {
  /** Point-estimate F (matches outOfSampleFit when residuals are not resampled). */
  point: SubScore;
  /** Confidence interval on F. */
  ci: ConfidenceInterval;
  /** Bootstrap samples of F (length = options.samples). */
  samples: number[];
}

export interface BootstrapBreakdown extends RelevanceBreakdown {
  /** Confidence interval on the composite, propagated from F. */
  compositeCi: ConfidenceInterval;
  /** Confidence interval on F itself (the bootstrapped ingredient). */
  fCi: ConfidenceInterval;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API

/**
 * Block-bootstrap the F sub-score by resampling held-out residuals.
 *
 * For each bootstrap iteration:
 *   1. Draw k residuals from the held-out segment (moving-block bootstrap).
 *   2. Recompute RMSE, NRMSE, and F = exp(−NRMSE).
 * Returns the point estimate plus confidence bounds at the requested level.
 *
 * Returns `score = 0` and a degenerate CI when there aren't enough held-out
 * points — matches the behaviour of `outOfSampleFit`.
 */
export function bootstrapOutOfSampleFit(
  observed: number[],
  modelSeries: number[],
  options: BootstrapOptions = {},
): BootstrapFitResult {
  const samplesN = Math.max(1, Math.floor(options.samples ?? 500));
  const block = Math.max(1, Math.floor(options.blockLength ?? 1));
  const level = clampLevel(options.level ?? 0.9);
  const rng = options.rng ?? Math.random;

  const n = Math.min(observed.length, modelSeries.length);
  if (n < C.HOLDOUT_MIN + 2) {
    const point: SubScore = {
      score: 0,
      detail: `n=${n}; need ≥${C.HOLDOUT_MIN + 2} for held-out fit.`,
    };
    return {
      point,
      ci: { low: 0, high: 0, level },
      samples: new Array(samplesN).fill(0),
    };
  }

  const k = Math.max(C.HOLDOUT_MIN, Math.floor(n * C.HOLDOUT_FRACTION));
  const start = n - k;

  // Held-out actuals, predictions, residuals, and the holdout-mean stdev.
  const residuals = new Array<number>(k);
  const holdoutObs = new Array<number>(k);
  let mean = 0;
  for (let t = start; t < n; t++) mean += observed[t];
  mean /= k;
  let ssTotHoldout = 0;
  for (let t = start; t < n; t++) {
    const i = t - start;
    residuals[i] = observed[t] - modelSeries[t];
    holdoutObs[i] = observed[t];
    const d = observed[t] - mean;
    ssTotHoldout += d * d;
  }
  const stdev = Math.sqrt(
    Math.max(ssTotHoldout / k, C.MIN_RESIDUAL_VARIANCE),
  );

  // Point F (same calc as outOfSampleFit).
  let ssRes = 0;
  for (const r of residuals) ssRes += r * r;
  const pointRmse = Math.sqrt(ssRes / k);
  const pointNrmse = pointRmse / stdev;
  const pointScore = Math.max(
    0,
    Math.min(1, Math.exp(-C.NRMSE_DECAY * pointNrmse)),
  );
  const point: SubScore = {
    score: pointScore,
    detail: `Held-out NRMSE = ${pointNrmse.toFixed(3)} on last ${k} of ${n} pts.`,
  };

  // Bootstrap loop.
  // Moving-block bootstrap: pick a random start in [0, k - block + 1) and copy
  // `block` consecutive residuals; repeat until we have k residuals.
  const samples = new Array<number>(samplesN);
  const numStarts = Math.max(1, k - block + 1);
  for (let b = 0; b < samplesN; b++) {
    let bsSsRes = 0;
    let filled = 0;
    while (filled < k) {
      const startIdx = Math.floor(rng() * numStarts);
      const blkLen = Math.min(block, k - filled);
      for (let j = 0; j < blkLen; j++) {
        const r = residuals[startIdx + j];
        bsSsRes += r * r;
        filled++;
      }
    }
    const rmse = Math.sqrt(bsSsRes / k);
    const nrmse = rmse / stdev;
    samples[b] = Math.max(0, Math.min(1, Math.exp(-C.NRMSE_DECAY * nrmse)));
  }

  const ci = quantileBounds(samples, level);
  return { point, ci, samples };
}

/**
 * Compose a relevance breakdown with a bootstrap CI on the composite.
 *
 * Bootstraps F (the only stochastic ingredient), holds E/G/S fixed at their
 * point estimates, and propagates each F sample through the composite
 * formula. The CI on the composite is the requested-level quantile band of
 * those propagated values.
 *
 * Returns the same shape as the deterministic `RelevanceBreakdown` plus
 * `compositeCi` and `fCi`.
 */
export function bootstrapRelevance(
  m: ModelRelevanceInput & { evidence: SubScore },
  opts: {
    fitWeight?: number;
    bootstrap?: BootstrapOptions;
    consistency?: SubScore;
  } = {},
): BootstrapBreakdown {
  const fitWeight = opts.fitWeight ?? C.FIT_WEIGHT;
  const fit = bootstrapOutOfSampleFit(m.observed, m.modelSeries, opts.bootstrap);

  const E = m.evidence;
  const G = m.gate;
  const S = m.sufficiency;
  const M: SubScore = opts.consistency ?? {
    score: 1,
    detail: "no consistency input; M neutral.",
  };

  const pointQuality = fitWeight * fit.point.score + (1 - fitWeight) * E.score;
  const rawComposite = clamp01(S.score * G.score * M.score * pointQuality);

  // Propagate F samples through the composite formula. E/G/S/M held fixed.
  const compositeSamples = fit.samples.map((fSample) => {
    const q = fitWeight * fSample + (1 - fitWeight) * E.score;
    return clamp01(S.score * G.score * M.score * q);
  });
  const compositeCi = quantileBounds(
    compositeSamples,
    fit.ci.level,
  );

  return {
    F: fit.point,
    E,
    G,
    S,
    M,
    composite: rawComposite,
    rawComposite,
    fCi: fit.ci,
    compositeCi,
  };
}

/**
 * Batch equivalent of `computeRelevanceBatch` with bootstrap CI on every model.
 *
 * Mirrors the deterministic batch logic exactly (so the point estimates are
 * unchanged), but additionally bootstraps F per model and propagates the
 * samples through the composite formula to populate `compositeCi` and `fCi`.
 *
 * E is computed once across the batch (Akaike weights are inherently relative)
 * and held at its point estimate during propagation — we don't try to
 * bootstrap E because its sampling distribution is structurally different
 * (relative weights, not residual-driven).
 *
 * EMA smoothing of the composite is applied to the *point* composite, same as
 * the deterministic path. The CI bounds are not smoothed across renders —
 * each render's CI is the standalone bootstrap distribution at that snapshot.
 */
export function bootstrapRelevanceBatch(
  inputs: ReadonlyArray<ModelRelevanceInput>,
  options: ComposeOptions & { bootstrap?: BootstrapOptions } = {},
): Map<string, RelevanceBreakdown> {
  const fitWeight = options.fitWeight ?? C.FIT_WEIGHT;
  const emaAlpha = options.emaAlpha ?? C.EMA_ALPHA;
  const previous = toMap(options.previous);
  const bootOpts = options.bootstrap ?? {};
  const M: SubScore = options.consistency ?? {
    score: 1,
    detail: "no consistency input; M neutral.",
  };

  const evidence = akaikeEvidenceWeights(inputs);
  const out = new Map<string, RelevanceBreakdown>();

  for (const m of inputs) {
    const E = evidence.get(m.key) ?? { score: 0, detail: "No evidence weight." };
    const G = m.gate;
    const S = m.sufficiency;

    const fit = bootstrapOutOfSampleFit(m.observed, m.modelSeries, bootOpts);
    const F = fit.point;

    const quality = fitWeight * F.score + (1 - fitWeight) * E.score;
    const rawComposite = clamp01(S.score * G.score * M.score * quality);

    const prev = previous.get(m.key);
    const composite =
      typeof prev === "number" && Number.isFinite(prev)
        ? clamp01((1 - emaAlpha) * prev + emaAlpha * rawComposite)
        : rawComposite;

    // Propagate F samples through the composite formula.
    // E/G/S/M held fixed at point estimates — see pareto-relevance.ts header
    // for the rationale on why F is the only stochastic ingredient.
    const compositeSamples = fit.samples.map((fSample) => {
      const q = fitWeight * fSample + (1 - fitWeight) * E.score;
      return clamp01(S.score * G.score * M.score * q);
    });
    const compositeCi = quantileBounds(compositeSamples, fit.ci.level);

    out.set(m.key, {
      F,
      E,
      G,
      S,
      M,
      composite,
      rawComposite,
      compositeCi,
      fCi: fit.ci,
    });
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers

function clampLevel(level: number): number {
  if (!Number.isFinite(level) || level <= 0) return 0.9;
  if (level >= 1) return 0.999;
  return level;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * Inclusive linear-interpolation quantile bounds at the given confidence
 * level. For level=0.9, returns 5th and 95th percentiles.
 */
export function quantileBounds(
  samples: ReadonlyArray<number>,
  level: number,
): ConfidenceInterval {
  if (samples.length === 0) return { low: 0, high: 0, level };
  const sorted = [...samples].sort((a, b) => a - b);
  const lo = (1 - level) / 2;
  const hi = 1 - lo;
  return {
    low: linearQuantile(sorted, lo),
    high: linearQuantile(sorted, hi),
    level,
  };
}

function toMap(
  src: Map<string, number> | Record<string, number> | undefined,
): Map<string, number> {
  if (!src) return new Map();
  if (src instanceof Map) return src;
  return new Map(Object.entries(src));
}

function linearQuantile(sorted: ReadonlyArray<number>, q: number): number {
  const n = sorted.length;
  if (n === 1) return sorted[0];
  const pos = q * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const frac = pos - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/**
 * Mulberry32 — small, fast, well-distributed PRNG.
 * Use for deterministic bootstrap in tests and golden fixtures.
 */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
