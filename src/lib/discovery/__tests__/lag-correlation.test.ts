import { describe, it, expect } from "vitest";
import { lagCorrelationAlgorithm } from "../algorithms/lag-correlation";
import type { Cohort } from "../cohort-types";

// ─── Helpers ──────────────────────────────────────────────────────────
//
// Fixture cohorts large enough that the algorithm has signal but small
// enough that the test runs in milliseconds. We DON'T use these to
// claim "PCMCI+ works" — they exercise the implementation contract.

function regularCohort(opts: {
  nSubjects: number;
  nSteps: number;
  /** True lag (in steps) at which y depends on x. */
  trueLag: number;
  /** Coupling strength on the true edge. */
  coupling: number;
  noise: number;
  seed: number;
}): Cohort {
  const { nSubjects, nSteps, trueLag, coupling, noise, seed } = opts;
  // Simple deterministic LCG for repeatable tests.
  let state = seed >>> 0;
  const rand = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return ((state >>> 8) / 0xffffff) * 2 - 1;
  };

  const subjects = Array.from({ length: nSubjects }, (_, si) => {
    const x = new Array<number>(nSteps);
    const y = new Array<number>(nSteps);
    // X: an AR(1)-ish drift so it has structure.
    x[0] = rand();
    for (let i = 1; i < nSteps; i++) x[i] = 0.6 * x[i - 1] + 0.4 * rand();
    // Y: depends on x at trueLag, plus noise.
    for (let i = 0; i < nSteps; i++) {
      const xLagged = i >= trueLag ? x[i - trueLag] : 0;
      y[i] = coupling * xLagged + noise * rand();
    }
    const measurements = [];
    for (let i = 0; i < nSteps; i++) {
      measurements.push({ variableId: "x", t: i * 300, value: x[i] });
      measurements.push({ variableId: "y", t: i * 300, value: y[i] });
    }
    return {
      id: `subject-${si}`,
      measurements,
    };
  });

  return {
    id: "test-cohort",
    label: "synthetic",
    source: {
      adapter: "test",
      adapterVersion: "0",
      ingestedAt: "2026-04-29T00:00:00Z",
      containsPHI: false,
    },
    variables: [
      { id: "x", label: "X", kind: "continuous", cadenceSeconds: 300 },
      { id: "y", label: "Y", kind: "continuous", cadenceSeconds: 300 },
    ],
    subjects,
    timeAxis: { zeroConvention: "subject-session-start", displayUnit: "seconds" },
    metadata: { description: "test", accessTier: "public" },
  };
}

describe("lag-correlation algorithm", () => {
  it("never produces self-edges (autocorrelation is not discovered structure)", () => {
    const cohort = regularCohort({
      nSubjects: 4,
      nSteps: 200,
      trueLag: 2,
      coupling: 0.7,
      noise: 0.3,
      seed: 42,
    });
    const result = lagCorrelationAlgorithm.run(cohort);
    for (const e of result.edges) {
      expect(e.source).not.toBe(e.target);
    }
  });

  it("recovers the true lagged edge x → y on a coupled cohort", () => {
    const cohort = regularCohort({
      nSubjects: 6,
      nSteps: 200,
      trueLag: 2,
      coupling: 0.8,
      noise: 0.4,
      seed: 7,
    });
    const result = lagCorrelationAlgorithm.run(cohort);
    const xToY = result.edges.find(
      (e) => e.source === "x" && e.target === "y",
    );
    expect(xToY).toBeDefined();
    // True lag was 2 steps × 300s/step = 600s.
    expect(xToY!.lag).toBe(600);
    expect(Math.abs(xToY!.strength)).toBeGreaterThan(0.4);
  });

  it("emits zero edges when subjects are below the minSubjects threshold", () => {
    const cohort = regularCohort({
      nSubjects: 1,
      nSteps: 200,
      trueLag: 2,
      coupling: 0.8,
      noise: 0.4,
      seed: 11,
    });
    const result = lagCorrelationAlgorithm.run(cohort);
    expect(result.edges).toHaveLength(0);
    expect(result.diagnostics?.reason).toMatch(/minSubjects/);
  });

  it("respects the alpha override for FDR threshold", () => {
    const cohort = regularCohort({
      nSubjects: 3,
      nSteps: 100,
      trueLag: 2,
      coupling: 0.3,
      noise: 0.7, // weaker signal
      seed: 13,
    });
    const lenient = lagCorrelationAlgorithm.run(cohort, { alpha: 0.5 });
    const strict = lagCorrelationAlgorithm.run(cohort, { alpha: 0.001 });
    expect(lenient.edges.length).toBeGreaterThanOrEqual(strict.edges.length);
  });

  it("every emitted edge references variables present in result.variables", () => {
    const cohort = regularCohort({
      nSubjects: 4,
      nSteps: 150,
      trueLag: 1,
      coupling: 0.6,
      noise: 0.4,
      seed: 99,
    });
    const result = lagCorrelationAlgorithm.run(cohort);
    const vars = new Set(result.variables);
    for (const e of result.edges) {
      expect(vars.has(e.source)).toBe(true);
      expect(vars.has(e.target)).toBe(true);
    }
  });

  it("diagnostics report the algorithm's effective inputs", () => {
    const cohort = regularCohort({
      nSubjects: 3,
      nSteps: 150,
      trueLag: 1,
      coupling: 0.6,
      noise: 0.4,
      seed: 21,
    });
    const result = lagCorrelationAlgorithm.run(cohort);
    expect(result.diagnostics?.nSubjectsUsed).toBe(3);
    expect(typeof result.diagnostics?.nCandidates).toBe("number");
    expect(typeof result.diagnostics?.nEdgesAfterFDR).toBe("number");
  });
});
