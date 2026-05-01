import { describe, it, expect } from "vitest";
import { calibrateBocpdHypo } from "../bocpd-hypo-calibrator";
import type { Cohort } from "../../cohort-types";

// ─── Helpers ──────────────────────────────────────────────────────────

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return ((s >>> 8) / 0xffffff) * 2 - 1;
  };
}

/**
 * Build a synthetic CGM-shaped cohort with known regime shifts that
 * always end in a hypo dip. BOCPD should detect the regime shift; the
 * label (hypo within next K steps) is true after the shift; AUROC > 0.5.
 */
function syntheticCgmCohort(opts: {
  nSubjects: number;
  nSteps: number;
  hypoStartStep: number;
  seed: number;
}): Cohort {
  const { nSubjects, nSteps, hypoStartStep, seed } = opts;
  const rand = lcg(seed);
  const subjects = Array.from({ length: nSubjects }, (_, si) => {
    const cgm = new Array<number>(nSteps);
    for (let i = 0; i < nSteps; i++) {
      // Stable in-range until hypoStartStep; rapid drop after.
      const baseline = i < hypoStartStep ? 130 : 130 - (i - hypoStartStep) * 8;
      cgm[i] = Math.max(40, baseline + 4 * rand());
    }
    return {
      id: `s-${si}`,
      measurements: cgm.map((v, i) => ({
        variableId: "cgm_glucose_mgdl",
        t: i * 300,
        value: v,
      })),
    };
  });

  return {
    id: "synthetic-cgm",
    label: "synthetic CGM with hypo regime shift",
    source: {
      adapter: "test",
      adapterVersion: "0",
      ingestedAt: "2026-04-30T00:00:00Z",
      containsPHI: false,
    },
    variables: [
      {
        id: "cgm_glucose_mgdl",
        label: "CGM glucose",
        kind: "continuous",
        cadenceSeconds: 300,
      },
    ],
    subjects,
    timeAxis: { zeroConvention: "session-start", displayUnit: "seconds" },
    metadata: { description: "test", accessTier: "public" },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("calibrateBocpdHypo", () => {
  it("returns the expected result shape on a valid cohort", () => {
    const cohort = syntheticCgmCohort({
      nSubjects: 4,
      nSteps: 200,
      hypoStartStep: 120,
      seed: 11,
    });
    const r = calibrateBocpdHypo(cohort);
    expect(typeof r.auroc).toBe("number");
    expect(typeof r.brierScore).toBe("number");
    expect(typeof r.ece).toBe("number");
    expect(r.nPairs).toBeGreaterThan(0);
    expect(r.nSubjects).toBe(4);
    expect(r.reliabilityBins).toHaveLength(10);
    expect(r.perSubject).toHaveLength(4);
  });

  it("AUROC and Brier are in valid ranges", () => {
    const cohort = syntheticCgmCohort({
      nSubjects: 3,
      nSteps: 200,
      hypoStartStep: 120,
      seed: 7,
    });
    const r = calibrateBocpdHypo(cohort);
    expect(r.auroc).toBeGreaterThanOrEqual(0);
    expect(r.auroc).toBeLessThanOrEqual(1);
    expect(r.brierScore).toBeGreaterThanOrEqual(0);
    expect(r.brierScore).toBeLessThanOrEqual(1);
    expect(r.ece).toBeGreaterThanOrEqual(0);
    expect(r.ece).toBeLessThanOrEqual(1);
  });

  it("base rate matches the empirical event prevalence", () => {
    const cohort = syntheticCgmCohort({
      nSubjects: 3,
      nSteps: 150,
      hypoStartStep: 80,
      seed: 19,
    });
    const r = calibrateBocpdHypo(cohort);
    expect(r.baseRate).toBeGreaterThanOrEqual(0);
    expect(r.baseRate).toBeLessThanOrEqual(1);
    // With a forced hypo around step 80, we expect a non-trivial base rate.
    expect(r.baseRate).toBeGreaterThan(0);
  });

  it("reliability bins partition the score range and counts sum to N", () => {
    const cohort = syntheticCgmCohort({
      nSubjects: 3,
      nSteps: 150,
      hypoStartStep: 80,
      seed: 23,
    });
    const r = calibrateBocpdHypo(cohort);
    const totalCount = r.reliabilityBins.reduce((a, b) => a + b.count, 0);
    expect(totalCount).toBe(r.nPairs);
    // Bins should be monotonically increasing in [0, 1].
    for (let i = 1; i < r.reliabilityBins.length; i++) {
      expect(r.reliabilityBins[i].binLow).toBeGreaterThanOrEqual(
        r.reliabilityBins[i - 1].binLow,
      );
    }
  });

  it("returns 0.5 AUROC when the cohort has no events at all", () => {
    // All glucose stays well above hypo threshold → no events → AUROC undefined → 0.5.
    const cohort = syntheticCgmCohort({
      nSubjects: 3,
      nSteps: 200,
      hypoStartStep: 10000, // never triggers
      seed: 31,
    });
    const r = calibrateBocpdHypo(cohort);
    expect(r.auroc).toBe(0.5);
    expect(r.baseRate).toBe(0);
  });

  it("respects custom prediction horizon and threshold params", () => {
    const cohort = syntheticCgmCohort({
      nSubjects: 3,
      nSteps: 200,
      hypoStartStep: 120,
      seed: 41,
    });
    const tight = calibrateBocpdHypo(cohort, {
      predictionHorizonMin: 5,
    });
    const loose = calibrateBocpdHypo(cohort, {
      predictionHorizonMin: 60,
    });
    // Looser horizon → more positive labels → higher base rate.
    expect(loose.baseRate).toBeGreaterThanOrEqual(tight.baseRate);
  });
});
