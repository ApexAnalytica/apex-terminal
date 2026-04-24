// LPPLS grid fit
// ─────────────────────────────────────────────────────────────────────────────
// Fits the Log-Periodic Power Law Singularity model by coarse-to-fine grid
// search over (tc, ω, m). Uses the same model form as the Pareto panel's
// original LPPLS template:
//
//   y(t) = 1 − (tc − t)^m · [1 + 0.2 · cos(ω · ln(tc − t) + φ)]
//
// where t is the normalised time index in [0, 1] over the observed window,
// φ is a fixed phase (supplied by the caller; the panel ties it to the mean
// Ω of the graph), and A = 1, B = −1, C = 0.2 are hardcoded to match the
// original template shape.
//
// Fitting free parameters:
//   tc  critical time as a fraction of window length (beyond 1.0)
//   ω   angular frequency of the log-periodic oscillation
//   m   power-law exponent
//
// Phase φ is not fit here — callers that want to fit it should loop over a
// coarse φ grid externally and pick the best fit. Keeping φ out of the grid
// holds scope tight and preserves parity with the original template.
//
// Two-stage grid: a wide coarse pass locates the basin, then a narrow refine
// pass hunts sub-grid precision. Seed values (the previously-used derived
// tc/ω/m) are evaluated explicitly so we never regress below the seed's SSE.

export interface LpplsGridSpec {
  min: number;
  max: number;
  steps: number;
}

export interface LpplsFitOptions {
  /** Coarse grid over tc. Default: [1.01, 1.5] × 20. */
  tcGrid?: LpplsGridSpec;
  /** Coarse grid over ω. Default: [4, 13] × 20. */
  omegaGrid?: LpplsGridSpec;
  /** Coarse grid over m. Default: [0.1, 0.9] × 16. */
  mGrid?: LpplsGridSpec;
  /** Phase φ in the log-periodic term. Default: 0. */
  phase?: number;
  /** Seed point to always include (typically the previously-used derived values). */
  seed?: { tc: number; omega: number; m: number };
  /** Refine pass: how many steps per axis around the coarse best. Default 7. */
  refineSteps?: number;
  /** Refine pass: radius as a fraction of the coarse step. Default 1.5. */
  refineSpan?: number;
}

export interface LpplsFitResult {
  tc: number;
  omega: number;
  m: number;
  /** Model series of length observed.length, evaluated at matching t indices. */
  modelSeries: number[];
  /** Sum of squared residuals at the fitted parameters. */
  ssRes: number;
  /** Coefficient of determination against observed. */
  rSquared: number;
  /** Number of grid points evaluated (both passes). */
  evaluations: number;
}

const DEFAULT_TC: LpplsGridSpec = { min: 1.01, max: 1.5, steps: 20 };
const DEFAULT_OMEGA: LpplsGridSpec = { min: 4, max: 13, steps: 20 };
const DEFAULT_M: LpplsGridSpec = { min: 0.1, max: 0.9, steps: 16 };

/** Evaluate a single LPPLS sample at normalised time t ∈ [0, 1]. */
export function lpplsSample(
  t: number,
  tc: number,
  omega: number,
  m: number,
  phase: number,
): number {
  const dt = Math.max(0.01, tc - t);
  const powerLaw = Math.pow(dt, m);
  const logPeriodic = 0.2 * Math.cos(omega * Math.log(dt) + phase);
  const signal = 1 - powerLaw * (1 + logPeriodic);
  return Math.max(0, Math.min(1, signal));
}

/** Generate an LPPLS series of length n over normalised time [0, 1]. */
export function lpplsSeries(
  n: number,
  tc: number,
  omega: number,
  m: number,
  phase: number,
): number[] {
  const out = new Array<number>(n);
  const denom = Math.max(1, n - 1);
  for (let i = 0; i < n; i++) {
    out[i] = lpplsSample(i / denom, tc, omega, m, phase);
  }
  return out;
}

/**
 * Fit LPPLS parameters (tc, ω, m) to an observed series by two-stage grid
 * search. Returns the best-SSE triple, the fitted model series at the
 * observed indices, and R² against `observed`.
 *
 * Returns the seed (or the grid minimum when no seed) if `observed.length < 2`,
 * since SSE against ≤1 point is degenerate.
 */
