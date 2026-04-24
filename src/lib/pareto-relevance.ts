// Pareto model-relevance scoring
// ─────────────────────────────────────────────────────────────────────────────
// Replaces the per-model "confidence" badge in the Pareto panel with a
// composite relevance score grounded in four orthogonal sub-scores:
//
//   F  Fit quality            out-of-sample one-step NRMSE → exp(−NRMSE)
//   E  Evidence weight        Akaike weight across the active model set
//   G  Regime applicability   model-specific gate of "does this regime match
//                             the assumptions this model is designed for"
//   S  Data sufficiency       sample size / graph-richness penalty
//
// Composite (multiplicative gate × additive quality):
//
//   raw   = S · G · (FIT_WEIGHT · F + (1 − FIT_WEIGHT) · E)
//   shown = ema(raw)   with EMA_ALPHA on new contribution
//
// Why multiplicative on (S, G):
//   A model that doesn't apply to the current regime, or that doesn't have
//   enough data, must score near zero — it can't win by fitting noise.
//
// Why additive on (F, E):
//   F is stable over short windows but local; E is the cross-model arbiter
//   but flips sharply when models tie. The 60/40 split favours F because
//   short-window stability matters more than peak discrimination in this
//   panel — see the design note in the conversation log.
//
// All sub-scores are bounded in [0, 1]. Composite is bounded in [0, 1].

export const PARETO_RELEVANCE_CONSTANTS = {
  // Composition
  FIT_WEIGHT: 0.6,             // weight on F in the additive quality term
  EMA_ALPHA: 0.3,              // weight on the new raw value in EMA smoothing

  // Sufficiency thresholds
  MIN_TRAJECTORY_N: 30,        // n at which trajectory sufficiency saturates
  MIN_EDGE_COUNT: 50,          // edges at which graph sufficiency saturates
  MIN_NODE_COUNT_PH: 20,       // nodes at which PH sufficiency saturates

  // Fit quality
  HOLDOUT_FRACTION: 0.2,       // last 20% of points held out for one-step error
  HOLDOUT_MIN: 3,              // minimum held-out points
  NRMSE_DECAY: 1.0,            // λ in F = exp(−λ · NRMSE)

  // CSD gate
  CSD_LAMBDA_MAX_FLOOR: 0.5,   // λmax above which spectral condition fires
  CSD_TREND_WINDOW: 10,        // points used for variance/autocorr trend

  // LPPLS gate
  LPPLS_MIN_SIGN_CHANGES: 3,   // residual sign-changes signalling oscillation

  // PH gate
  PH_MID_FILTRATION_INDEX: 30, // midpoint of 60-step filtration

  // Likelihood floors (avoid −∞ when residuals are degenerate)
  MIN_RESIDUAL_VARIANCE: 1e-6,
} as const;

const C = PARETO_RELEVANCE_CONSTANTS;

// ─────────────────────────────────────────────────────────────────────────────
// Types

export interface SubScore {
  /** Score in [0, 1]. */
  score: number;
  /** One-line human-readable explanation of how the score was derived. */
  detail: string;
}

export interface RelevanceBreakdown {
  F: SubScore;
  E: SubScore;
  G: SubScore;
  S: SubScore;
  /** Final composite after EMA smoothing, in [0, 1]. */
  composite: number;
  /** Composite before EMA smoothing, in [0, 1]. */
  rawComposite: number;
}

export interface ModelRelevanceInput {
  /** Stable identifier (matches EstimatorId). */
  key: string;
  /** Observed series the model is trying to predict. */
  observed: number[];
  /** Model's prediction at indices matching `observed`. Same length. */
  modelSeries: number[];
  /** Free parameters (for AIC penalty). 0 means a fixed/derived model. */
  freeParams: number;
  /** Pre-computed regime gate (model-specific). */
  gate: SubScore;
  /** Pre-computed data sufficiency. */
  sufficiency: SubScore;
}

