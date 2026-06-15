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
    // Two-variable ambiguous case: no v-structure possible (need a
    // third node as a candidate collider), no Meek propagation either,
    // so the edge stays undirected with circle/circle marks.
    const undirected = contemp.filter(
      (e) =>
        e.endpointMarks?.sourceMark === "circle" &&
        e.endpointMarks?.targetMark === "circle",
    );
    expect(undirected.length).toBe(1);
    expect(undirected[0].evidence).toContain("undetermined after Meek");
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
      ciTests: number;
      edgesRemoved: number;
      vStructuresFound: number;
      meekIterations: number;
      meekR1Fires: number;
      meekR2Fires: number;
      meekR3Fires: number;
      edgesEmitted: number;
      edgesDirected: number;
      edgesUndirected: number;
    };
    // PC-stable must have run some tests.
    expect(phase.ciTests).toBeGreaterThan(0);
    // Meek loop runs at least once (the initial pass that exits when
    // nothing changes still counts).
    expect(phase.meekIterations).toBeGreaterThanOrEqual(1);
    // Edge accounting consistent.
    expect(phase.edgesEmitted).toBe(
      phase.edgesDirected + phase.edgesUndirected,
    );
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

// ─── V-structure cohort: X → Z ← Y (collider) ─────────────────────────
//
// Three contemporaneous variables. X and Y are independent noise; Z is
// a sum of both. Marginal correlations X-Z and Y-Z are non-zero; X-Y
// is zero (independent inputs). The PC-stable phase should find:
//   - X — Z and Y — Z survive (no separating set kills them)
//   - X — Y separated at condDim=0 (unconditional independence) →
//     sep(X, Y) = ∅
// V-structure detection then sees the unshielded triple X — Z — Y and
// Z ∉ sep(X, Y) (which is ∅), so orients X → Z ← Y.
function colliderCohort(opts: {
  nSubjects: number;
  nSteps: number;
  seed: number;
}): Cohort {
  const { nSubjects, nSteps, seed } = opts;
  const rand = lcg(seed);
  const subjects = Array.from({ length: nSubjects }, (_, si) => {
    const x = new Array<number>(nSteps);
    const y = new Array<number>(nSteps);
    const z = new Array<number>(nSteps);
    for (let i = 0; i < nSteps; i++) {
      x[i] = rand();
      y[i] = rand();
      z[i] = 0.7 * x[i] + 0.7 * y[i] + 0.4 * rand();
    }
    const measurements: Cohort["subjects"][number]["measurements"] = [];
    for (let i = 0; i < nSteps; i++) {
      measurements.push({ variableId: "x", t: i * 300, value: x[i] });
      measurements.push({ variableId: "y", t: i * 300, value: y[i] });
      measurements.push({ variableId: "z", t: i * 300, value: z[i] });
    }
    return { id: `s-${si}`, measurements };
  });
  return {
    id: "collider",
    label: "collider X → Z ← Y",
    source: {
      adapter: "test",
      adapterVersion: "0",
      ingestedAt: "2026-04-29T00:00:00Z",
      containsPHI: false,
    },
    variables: [
      { id: "x", label: "X", kind: "continuous", cadenceSeconds: 300 },
      { id: "y", label: "Y", kind: "continuous", cadenceSeconds: 300 },
      { id: "z", label: "Z", kind: "continuous", cadenceSeconds: 300 },
    ],
    subjects,
    timeAxis: { zeroConvention: "session-start", displayUnit: "seconds" },
    metadata: { description: "test", accessTier: "public" },
  };
}

describe("pcmci-plus — v-structure detection", () => {
  it("orients X → Z ← Y on the canonical collider cohort", () => {
    const cohort = colliderCohort({ nSubjects: 8, nSteps: 400, seed: 41 });
    const result = pcmciPlusAlgorithm.run(cohort);
    // Two oriented edges into Z, both with target=z and tail/arrow marks.
    const intoZ = result.edges.filter(
      (e) =>
        e.target === "z" &&
        (e.lag === undefined || e.lag === 0) &&
        e.endpointMarks?.targetMark === "arrow",
    );
    expect(intoZ.length).toBe(2);
    const sources = new Set(intoZ.map((e) => e.source));
    expect(sources.has("x")).toBe(true);
    expect(sources.has("y")).toBe(true);
    // No contemporaneous X — Y edge should survive (X ⊥ Y).
    const xy = result.edges.filter(
      (e) =>
        ((e.source === "x" && e.target === "y") ||
          (e.source === "y" && e.target === "x")) &&
        (e.lag === undefined || e.lag === 0),
    );
    expect(xy.length).toBe(0);

    // Diagnostics should record at least one v-structure.
    const phase = result.diagnostics!.contemporaneousPhase as {
      vStructuresFound: number;
    };
    expect(phase.vStructuresFound).toBeGreaterThanOrEqual(1);
  });
});