export function fitLppls(
  observed: number[],
  options: LpplsFitOptions = {},
): LpplsFitResult {
  const tcSpec = options.tcGrid ?? DEFAULT_TC;
  const omegaSpec = options.omegaGrid ?? DEFAULT_OMEGA;
  const mSpec = options.mGrid ?? DEFAULT_M;
  const phase = options.phase ?? 0;
  const refineSteps = options.refineSteps ?? 7;
  const refineSpan = options.refineSpan ?? 1.5;

  const n = observed.length;
  const denom = Math.max(1, n - 1);

  // Degenerate: pick the seed (or the grid centre) with no fitting.
  if (n < 2) {
    const seed = options.seed ?? {
      tc: (tcSpec.min + tcSpec.max) / 2,
      omega: (omegaSpec.min + omegaSpec.max) / 2,
      m: (mSpec.min + mSpec.max) / 2,
    };
    const modelSeries = lpplsSeries(n, seed.tc, seed.omega, seed.m, phase);
    return { ...seed, modelSeries, ssRes: 0, rSquared: 0, evaluations: 0 };
  }

  // ssRes as a function of (tc, ω, m); precomputes t samples once per call.
  const sse = (tc: number, omega: number, m: number): number => {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const y = lpplsSample(i / denom, tc, omega, m, phase);
      const e = observed[i] - y;
      s += e * e;
    }
    return s;
  };

  let best = {
    tc: NaN,
    omega: NaN,
    m: NaN,
    ssRes: Number.POSITIVE_INFINITY,
  };
  let evaluations = 0;

  const update = (tc: number, omega: number, m: number) => {
    const s = sse(tc, omega, m);
    evaluations++;
    if (s < best.ssRes) {
      best = { tc, omega, m, ssRes: s };
    }
  };

  // Seed evaluation first, so a grid miss can't beat the caller's known point
  // only to lose R² downstream.
  if (options.seed) {
    update(options.seed.tc, options.seed.omega, options.seed.m);
  }

  // ── Coarse pass ──
  for (const tc of linspace(tcSpec)) {
    for (const omega of linspace(omegaSpec)) {
      for (const m of linspace(mSpec)) {
        update(tc, omega, m);
      }
    }
  }

  // ── Refine pass around the coarse best ──
  const tcStep = (tcSpec.max - tcSpec.min) / Math.max(1, tcSpec.steps - 1);
  const omegaStep = (omegaSpec.max - omegaSpec.min) / Math.max(1, omegaSpec.steps - 1);
  const mStep = (mSpec.max - mSpec.min) / Math.max(1, mSpec.steps - 1);

  const refineTc = refineWindow(best.tc, tcStep * refineSpan, refineSteps, tcSpec);
  const refineOmega = refineWindow(best.omega, omegaStep * refineSpan, refineSteps, omegaSpec);
  const refineM = refineWindow(best.m, mStep * refineSpan, refineSteps, mSpec);

  for (const tc of refineTc) {
    for (const omega of refineOmega) {
      for (const m of refineM) {
        update(tc, omega, m);
      }
    }
  }

  const modelSeries = lpplsSeries(n, best.tc, best.omega, best.m, phase);
  let mean = 0;
  for (const v of observed) mean += v;
  mean /= n;
  let ssTot = 0;
  for (const v of observed) ssTot += (v - mean) ** 2;
  const rSquared = ssTot > 0 ? Math.max(0, 1 - best.ssRes / ssTot) : 0;

  return {
    tc: best.tc,
    omega: best.omega,
    m: best.m,
    modelSeries,
    ssRes: best.ssRes,
    rSquared,
    evaluations,
  };
}

function linspace(spec: LpplsGridSpec): number[] {
  if (spec.steps <= 1) return [spec.min];
  const step = (spec.max - spec.min) / (spec.steps - 1);
  const out = new Array<number>(spec.steps);
  for (let i = 0; i < spec.steps; i++) out[i] = spec.min + i * step;
  return out;
}

function refineWindow(
  center: number,
  halfSpan: number,
  steps: number,
  bounds: LpplsGridSpec,
): number[] {
  const lo = Math.max(bounds.min, center - halfSpan);
  const hi = Math.min(bounds.max, center + halfSpan);
  if (hi <= lo) return [center];
  return linspace({ min: lo, max: hi, steps });
}
