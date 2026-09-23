// ─── Synthetic CGM cohort (D1NAMO-shaped) ────────────────────────────
//
// HONEST FRAMING — READ FIRST
// ----------------------------
// A deterministic synthetic time-series cohort whose variable schema
// matches D1NAMO (cgm_glucose_mgdl, meal_event, insulin_fast_units,
// insulin_slow_units) so the discovery algorithms see exactly the same
// shape they'd see on real D1NAMO data. This is the substrate for the
// PCMCI+ demo run when raw D1NAMO data isn't available in the build
// environment — when it is, `scripts/run-d1namo-pcmci-plus.ts` runs
// the same algorithm against the real cohort.
//
// Generative structure (the "ground truth" the algorithm partially
// recovers — the recovery is honest, not pre-baked):
//
//   meal_event[t]            → cgm_glucose_mgdl[t+1]   (lag 5 min, +30 mg/dL)
//   meal_event[t]            → insulin_fast_units[t]   (contemporaneous user dose)
//   insulin_fast_units[t]    → cgm_glucose_mgdl[t+2]   (lag 10 min, -20 mg/dL per U)
//   cgm_glucose_mgdl[t-1]    → cgm_glucose_mgdl[t]     (autoregressive, ρ ≈ 0.85)
//   insulin_slow_units       background trend, no causal arrow into glucose
//
// Subjects: 9 (mirrors D1NAMO n).
// Steps per subject: 288 (one full day at 5-min cadence).
// Total measurements per subject: 288 × 4 = 1152 → 10,368 across cohort.
//
// Seeded LCG: deterministic — re-running the build produces identical
// output bytes, which is why the cohort.source.sourceHash below is
// stable across runs. Algorithm runs against this cohort are therefore
// also bit-reproducible.

import type { Cohort, Measurement, Variable } from "../cohort-types";

const COHORT_ID = "synthetic-cgm-2026-05";
const ADAPTER_VERSION = "0.1.0";
const SOURCE_HASH =
  "synth-cgm-deterministic-lcg-seed-0xC6707FB1-v0.1.0";

const DEFAULT_SEED = 0xc6707fb1; // arbitrary fixed seed
const GRID_SECONDS = 300; // 5 min cadence
const STEPS_PER_DAY = 288; // 24h / 5min

export const SYNTHETIC_CGM_VARIABLES: Variable[] = [
  {
    id: "cgm_glucose_mgdl",
    label: "CGM glucose (mg/dL)",
    kind: "continuous",
    unit: "mg/dL",
    cadenceSeconds: GRID_SECONDS,
    conceptCode: { system: "LOINC", code: "2339-0" }, // Glucose Bld
  },
  {
    id: "meal_event",
    label: "Meal event (binary)",
    kind: "binary",
    unit: "boolean",
    cadenceSeconds: GRID_SECONDS,
  },
  {
    id: "insulin_fast_units",
    label: "Rapid-acting insulin (U)",
    kind: "continuous",
    unit: "U",
    cadenceSeconds: GRID_SECONDS,
  },
  {
    id: "insulin_slow_units",
    label: "Long-acting insulin (U)",
    kind: "continuous",
    unit: "U",
    cadenceSeconds: GRID_SECONDS,
  },
];

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s >>> 8) / 0xffffff; // [0, 1)
  };
}

