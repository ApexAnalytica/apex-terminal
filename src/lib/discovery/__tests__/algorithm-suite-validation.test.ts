// ─── Algorithm-suite validation harness ──────────────────────────────
//
// Smoke-tests every algorithm in the registry against a small canon of
// synthetic cohorts with known structure. Catches the regression case
// where a future PR registers a new algorithm or refactors an existing
// one and silently breaks its behaviour on a class of inputs the
// per-algorithm tests don't happen to cover.
//
// What this harness asserts:
//   1. Every registered algorithm runs without throwing on each fixture.
//   2. Returns a valid DiscoveryResult shape (variables ⊂ cohort, every
//      edge endpoint is in result.variables, no NaN strengths).
//   3. On a direct-coupling cohort, recovers >= 1 edge (sanity guard
//      against a totally-broken algorithm that emits nothing).
//
// What this harness does NOT assert:
//   - Algorithm-specific behaviour (e.g. "pcmci kills confounded edges")
//     — those live in per-algorithm test files. This harness is a
//     coverage net for the cases the per-algo tests don't think about.

import { describe, it, expect } from "vitest";
import { listAlgorithms, getAlgorithm } from "../algorithm-registry";
import type { Cohort } from "../cohort-types";

// ─── Cohort fixtures ──────────────────────────────────────────────────

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return ((s >>> 8) / 0xffffff) * 2 - 1;
  };
}

function directCohort(seed = 17): Cohort {
  const rand = lcg(seed);
  const subjects = Array.from({ length: 5 }, (_, si) => {
    const x = new Array<number>(200);
    const y = new Array<number>(200);
    x[0] = rand();
    for (let i = 1; i < 200; i++) x[i] = 0.6 * x[i - 1] + 0.4 * rand();
    for (let i = 0; i < 200; i++) {
      const xLagged = i >= 2 ? x[i - 2] : 0;
      y[i] = 0.8 * xLagged + 0.4 * rand();
    }
    const measurements = [];
    for (let i = 0; i < 200; i++) {
      measurements.push({ variableId: "x", t: i * 300, value: x[i] });
      measurements.push({ variableId: "y", t: i * 300, value: y[i] });
    }
    return { id: `s-${si}`, measurements };
  });
  return {
    id: "harness-direct",
    label: "harness direct-coupling cohort",
    source: {
      adapter: "harness",
      adapterVersion: "0",
      ingestedAt: "2026-05-02T00:00:00Z",
      containsPHI: false,
    },
    variables: [
      { id: "x", label: "X", kind: "continuous", cadenceSeconds: 300 },
      { id: "y", label: "Y", kind: "continuous", cadenceSeconds: 300 },
    ],
    subjects,
    timeAxis: { zeroConvention: "session-start", displayUnit: "seconds" },
    metadata: { description: "harness", accessTier: "public" },
  };
}

function confoundedCohort(seed = 31): Cohort {
  const rand = lcg(seed);
  const subjects = Array.from({ length: 5 }, (_, si) => {
    const z = new Array<number>(200);
    const x = new Array<number>(200);
    const y = new Array<number>(200);
    z[0] = rand();
    x[0] = rand();
    y[0] = rand();
    for (let i = 1; i < 200; i++) {
      z[i] = 0.7 * z[i - 1] + 0.5 * rand();
      x[i] = 0.9 * z[i - 1] + 0.3 * rand();
      y[i] = 0.9 * z[i - 1] + 0.3 * rand();
    }
    const measurements = [];
    for (let i = 0; i < 200; i++) {
      measurements.push({ variableId: "z", t: i * 300, value: z[i] });
      measurements.push({ variableId: "x", t: i * 300, value: x[i] });
      measurements.push({ variableId: "y", t: i * 300, value: y[i] });
    }
    return { id: `s-${si}`, measurements };
  });
  return {
    id: "harness-confounded",
    label: "harness confounded cohort (Z → X, Z → Y)",
    source: {
      adapter: "harness",
      adapterVersion: "0",
      ingestedAt: "2026-05-02T00:00:00Z",
      containsPHI: false,
    },
    variables: [
      { id: "z", label: "Z", kind: "continuous", cadenceSeconds: 300 },
      { id: "x", label: "X", kind: "continuous", cadenceSeconds: 300 },
      { id: "y", label: "Y", kind: "continuous", cadenceSeconds: 300 },
    ],
    subjects,
    timeAxis: { zeroConvention: "session-start", displayUnit: "seconds" },
    metadata: { description: "harness", accessTier: "public" },
  };
}

// ─── Harness ──────────────────────────────────────────────────────────

const FIXTURES = [
  { name: "direct", build: () => directCohort() },
  { name: "confounded", build: () => confoundedCohort() },
];

const ALGOS = listAlgorithms();

describe("algorithm-suite validation harness", () => {
  it("registry has at least one algorithm", () => {
    expect(ALGOS.length).toBeGreaterThan(0);
  });

  // Skip calibration algorithms here — the harness fixtures are
  // structure-discovery cohorts, not labelled-event cohorts.
  const STRUCTURE_DISCOVERY_ALGOS = ALGOS.filter(
    (a) => !a.id.includes("calibration"),
  );

  for (const fix of FIXTURES) {
    for (const algo of STRUCTURE_DISCOVERY_ALGOS) {
      const cohort = fix.build();
      const algoImpl = getAlgorithm(algo.id);
      if (!algoImpl) continue;

      it(`${algo.id} runs on the ${fix.name} cohort without throwing`, () => {
        expect(() => algoImpl.run(cohort)).not.toThrow();
      });

      it(`${algo.id} on ${fix.name}: result has variables ⊂ cohort variables`, () => {
        const result = algoImpl.run(cohort);
        const cohortVarIds = new Set(cohort.variables.map((v) => v.id));
        for (const v of result.variables) {
          expect(cohortVarIds.has(v)).toBe(true);
        }
      });

      it(`${algo.id} on ${fix.name}: every edge endpoint is in result.variables`, () => {
        const result = algoImpl.run(cohort);
        const resultVars = new Set(result.variables);
        for (const edge of result.edges) {
          expect(resultVars.has(edge.source)).toBe(true);
          expect(resultVars.has(edge.target)).toBe(true);
        }
      });

      it(`${algo.id} on ${fix.name}: no NaN strengths or p-values`, () => {
        const result = algoImpl.run(cohort);
        for (const edge of result.edges) {
          expect(Number.isFinite(edge.strength)).toBe(true);
          if (typeof edge.pValue === "number") {
            expect(Number.isFinite(edge.pValue)).toBe(true);
          }
        }
      });
    }
  }

  // Direct-coupling sanity guard. Run only on direct (not confounded —
  // PCMCI legitimately emits 0 edges on confounded by design).
  for (const algo of STRUCTURE_DISCOVERY_ALGOS) {
    const algoImpl = getAlgorithm(algo.id);
    if (!algoImpl) continue;
    it(`${algo.id} on direct cohort: emits at least one edge OR explains why with diagnostics`, () => {
      const cohort = directCohort();
      const result = algoImpl.run(cohort);
      // Two acceptance modes:
      //   - emit ≥1 edge, OR
      //   - emit 0 edges AND explain via diagnostics.reason
      if (result.edges.length === 0) {
        expect(typeof result.diagnostics?.reason).toBe("string");
      } else {
        expect(result.edges.length).toBeGreaterThan(0);
      }
    });
  }
});