export interface ComposeOptions {
  fitWeight?: number;
  emaAlpha?: number;
  /** Previous composite values keyed by model key, for EMA smoothing. */
  previous?: Map<string, number> | Record<string, number>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-score helpers

/**
 * F — out-of-sample one-step fit quality.
 *
 * Holds out the last k points of `observed`, computes RMSE between the model's
 * prediction and the held-out actuals, normalises by the standard deviation of
 * the held-out observations, and maps to [0, 1] via exp(−NRMSE).
 *
 * F = 1 means the model predicts the held-out tail perfectly.
 * F → 0 as the held-out RMSE grows large relative to held-out variability.
 *
 * Returns score=0 with a "insufficient" detail when there aren't enough points.
 */
export function outOfSampleFit(
  observed: number[],
  modelSeries: number[],
): SubScore {
  const n = Math.min(observed.length, modelSeries.length);
  if (n < C.HOLDOUT_MIN + 2) {
    return {
      score: 0,
      detail: `n=${n}; need ≥${C.HOLDOUT_MIN + 2} for held-out fit.`,
    };
  }
  const k = Math.max(C.HOLDOUT_MIN, Math.floor(n * C.HOLDOUT_FRACTION));
  const start = n - k;

  let ssRes = 0;
  let mean = 0;
  for (let t = start; t < n; t++) mean += observed[t];
  mean /= k;

  let ssTotHoldout = 0;
  for (let t = start; t < n; t++) {
    const e = observed[t] - modelSeries[t];
    ssRes += e * e;
    const d = observed[t] - mean;
    ssTotHoldout += d * d;
  }

  const rmse = Math.sqrt(ssRes / k);
  const stdev = Math.sqrt(Math.max(ssTotHoldout / k, C.MIN_RESIDUAL_VARIANCE));
  const nrmse = rmse / stdev;
  const score = Math.max(0, Math.min(1, Math.exp(-C.NRMSE_DECAY * nrmse)));

  return {
    score,
    detail: `Held-out NRMSE = ${nrmse.toFixed(3)} on last ${k} of ${n} pts.`,
  };
}

/**
 * E — Akaike weights across the active model set.
 *
 * For each model i, computes a Gaussian log-likelihood from full-series
 * residuals, then AIC = 2k − 2 logL, then converts to model weights:
 *
 *   wᵢ = exp(−ΔAICᵢ / 2) / Σⱼ exp(−ΔAICⱼ / 2)
 *
 * Returns Eᵢ = clamp(K · wᵢ, 0, 1) where K = number of contributing models,
 * so the average evidence across models is 1.0 — this keeps the headline %
 * intuitive ("above average evidence" maps to high E).
 *
 * Models with insufficient data (fewer than 3 points) get E = 0 and are
 * excluded from the normalisation.
 */
export function akaikeEvidenceWeights(
  models: ReadonlyArray<Pick<ModelRelevanceInput, "key" | "observed" | "modelSeries" | "freeParams">>,
): Map<string, SubScore> {
  type Row = { key: string; aic: number; n: number; ok: boolean };
  const rows: Row[] = models.map((m) => {
    const n = Math.min(m.observed.length, m.modelSeries.length);
    if (n < 3) return { key: m.key, aic: Number.POSITIVE_INFINITY, n, ok: false };
    let ssRes = 0;
    for (let t = 0; t < n; t++) {
      const e = m.observed[t] - m.modelSeries[t];
      ssRes += e * e;
    }
    const sigma2 = Math.max(ssRes / n, C.MIN_RESIDUAL_VARIANCE);
    // Gaussian logL with σ² = ssRes/n  →  −n/2 · (log(2π σ²) + 1)
    const logL = -0.5 * n * (Math.log(2 * Math.PI * sigma2) + 1);
    const aic = 2 * m.freeParams - 2 * logL;
    return { key: m.key, aic, n, ok: true };
  });

  const valid = rows.filter((r) => r.ok);
  const out = new Map<string, SubScore>();
  if (valid.length === 0) {
    for (const r of rows) {
      out.set(r.key, { score: 0, detail: "No comparable models with ≥3 pts." });
    }
    return out;
  }

  const minAic = Math.min(...valid.map((r) => r.aic));
  let denom = 0;
  const expTerms = new Map<string, number>();
  for (const r of valid) {
    const e = Math.exp(-(r.aic - minAic) / 2);
    expTerms.set(r.key, e);
    denom += e;
  }
  const K = valid.length;
  for (const r of rows) {
    if (!r.ok) {
      out.set(r.key, { score: 0, detail: `Insufficient data (n=${r.n}).` });
      continue;
    }
    const w = (expTerms.get(r.key) ?? 0) / Math.max(denom, 1e-12);
    const score = Math.max(0, Math.min(1, K * w));
    const pct = (w * 100).toFixed(1);
    out.set(r.key, {
      score,
      detail: `Akaike weight ${pct}% of ${K} models (ΔAIC = ${(r.aic - minAic).toFixed(2)}).`,
    });
  }
  return out;
}

/**
 * G — CSD regime gate.
 *
 * CSD is designed for the pre-tipping regime where variance and lag-1
 * autocorrelation rise as the system loses resilience. The gate fires when:
 *   (1) rolling variance is increasing across the trend window
 *   (2) rolling lag-1 autocorrelation is increasing across the trend window
 *   (3) graph spectral radius λmax exceeds CSD_LAMBDA_MAX_FLOOR
 *
 * Score = (varSlope01 + autocorrSlope01 + spectral01) / 3, each in [0, 1].
 */
export function csdRegimeGate(args: {
  observed: number[];
  lambdaMax: number;
}): SubScore {
  const { observed, lambdaMax } = args;
  const n = observed.length;
  const w = C.CSD_TREND_WINDOW;
  if (n < w + 2) {
    const spectral01 = clamp01(lambdaMax / (2 * C.CSD_LAMBDA_MAX_FLOOR));
    return {
      score: spectral01 * 0.33,
      detail: `n=${n}; spectral-only gate (λmax=${lambdaMax.toFixed(2)}).`,
    };
  }

  // Rolling variance and lag-1 autocorr over windows of length w
  const varSeries: number[] = [];
  const acSeries: number[] = [];
  for (let end = w; end <= n; end++) {
    const slice = observed.slice(end - w, end);
    let mean = 0;
    for (const v of slice) mean += v;
    mean /= w;
    let varSum = 0;
    for (const v of slice) varSum += (v - mean) ** 2;
    varSeries.push(varSum / w);

    let num = 0;
    let den = 0;
    for (let i = 1; i < w; i++) {
      num += (slice[i] - mean) * (slice[i - 1] - mean);
      den += (slice[i - 1] - mean) ** 2;
    }
    acSeries.push(den > 0 ? Math.max(0, Math.min(1, num / den)) : 0);
  }

  const varSlope = leastSquaresSlope(varSeries);
  const acSlope = leastSquaresSlope(acSeries);

  // Map slopes to [0,1]: a slope of "+1 per window" is a strong rise.
  const varSlope01 = clamp01(varSlope * 5);
  const acSlope01 = clamp01(acSlope * 5);
  const spectral01 = clamp01(lambdaMax / (2 * C.CSD_LAMBDA_MAX_FLOOR));

  const score = (varSlope01 + acSlope01 + spectral01) / 3;
  return {
    score,
    detail: `var↗ ${varSlope01.toFixed(2)}, autocorr↗ ${acSlope01.toFixed(2)}, λmax ${lambdaMax.toFixed(2)} → ${spectral01.toFixed(2)}.`,
  };
}

/**
 * G — LPPLS regime gate.
 *
 * LPPLS describes super-exponentially accelerating trajectories with
 * log-periodic oscillations on the way to a singularity. The gate fires when:
 *   (1) trajectory accelerates over the second half (mean second-difference > 0)
 *   (2) residuals (observed − modelSeries) cross zero ≥ LPPLS_MIN_SIGN_CHANGES
 *
 * Score = (accel01 + oscillation01) / 2.
 */
export function lpplsRegimeGate(args: {
  observed: number[];
  modelSeries: number[];
}): SubScore {
  const { observed, modelSeries } = args;
  const n = Math.min(observed.length, modelSeries.length);
  if (n < 6) {
    return { score: 0, detail: `n=${n}; need ≥6 to score gate.` };
  }

  // Second-half acceleration: mean of second differences in the back half
  const half = Math.floor(n / 2);
  let accelSum = 0;
  let accelCount = 0;
  for (let t = Math.max(2, half); t < n; t++) {
    accelSum += observed[t] - 2 * observed[t - 1] + observed[t - 2];
    accelCount++;
  }
  const meanAccel = accelCount > 0 ? accelSum / accelCount : 0;
  const accel01 = clamp01(meanAccel * 50); // small positive accel → strong signal

  // Residual sign-changes
  let signChanges = 0;
  let prevSign = 0;
  for (let t = 0; t < n; t++) {
    const r = observed[t] - modelSeries[t];
    const s = r > 0 ? 1 : r < 0 ? -1 : 0;
    if (s !== 0 && prevSign !== 0 && s !== prevSign) signChanges++;
    if (s !== 0) prevSign = s;
  }
  const oscillation01 = clamp01(signChanges / (C.LPPLS_MIN_SIGN_CHANGES * 2));

  const score = (accel01 + oscillation01) / 2;
  return {
    score,
    detail: `accel ${accel01.toFixed(2)}, residual sign-changes ${signChanges} → ${oscillation01.toFixed(2)}.`,
  };
}

/**
 * G — PH regime gate.
 *
 * PH is meaningful when the graph has enough topology to expose persistent
 * holes: at least one β₁ > 0 in the filtration, and multiple connected
 * components at the midpoint (so the filtration actually sweeps through
 * non-trivial structure rather than a single blob).
 */
export function phRegimeGate(args: {
  betti1Curve: number[];
  componentCountAtMid: number;
  nodeCount: number;
}): SubScore {
  const { betti1Curve, componentCountAtMid, nodeCount } = args;
  if (betti1Curve.length === 0 || nodeCount === 0) {
    return { score: 0, detail: "Empty filtration." };
  }
  const maxB1 = Math.max(...betti1Curve);
  const holes01 = clamp01(maxB1 * 3); // β₁ is normalised; 0.33 → score 1
  const components01 = clamp01((componentCountAtMid - 1) / 4);
  const score = (holes01 + components01) / 2;
  return {
    score,
    detail: `max β₁ ${maxB1.toFixed(2)} → ${holes01.toFixed(2)}, mid-components ${componentCountAtMid} → ${components01.toFixed(2)}.`,
  };
}

/**
 * S — sufficiency for trajectory-based estimators (CSD, LPPLS).
 *
 * Saturates linearly at MIN_TRAJECTORY_N points and MIN_EDGE_COUNT edges.
 * Final score is the geometric mean so both axes must be healthy.
 */
export function trajectorySufficiency(n: number, edgeCount: number): SubScore {
  const nScore = clamp01(n / C.MIN_TRAJECTORY_N);
  const eScore = clamp01(edgeCount / C.MIN_EDGE_COUNT);
  const score = Math.sqrt(nScore * eScore);
  return {
    score,
    detail: `n=${n}/${C.MIN_TRAJECTORY_N}, edges=${edgeCount}/${C.MIN_EDGE_COUNT}.`,
  };
}

/**
 * S — sufficiency for topological estimators (PH).
 *
 * PH operates on the static graph, not a time-series; sufficiency is purely
 * a node-count saturation.
 */
export function topologySufficiency(nodeCount: number): SubScore {
  const score = clamp01(nodeCount / C.MIN_NODE_COUNT_PH);
  return {
    score,
    detail: `nodes=${nodeCount}/${C.MIN_NODE_COUNT_PH}.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Composition

/**
 * Compose the relevance breakdown for a batch of models.
 *
 * Computes E across the batch (Akaike weights are inherently relative), then
 * combines with each model's pre-computed F/G/S into the composite. If
 * `options.previous` is provided, applies EMA smoothing per model key.
 */
export function computeRelevanceBatch(
  inputs: ReadonlyArray<ModelRelevanceInput>,
  options: ComposeOptions = {},
): Map<string, RelevanceBreakdown> {
  const fitWeight = options.fitWeight ?? C.FIT_WEIGHT;
  const emaAlpha = options.emaAlpha ?? C.EMA_ALPHA;
  const previous = toMap(options.previous);

  const evidence = akaikeEvidenceWeights(inputs);
  const out = new Map<string, RelevanceBreakdown>();

  for (const m of inputs) {
    const F = outOfSampleFit(m.observed, m.modelSeries);
    const E = evidence.get(m.key) ?? { score: 0, detail: "No evidence weight." };
    const G = m.gate;
    const S = m.sufficiency;

    const quality = fitWeight * F.score + (1 - fitWeight) * E.score;
    const rawComposite = clamp01(S.score * G.score * quality);

    const prev = previous.get(m.key);
    const composite =
      typeof prev === "number" && Number.isFinite(prev)
        ? clamp01((1 - emaAlpha) * prev + emaAlpha * rawComposite)
        : rawComposite;

    out.set(m.key, { F, E, G, S, composite, rawComposite });
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internals

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function leastSquaresSlope(series: number[]): number {
  const n = series.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  let yMean = 0;
  for (const v of series) yMean += v;
  yMean /= n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (series[i] - yMean);
    den += (i - xMean) ** 2;
  }
  return den > 0 ? num / den : 0;
}

function toMap(
  src: Map<string, number> | Record<string, number> | undefined,
): Map<string, number> {
  if (!src) return new Map();
  if (src instanceof Map) return src;
  return new Map(Object.entries(src));
}
