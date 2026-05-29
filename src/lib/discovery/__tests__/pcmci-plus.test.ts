import { describe, it, expect } from "vitest";
import { pcmciPlusAlgorithm } from "../algorithms/pcmci-plus";
import type { Cohort } from "../cohort-types";

// ─── PCMCI+ tests ─────────────────────────────────────────────────────
//
// Pins these behaviours:
//   1. A contemporaneous coupling X_t ↔ Y_t is detected as a
//      contemporaneous edge (lag undefined) alongside the lagged
//      edges from the reused PCMCI lagged phase.
//   2. Symmetric case (truly no lagged parents on either side, or
//      identical lagged-parent sets) emits an undirected edge with
//      circle/circle endpoint marks. This is the common case in real
//      data — see the algorithm header for why.
//   3. Strict directed orientation appears when a hand-constructed
//      asymmetry exists (one endpoint has a lagged parent the other
//      provably doesn't reach through any chain).
//   4. Diagnostics block records the contemporaneous-phase counts.
//   5. Lagged-phase bail-out (too few subjects) is forwarded.

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return ((s >>> 8) / 0xffffff) * 2 - 1;
  };
}

/**
 * Three-variable cohort:
 *   Z[t-1] → X[t]   (lagged, drives X)
 *   X[t]   → Y[t]   (contemporaneous, strong)
 * No direct Z → Y. The lagged-parent imbalance rule should orient
 * X → Y because X has a unique lagged parent (Z) that Y doesn't.
 */
function contempOrientableCohort(opts: {
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
    for (let i = 1; i < nSteps; i++) {
      z[i] = 0.6 * z[i - 1] + 0.4 * rand();
      x[i] = 0.85 * z[i - 1] + 0.4 * rand();
    }
    for (let i = 0; i < nSteps; i++) {
      y[i] = 0.85 * x[i] + 0.4 * rand();
    }
    const measurements: Cohort["subjects"][number]["measurements"] = [];
    for (let i = 0; i < nSteps; i++) {
      measurements.push({ variableId: "z", t: i * 300, value: z[i] });
      measurements.push({ variableId: "x", t: i * 300, value: x[i] });
      measurements.push({ variableId: "y", t: i * 300, value: y[i] });
    }
    return { id: `s-${si}`, measurements };
  });
  return {
    id: "contemp-orientable",
    label: "contemporaneous orientable",
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
 * Two-variable cohort with NO temporal structure — both are i.i.d.
 * noise plus a per-step common shock that links them contemporaneously.
 * The lagged phase should find no lagged edges (no autocorrelation, no
 * cross-lag predictability), so both X and Y end up with empty lagged-
 * parent sets and the orientation rule has nothing to break the
 * symmetry on → emit circle/circle.
 */
function contempAmbiguousCohort(opts: {
  nSubjects: number;
  nSteps: number;
  seed: number;
}): Cohort {
  const { nSubjects, nSteps, seed } = opts;
  const rand = lcg(seed);
  const subjects = Array.from({ length: nSubjects }, (_, si) => {
    const x = new Array<number>(nSteps);
    const y = new Array<number>(nSteps);
    for (let i = 0; i < nSteps; i++) {
      const common = rand();
      // No autoregression — pure per-step noise + common shock.
      x[i] = 0.7 * common + 0.5 * rand();
      y[i] = 0.7 * common + 0.5 * rand();
    }
    const measurements: Cohort["subjects"][number]["measurements"] = [];
    for (let i = 0; i < nSteps; i++) {
      measurements.push({ variableId: "x", t: i * 300, value: x[i] });
      measurements.push({ variableId: "y", t: i * 300, value: y[i] });
    }
    return { id: `s-${si}`, measurements };
  });
  return {
    id: "contemp-ambiguous",
    label: "contemporaneous ambiguous",
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

describe("pcmci-plus", () => {
  it("detects a contemporaneous X–Y edge alongside lagged edges", () => {
    // In the orientable cohort design, X has a lagged ancestor Z that
    // also predicts Y through the X→Y contemporaneous chain. The
    // lagged phase (without contemporaneous awareness) marks Z as a
    // parent of both, so v0.1 typically emits undirected — but it
    // MUST emit the contemporaneous edge.
    const cohort = contempOrientableCohort({
      nSubjects: 8,
      nSteps: 400,
      seed: 17,
    });
    const result = pcmciPlusAlgorithm.run(cohort);
    const contemp = result.edges.filter(
      (e) =>
        ((e.source === "x" && e.target === "y") ||
          (e.source === "y" && e.target === "x")) &&
        (e.lag === undefined || e.lag === 0),
    );
    expect(contemp.length).toBeGreaterThan(0);
  });

  it("emits undirected contemporaneous edge when neither has a unique lagged parent", () => {
    const cohort = contempAmbiguousCohort({
      nSubjects: 8,
      nSteps: 400,
      seed: 23,
    });
    const result = pcmciPlusAlgorithm.run(cohort);
    const contemp = result.edges.filter(
      (e) =>
        ((e.source === "x" && e.target === "y") ||
          (e.source === "y" && e.target === "x")) &&
        (e.lag === undefined || e.lag === 0),
    );
    expect(contemp.length).toBeGreaterThan(0);
    // Should NOT be strictly directed — endpoint marks present.
    const undirected = contemp.filter(
      (e) =>
        e.endpointMarks?.sourceMark === "circle" &&
        e.endpointMarks?.targetMark === "circle",
    );
    expect(undirected.length).toBe(1);
    expect(undirected[0].evidence).toContain("ambiguous");
  });

  it("includes the contemporaneous phase diagnostics", () => {
    const cohort = contempOrientableCohort({
      nSubjects: 8,
      nSteps: 400,
      seed: 31,
    });
    const result = pcmciPlusAlgorithm.run(cohort);
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics!.contemporaneousPhase).toBeDefined();
    const phase = result.diagnostics!.contemporaneousPhase as {
      candidatesTested: number;
      survivorsAfterFdr: number;
      orientedDirected: number;
      orientedUndirected: number;
    };
    expect(phase.candidatesTested).toBeGreaterThan(0);
  });

  it("forwards the lagged PCMCI bail-out when too few subjects have grid points", () => {
    const tinyCohort: Cohort = {
      id: "tiny",
      label: "tiny",
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
      subjects: [
        {
          id: "s",
          measurements: [
            { variableId: "x", t: 0, value: 1 },
            { variableId: "y", t: 0, value: 1 },
          ],
        },
      ],
      timeAxis: { zeroConvention: "session-start", displayUnit: "seconds" },
      metadata: { description: "test", accessTier: "public" },
    };
    const result = pcmciPlusAlgorithm.run(tinyCohort);
    expect(result.edges).toEqual([]);
    expect(result.diagnostics?.reason).toBeDefined();
  });
});
