import { describe, it, expect } from "vitest";
import { pcmciLinearAlgorithm } from "../algorithms/pcmci-linear";
import { lagCorrelationAlgorithm } from "../algorithms/lag-correlation";
import type { Cohort } from "../cohort-types";

// ─── Deterministic synthetic cohorts ──────────────────────────────────

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return ((s >>> 8) / 0xffffff) * 2 - 1;
  };
}

/**
 * Three-variable cohort where a confounder Z drives both X and Y at
 * lag 1; X does NOT directly cause Y. A naive lag-correlation will
 * see X→Y. PCMCI should collapse it under conditioning on Z.
 */
function confoundedCohort(opts: {
  nSubjects: number;
  nSteps: number;
  seed: number;
}): Cohort {
  const { nSubjects, nSteps, seed } = opts;
  const rand = lcg(seed);
  const subjects = Array.from({ length: nSubjects }, (_, si) => {
    const z = new Array<number>(nSteps);
    const x = new Array<number>(nSteps);
    const y = new Array<number>(nSteps);
    z[0] = rand();
    x[0] = rand();
    y[0] = rand();
    for (let i = 1; i < nSteps; i++) {
      z[i] = 0.7 * z[i - 1] + 0.5 * rand();
      x[i] = 0.9 * z[i - 1] + 0.3 * rand();
      y[i] = 0.9 * z[i - 1] + 0.3 * rand();
    }
    const measurements = [];
    for (let i = 0; i < nSteps; i++) {
      measurements.push({ variableId: "z", t: i * 300, value: z[i] });
      measurements.push({ variableId: "x", t: i * 300, value: x[i] });
      measurements.push({ variableId: "y", t: i * 300, value: y[i] });
    }
    return { id: `s-${si}`, measurements };
  });
  return {
    id: "confounded",
    label: "confounded test",
    source: {
      adapter: "test",
      adapterVersion: "0",
      ingestedAt: "2026-04-29T00:00:00Z",
      containsPHI: false,
    },
    variables: [
      { id: "z", label: "Z", kind: "continuous", cadenceSeconds: 300 },
      { id: "x", label: "X", kind: "continuous", cadenceSeconds: 300 },
      { id: "y", label: "Y", kind: "continuous", cadenceSeconds: 300 },
    ],
    subjects,
    timeAxis: { zeroConvention: "session-start", displayUnit: "seconds" },
    metadata: { description: "test", accessTier: "public" },
  };
}

/**
 * Two-variable cohort with a real direct lagged edge X→Y.
 */
function directCohort(opts: {
  nSubjects: number;
  nSteps: number;
  trueLag: number;
  coupling: number;
  seed: number;
}): Cohort {
  const { nSubjects, nSteps, trueLag, coupling, seed } = opts;
  const rand = lcg(seed);
  const subjects = Array.from({ length: nSubjects }, (_, si) => {
    const x = new Array<number>(nSteps);
    const y = new Array<number>(nSteps);
    x[0] = rand();
    for (let i = 1; i < nSteps; i++) x[i] = 0.6 * x[i - 1] + 0.4 * rand();
    for (let i = 0; i < nSteps; i++) {
      const xLagged = i >= trueLag ? x[i - trueLag] : 0;
      y[i] = coupling * xLagged + 0.4 * rand();
    }
    const measurements = [];
    for (let i = 0; i < nSteps; i++) {
      measurements.push({ variableId: "x", t: i * 300, value: x[i] });
      measurements.push({ variableId: "y", t: i * 300, value: y[i] });
    }
    return { id: `s-${si}`, measurements };
  });
  return {
    id: "direct",
    label: "direct test",
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
    timeAxis: { zeroConvention: "session-start", displayUnit: "seconds" },
    metadata: { description: "test", accessTier: "public" },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("pcmci-linear algorithm", () => {
  it("never produces self-edges in the discovered output", () => {
    const cohort = directCohort({
      nSubjects: 4,
      nSteps: 200,
      trueLag: 2,
      coupling: 0.7,
      seed: 42,
    });
    const result = pcmciLinearAlgorithm.run(cohort);
    for (const e of result.edges) expect(e.source).not.toBe(e.target);
  });

  it("recovers a direct lagged edge X→Y on a coupled cohort", () => {
    const cohort = directCohort({
      nSubjects: 6,
      nSteps: 250,
      trueLag: 2,
      coupling: 0.8,
      seed: 7,
    });
    const result = pcmciLinearAlgorithm.run(cohort);
    const xToY = result.edges.find((e) => e.source === "x" && e.target === "y");
    expect(xToY).toBeDefined();
    expect(xToY!.lag).toBe(600); // 2 steps × 300s
  });

  it("kills a confounded edge that lag-correlation falsely accepts", () => {
    // Z → X, Z → Y at lag 1. X and Y are not directly connected, but
    // their correlation under common conditioning on Z should collapse.
    const cohort = confoundedCohort({ nSubjects: 6, nSteps: 250, seed: 11 });

    const lagResult = lagCorrelationAlgorithm.run(cohort);
    const pcmciResult = pcmciLinearAlgorithm.run(cohort);

    // Lag-correlation: at least one false x↔y edge gets through.
    const lagXYish = lagResult.edges.filter(
      (e) =>
        (e.source === "x" && e.target === "y") ||
        (e.source === "y" && e.target === "x"),
    );
    expect(lagXYish.length).toBeGreaterThan(0);

    // PCMCI: zero false x↔y edges (the conditioning on Z collapses them).
    const pcmciXYish = pcmciResult.edges.filter(
      (e) =>
        (e.source === "x" && e.target === "y") ||
        (e.source === "y" && e.target === "x"),
    );
    expect(pcmciXYish.length).toBe(0);
  });

  it("emits zero edges when subjects are below minSubjects", () => {
    const cohort = directCohort({
      nSubjects: 1,
      nSteps: 200,
      trueLag: 2,
      coupling: 0.8,
      seed: 13,
    });
    const result = pcmciLinearAlgorithm.run(cohort);
    expect(result.edges).toHaveLength(0);
    expect(result.diagnostics?.reason).toMatch(/minSubjects/);
  });

  it("respects the mciAlpha override", () => {
    const cohort = directCohort({
      nSubjects: 4,
      nSteps: 200,
      trueLag: 2,
      coupling: 0.4,
      seed: 17,
    });
    const lenient = pcmciLinearAlgorithm.run(cohort, { mciAlpha: 0.5 });
    const strict = pcmciLinearAlgorithm.run(cohort, { mciAlpha: 1e-6 });
    expect(lenient.edges.length).toBeGreaterThanOrEqual(strict.edges.length);
  });

  it("diagnostics report final candidate count, FDR-passing edges, and average conditioning size", () => {
    const cohort = directCohort({
      nSubjects: 4,
      nSteps: 200,
      trueLag: 1,
      coupling: 0.7,
      seed: 19,
    });
    const result = pcmciLinearAlgorithm.run(cohort);
    expect(typeof result.diagnostics?.nFinalCandidates).toBe("number");
    expect(typeof result.diagnostics?.nEdgesAfterFDR).toBe("number");
    expect(typeof result.diagnostics?.averageCondSize).toBe("number");
  });
});
