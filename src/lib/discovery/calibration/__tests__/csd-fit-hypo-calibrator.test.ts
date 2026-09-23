import { describe, it, expect } from "vitest";
import { calibrateCsdFitHypo } from "../csd-fit-hypo-calibrator";
import type { Cohort } from "../../cohort-types";

// ─── Helpers ──────────────────────────────────────────────────────────
//
// These fixtures are deterministic synthetic data used ONLY to test the
// calibrator's math (AUROC, Brier, reliability bins, edge cases). They
// are not the data we make any claims about — the validation artifact
// shipped to users (the sample-run JSON) is computed from real D1NAMO.

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return ((s >>> 8) / 0xffffff) * 2 - 1;
  };
}

function buildCohort(args: {
  id: string;
  subjectSeries: number[][];
}): Cohort {
  return {
    id: args.id,
    label: "test fixture",
    source: {
      adapter: "test",
      adapterVersion: "0",
      ingestedAt: "2026-04-29T00:00:00Z",
      containsPHI: false,
    },
    variables: [
      { id: "cgm_glucose_mgdl", label: "CGM", kind: "continuous", cadenceSeconds: 300 },
    ],
    subjects: args.subjectSeries.map((cgm, si) => ({
      id: `s-${si}`,
      measurements: cgm.map((v, i) => ({
        variableId: "cgm_glucose_mgdl",
        t: i * 300,
        value: v,
      })),
    })),
    timeAxis: { zeroConvention: "session-start", displayUnit: "seconds" },
    metadata: { description: "test", accessTier: "public" },
  };
}

// Stable AR(1)-ish trace through the entire window — F should be high.
function stableTrace(n: number, seed: number): number[] {
  const rand = lcg(seed);
  const out = new Array<number>(n);
  out[0] = 130;
  for (let i = 1; i < n; i++) {
    out[i] = 0.85 * out[i - 1] + 0.15 * 130 + 3 * rand();
  }
  return out;
}