// ─── Meek-R1 chain cohort: collider at Z + extra W — Y edge ───────────
//
// X → Z ← Y, plus an undirected W — Y edge where W is not adjacent
// to anything else. Before Meek: X → Z, Y → Z (from v-structure),
// W — Y (undirected), no W — X or W — Z edges. After Meek-R1: Y → W
// is NOT forced (W — Y has nothing pointing AT Y). After Meek-R1 from
// Y → Z perspective: Z is a collider neighbor; doesn't trigger R1 (R1
// needs a → b — c with a, c not adjacent and a → b directed). So this
// is mostly a no-op test for R1 — instead we use a chain cohort where
// R1 actually fires.
//
// Better cohort for R1: X → Y — Z with X, Z not adjacent. Then R1
// orients Y → Z.
function r1ChainCohort(opts: {
  nSubjects: number;
  nSteps: number;
  seed: number;
}): Cohort {
  const { nSubjects, nSteps, seed } = opts;
  const rand = lcg(seed);
  // Build: X → Y (oriented by v-structure with a hidden W), Y — Z
  // contemporaneous with no third-variable separator → Y — Z stays
  // in skeleton, R1 fires to orient Y → Z.
  // To force X → Y as a v-structure: introduce a W where W → Y ← X.
  // Then add Y — Z (collider triple at Y from X side will already
  // orient X → Y).
  // Structure: X, W independent noise; Y = 0.6*X + 0.6*W + noise;
  //            Z = 0.6*Y + noise (so Y — Z stays, Z separates from
  //            X|Y and W|Y).
  const subjects = Array.from({ length: nSubjects }, (_, si) => {
    const x = new Array<number>(nSteps);
    const w = new Array<number>(nSteps);
    const y = new Array<number>(nSteps);
    const z = new Array<number>(nSteps);
    for (let i = 0; i < nSteps; i++) {
      x[i] = rand();
      w[i] = rand();
      y[i] = 0.7 * x[i] + 0.7 * w[i] + 0.4 * rand();
      z[i] = 0.7 * y[i] + 0.4 * rand();
    }
    const measurements: Cohort["subjects"][number]["measurements"] = [];
    for (let i = 0; i < nSteps; i++) {
      measurements.push({ variableId: "x", t: i * 300, value: x[i] });
      measurements.push({ variableId: "w", t: i * 300, value: w[i] });
      measurements.push({ variableId: "y", t: i * 300, value: y[i] });
      measurements.push({ variableId: "z", t: i * 300, value: z[i] });
    }
    return { id: `s-${si}`, measurements };
  });
  return {
    id: "r1-chain",
    label: "X → Y ← W; Y → Z (R1 propagates Y → Z)",
    source: {
      adapter: "test",
      adapterVersion: "0",
      ingestedAt: "2026-04-29T00:00:00Z",
      containsPHI: false,
    },
    variables: [
      { id: "x", label: "X", kind: "continuous", cadenceSeconds: 300 },
      { id: "w", label: "W", kind: "continuous", cadenceSeconds: 300 },
      { id: "y", label: "Y", kind: "continuous", cadenceSeconds: 300 },
      { id: "z", label: "Z", kind: "continuous", cadenceSeconds: 300 },
    ],
    subjects,
    timeAxis: { zeroConvention: "session-start", displayUnit: "seconds" },
    metadata: { description: "test", accessTier: "public" },
  };
}

describe("pcmci-plus — Meek-rule propagation", () => {
  it("R1 propagates orientation through a collider+chain cohort", () => {
    const cohort = r1ChainCohort({ nSubjects: 10, nSteps: 500, seed: 53 });
    const result = pcmciPlusAlgorithm.run(cohort);
    // After v-structure: X → Y, W → Y. After Meek-R1 (Y → Z fires
    // because X, Z not adjacent and X → Y — Z): Y → Z directed.
    const yToZ = result.edges.find(
      (e) =>
        e.source === "y" &&
        e.target === "z" &&
        (e.lag === undefined || e.lag === 0) &&
        e.endpointMarks?.targetMark === "arrow",
    );
    expect(yToZ).toBeDefined();
    // Diagnostics should record at least one R1 fire.
    const phase = result.diagnostics!.contemporaneousPhase as {
      meekR1Fires: number;
    };
    expect(phase.meekR1Fires).toBeGreaterThanOrEqual(1);
  });
});