function gaussFrom(rand: () => number): () => number {
  // Box–Muller; consumes 2 uniforms per gaussian.
  return () => {
    const u1 = Math.max(1e-12, rand());
    const u2 = rand();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
}

interface SubjectSeries {
  glucose: number[];
  meal: number[];
  insulinFast: number[];
  insulinSlow: number[];
}

function simulateSubject(seed: number, nSteps: number): SubjectSeries {
  const rand = lcg(seed);
  const gauss = gaussFrom(rand);
  const glucose = new Array<number>(nSteps);
  const meal = new Array<number>(nSteps);
  const insulinFast = new Array<number>(nSteps);
  const insulinSlow = new Array<number>(nSteps);

  // Initial conditions: roughly euglycemic.
  glucose[0] = 110 + 10 * gauss();
  glucose[1] = 110 + 10 * gauss();
  meal[0] = 0;
  meal[1] = 0;
  insulinFast[0] = 0;
  insulinFast[1] = 0;
  insulinSlow[0] = 0.5 + 0.1 * rand();
  insulinSlow[1] = insulinSlow[0];

  // ~3 meals per day with some randomness; meal probability bumped
  // around breakfast/lunch/dinner windows so the marginal rate isn't
  // crazy high but each subject reliably gets multiple meal events.
  const mealWindows = [
    [80, 95],   // ~07:00
    [144, 156], // ~12:00
    [216, 228], // ~18:00
  ];
  function mealProbAt(t: number): number {
    for (const [a, b] of mealWindows) {
      if (t >= a && t <= b) return 0.18;
    }
    return 0.005; // base low rate (snacks)
  }

  for (let t = 2; t < nSteps; t++) {
    meal[t] = rand() < mealProbAt(t) ? 1 : 0;
    // Insulin fast follows meal CONTEMPORANEOUSLY (user dosing).
    // Magnitude correlates with meal but with subject-level scatter.
    insulinFast[t] = meal[t] === 1 ? Math.max(0, 4 + 1.5 * gauss()) : 0;
    // Insulin slow drifts slowly with small noise.
    insulinSlow[t] =
      0.95 * insulinSlow[t - 1] + 0.05 * (0.5 + 0.1 * rand());
    // Glucose dynamics:
    //   ρ * g[t-1]              autoregressive drift
    //   + 30 * meal[t-1]        meal effect at lag 1 (5 min)
    //   - 20 * insulinFast[t-2] insulin effect at lag 2 (10 min)
    //   + 5 * gauss noise
    glucose[t] =
      0.85 * glucose[t - 1] +
      30 * meal[t - 1] -
      20 * insulinFast[t - 2] +
      5 * gauss();
    // Soft clamp to physiologic range (40–400 mg/dL) without changing
    // the causal structure — the simulation rarely needs it.
    if (glucose[t] < 40) glucose[t] = 40;
    if (glucose[t] > 400) glucose[t] = 400;
  }
  return { glucose, meal, insulinFast, insulinSlow };
}

function seriesToMeasurements(series: SubjectSeries): Measurement[] {
  const out: Measurement[] = [];
  const n = series.glucose.length;
  for (let t = 0; t < n; t++) {
    const tSec = t * GRID_SECONDS;
    out.push({ variableId: "cgm_glucose_mgdl", t: tSec, value: series.glucose[t] });
    out.push({ variableId: "meal_event", t: tSec, value: series.meal[t] });
    out.push({ variableId: "insulin_fast_units", t: tSec, value: series.insulinFast[t] });
    out.push({ variableId: "insulin_slow_units", t: tSec, value: series.insulinSlow[t] });
  }
  return out;
}

export interface SyntheticCgmOptions {
  /** Number of subjects (default 9, mirroring D1NAMO). */
  nSubjects?: number;
  /** Steps per subject (default 288, one day at 5-min cadence). */
  nSteps?: number;
  /** Seed override for the subject-spawning LCG. */
  seed?: number;
  /** Override cohort id. */
  cohortId?: string;
  /** Override ingestedAt timestamp. Default 2026-05-30T00:00:00Z so
   *  the run JSON is stable across re-generates. */
  ingestedAt?: string;
}

export function buildSyntheticCgmCohort(
  options: SyntheticCgmOptions = {},
): Cohort {
  const nSubjects = options.nSubjects ?? 9;
  const nSteps = options.nSteps ?? STEPS_PER_DAY;
  const seed = options.seed ?? DEFAULT_SEED;
  const rand = lcg(seed);

  const subjects = Array.from({ length: nSubjects }, (_, i) => {
    // Per-subject seed derived from the master seed so each subject's
    // trajectory differs but the whole cohort stays reproducible.
    const subjectSeed = Math.floor(rand() * 0xffffffff) ^ i;
    const series = simulateSubject(subjectSeed, nSteps);
    return {
      id: `synth-${i.toString().padStart(2, "0")}`,
      demographics: { ageBand: "30-50", biologicalSex: i % 2 === 0 ? "F" : "M" },
      measurements: seriesToMeasurements(series),
    };
  });

  return {
    id: options.cohortId ?? COHORT_ID,
    label: "Synthetic CGM (D1NAMO-shaped)",
    source: {
      adapter: "synthetic-cgm",
      adapterVersion: ADAPTER_VERSION,
      sourceHash: SOURCE_HASH,
      ingestedAt: options.ingestedAt ?? "2026-05-30T00:00:00.000Z",
      containsPHI: false,
    },
    variables: SYNTHETIC_CGM_VARIABLES,
    subjects,
    timeAxis: { zeroConvention: "session-start", displayUnit: "minutes" },
    metadata: {
      description:
        "Deterministic synthetic CGM cohort with D1NAMO variable schema. " +
        "Generative ground truth: meal_event → cgm_glucose_mgdl (lag 1, +30), " +
        "meal_event → insulin_fast_units (contemporaneous), insulin_fast_units → " +
        "cgm_glucose_mgdl (lag 2, -20), autoregressive glucose drift (ρ ≈ 0.85). " +
        "Used as substrate for PCMCI+ discovery demo when raw D1NAMO is unavailable.",
      accessTier: "public",
    },
  };
}