// Trace with a hypo dip starting at hypoStartStep. F should collapse
// near the dip; the dip itself produces hypo labels.
function hypoTrace(n: number, hypoStartStep: number, seed: number): number[] {
  const rand = lcg(seed);
  const out = new Array<number>(n);
  out[0] = 130;
  for (let i = 1; i < n; i++) {
    const drift = i < hypoStartStep ? 0 : (i - hypoStartStep) * 8;
    out[i] = Math.max(40, 0.85 * out[i - 1] + 0.15 * 130 - drift + 3 * rand());
  }
  return out;
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("calibrateCsdFitHypo", () => {
  it("returns zero pairs when subjects are too short", () => {
    const cohort = buildCohort({
      id: "short",
      subjectSeries: [stableTrace(10, 1), stableTrace(15, 2)],
    });
    const result = calibrateCsdFitHypo(cohort, { minPointsPerSubject: 50 });
    expect(result.nPairs).toBe(0);
    expect(result.nSubjects).toBe(0);
    expect(result.baseRate).toBe(0);
    // AUROC undefined → 0.5 (rank-based default).
    expect(result.aurocFitHigh).toBe(0.5);
    expect(result.aurocFitLow).toBe(0.5);
  });

  it("computes reliability bins that sum to nPairs", () => {
    const cohort = buildCohort({
      id: "stable",
      subjectSeries: [
        stableTrace(120, 11),
        stableTrace(120, 22),
        stableTrace(120, 33),
      ],
    });
    const result = calibrateCsdFitHypo(cohort, { bootstrapSamples: 0 });
    const sum = result.reliabilityBins.reduce((s, b) => s + b.count, 0);
    expect(sum).toBe(result.nPairs);
    expect(result.nPairs).toBeGreaterThan(0);
  });

  it("validatedSubScores names F and F-bootstrap-CI; degenerate names M and S-edges", () => {
    const cohort = buildCohort({
      id: "stable",
      subjectSeries: [stableTrace(120, 41)],
    });
    const result = calibrateCsdFitHypo(cohort, { bootstrapSamples: 0 });
    expect(result.validatedSubScores).toContain("F");
    expect(result.validatedSubScores).toContain("F-bootstrap-CI");
    expect(result.degenerateSubScores).toContain("M");
    expect(result.degenerateSubScores).toContain("S-edges");
  });

  it("aurocFitHigh and aurocFitLow are complementary on tie-free scores", () => {
    const cohort = buildCohort({
      id: "mixed",
      subjectSeries: [
        hypoTrace(120, 60, 51),
        hypoTrace(120, 60, 52),
        hypoTrace(120, 60, 53),
        stableTrace(120, 54),
      ],
    });
    const result = calibrateCsdFitHypo(cohort, { bootstrapSamples: 0 });
    // Floating-point F values are essentially never tied, so the two
    // AUROCs should sum to ~1.
    expect(result.aurocFitHigh + result.aurocFitLow).toBeCloseTo(1, 3);
  });

  it("produces a positive bootstrap CI half-width when bootstrap is enabled", () => {
    const cohort = buildCohort({
      id: "stable",
      subjectSeries: [stableTrace(120, 61)],
    });
    const withBoot = calibrateCsdFitHypo(cohort, {
      bootstrapSamples: 50,
      bootstrapSeed: 12345,
    });
    expect(withBoot.meanCiHalfWidth).toBeGreaterThan(0);
    expect(withBoot.meanCiHalfWidth).toBeLessThanOrEqual(1);
    // bootstrap=0 → no CI computed → half-width 0.
    const noBoot = calibrateCsdFitHypo(cohort, { bootstrapSamples: 0 });
    expect(noBoot.meanCiHalfWidth).toBe(0);
  });

  it("no events at all → AUROC 0.5 (uninformative)", () => {
    // Stable traces never dip below 70 → zero events → undefined AUROC → 0.5.
    const cohort = buildCohort({
      id: "no-events",
      subjectSeries: [stableTrace(120, 71), stableTrace(120, 72)],
    });
    const result = calibrateCsdFitHypo(cohort, {
      bootstrapSamples: 0,
      hypoThresholdMgdl: 70,
    });
    expect(result.nPairs).toBeGreaterThan(0);
    // No events because the stable trace never crosses 70.
    const totalEvents = result.perSubject.reduce((s, p) => s + p.nEvents, 0);
    expect(totalEvents).toBe(0);
    expect(result.aurocFitHigh).toBe(0.5);
    expect(result.aurocFitLow).toBe(0.5);
  });

  it("brier and ECE in [0, 1]", () => {
    const cohort = buildCohort({
      id: "mixed",
      subjectSeries: [
        hypoTrace(140, 70, 81),
        hypoTrace(140, 70, 82),
        stableTrace(140, 83),
      ],
    });
    const result = calibrateCsdFitHypo(cohort, { bootstrapSamples: 0 });
    expect(result.brierScore).toBeGreaterThanOrEqual(0);
    expect(result.brierScore).toBeLessThanOrEqual(1);
    expect(result.ece).toBeGreaterThanOrEqual(0);
    expect(result.ece).toBeLessThanOrEqual(1);
  });

  it("perSubject lengths and event counts add up to global totals", () => {
    const cohort = buildCohort({
      id: "agg",
      subjectSeries: [
        hypoTrace(120, 60, 91),
        hypoTrace(120, 60, 92),
        stableTrace(120, 93),
      ],
    });
    const result = calibrateCsdFitHypo(cohort, { bootstrapSamples: 0 });
    const sumPairs = result.perSubject.reduce((s, p) => s + p.nPairs, 0);
    const sumEvents = result.perSubject.reduce((s, p) => s + p.nEvents, 0);
    expect(sumPairs).toBe(result.nPairs);
    expect(result.baseRate).toBeCloseTo(
      result.nPairs === 0 ? 0 : sumEvents / result.nPairs,
      9,
    );
  });
});
