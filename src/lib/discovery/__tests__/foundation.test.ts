import { describe, it, expect } from "vitest";
import {
  buildDiscoveryRun,
  type Cohort,
  type DiscoveryAlgorithm,
  type DiscoveryResult,
} from "../index";

// ─── Test fixture: minimal in-memory cohort + stub algorithm ───────────
//
// This file deliberately does NOT depend on any ingester adapter or
// real algorithm. Its job is to assert the type contracts and the
// run-record builder behave the way the README claims they do — so a
// future PR adding the first real adapter / algorithm can rely on the
// foundation being honest.

function makeFixtureCohort(): Cohort {
  return {
    id: "test-cohort-001",
    label: "Synthetic 3-variable / 2-subject sanity cohort",
    source: {
      adapter: "test-fixture",
      adapterVersion: "0.0.1",
      sourceHash: "deadbeef",
      ingestedAt: "2026-04-29T00:00:00Z",
      containsPHI: false,
    },
    variables: [
      { id: "x", label: "X", kind: "continuous" },
      { id: "y", label: "Y", kind: "continuous" },
      { id: "z", label: "Z", kind: "continuous" },
    ],
    subjects: [
      {
        id: "s001",
        measurements: [
          { variableId: "x", t: 0, value: 1.0 },
          { variableId: "y", t: 0, value: 2.0 },
          { variableId: "z", t: 0, value: 3.0 },
        ],
      },
      {
        id: "s002",
        measurements: [
          { variableId: "x", t: 0, value: 1.5 },
          { variableId: "y", t: 0, value: 2.5 },
          { variableId: "z", t: 0, value: 3.5 },
        ],
      },
    ],
    timeAxis: { zeroConvention: "session-start", displayUnit: "seconds" },
    metadata: {
      description: "Fixture cohort for foundation tests.",
      accessTier: "public",
    },
  };
}

interface StubParams {
  /** Edge strength to emit on the single fake edge. */
  strength: number;
}

const stubAlgorithm: DiscoveryAlgorithm<StubParams> = {
  id: "stub-test-algo",
  version: "0.0.1",
  description: "Returns one fixed edge for foundation testing.",
  defaultParams: { strength: 0.5 },
  run(cohort, params): DiscoveryResult {
    const p = { ...this.defaultParams, ...params };
    return {
      variables: cohort.variables.map((v) => v.id),
      edges: [
        {
          source: "x",
          target: "y",
          strength: p.strength,
          evidence: "Stub algorithm — fixed edge for testing.",
        },
      ],
    };
  },
};

describe("discovery foundation — schema + run builder", () => {
  it("Cohort source.containsPHI is hard-typed false", () => {
    const c = makeFixtureCohort();
    // Type-level assertion: the next line would fail to compile if
    // containsPHI were not the literal `false`.
    const isFalse: false = c.source.containsPHI;
    expect(isFalse).toBe(false);
  });

  it("stub algorithm returns variables ⊆ cohort.variables", () => {
    const cohort = makeFixtureCohort();
    const result = stubAlgorithm.run(cohort);
    const cohortVars = new Set(cohort.variables.map((v) => v.id));
    for (const v of result.variables) {
      expect(cohortVars.has(v)).toBe(true);
    }
  });

  it("every discovered edge references variables that appear in result.variables", () => {
    const cohort = makeFixtureCohort();
    const result = stubAlgorithm.run(cohort);
    const resultVars = new Set(result.variables);
    for (const edge of result.edges) {
      expect(resultVars.has(edge.source)).toBe(true);
      expect(resultVars.has(edge.target)).toBe(true);
    }
  });

  it("stub algorithm honours param overrides", () => {
    const cohort = makeFixtureCohort();
    const result = stubAlgorithm.run(cohort, { strength: 0.91 });
    expect(result.edges[0].strength).toBeCloseTo(0.91, 6);
  });

  it("buildDiscoveryRun assembles a complete record from inputs", () => {
    const cohort = makeFixtureCohort();
    const result = stubAlgorithm.run(cohort);
    const run = buildDiscoveryRun({
      id: "run-001",
      cohort,
      algorithm: { id: stubAlgorithm.id, version: stubAlgorithm.version },
      params: { strength: 0.5 },
      startedAt: "2026-04-29T00:00:00Z",
      completedAt: "2026-04-29T00:00:01Z",
      result,
    });

    expect(run.id).toBe("run-001");
    expect(run.cohortId).toBe(cohort.id);
    expect(run.cohortSourceHash).toBe("deadbeef");
    expect(run.status).toBe("succeeded");
    expect(run.algorithm.id).toBe(stubAlgorithm.id);
    expect(run.result.edges).toHaveLength(1);
  });

  it("a run record is JSON-serialisable (the audit format)", () => {
    const cohort = makeFixtureCohort();
    const run = buildDiscoveryRun({
      id: "run-002",
      cohort,
      algorithm: { id: stubAlgorithm.id, version: stubAlgorithm.version },
      params: {},
      startedAt: "2026-04-29T00:00:00Z",
      completedAt: "2026-04-29T00:00:01Z",
      result: stubAlgorithm.run(cohort),
    });

    const json = JSON.stringify(run);
    const parsed = JSON.parse(json);
    expect(parsed.id).toBe("run-002");
    expect(parsed.cohortId).toBe(cohort.id);
    expect(parsed.result.edges[0].source).toBe("x");
  });
});
