import { describe, it, expect } from "vitest";
import { fciAlgorithm } from "../algorithms/fci";
import type { Cohort } from "../cohort-types";

// ─── Helpers ──────────────────────────────────────────────────────────
//
// Each helper builds a cohort whose ground-truth structural model is
// one of the canonical patterns FCI must distinguish: independent,
// chain, fork (observed confounder), collider. Sample sizes are kept
// small enough for fast tests but large enough that partial-correlation
// CI tests have power.

const COHORT_FRAME = {
  source: {
    adapter: "test",
    adapterVersion: "0",
    ingestedAt: "2026-04-29T00:00:00Z",
    containsPHI: false as const,
  },
  timeAxis: {
    zeroConvention: "subject-session-start" as const,
    displayUnit: "seconds" as const,
  },
  metadata: { description: "test", accessTier: "public" as const },
};

function makeRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return ((state >>> 8) / 0xffffff) * 2 - 1;
  };
}

function gauss(rand: () => number): number {
  // Box–Muller with the LCG.
  const u = (rand() + 1) / 2 + 1e-9;
  const v = (rand() + 1) / 2;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function buildCohort(opts: {
  variableIds: string[];
  generate: (i: number, rand: () => number) => Record<string, number>;
  nSubjects: number;
  nSteps: number;
  seed: number;
}): Cohort {
  const { variableIds, generate, nSubjects, nSteps, seed } = opts;
  const subjects = Array.from({ length: nSubjects }, (_, si) => {
    const rand = makeRng(seed + si * 7919);
    const measurements: { variableId: string; t: number; value: number }[] = [];
    for (let i = 0; i < nSteps; i++) {
      const sample = generate(i, rand);
      for (const id of variableIds) {
        measurements.push({ variableId: id, t: i * 300, value: sample[id] });
      }
    }
    return { id: `subject-${si}`, measurements };
  });
  return {
    id: "test-cohort",
    label: "synthetic",
    source: COHORT_FRAME.source,
    variables: variableIds.map((id) => ({
      id,
      label: id.toUpperCase(),
      kind: "continuous" as const,
      cadenceSeconds: 300,
    })),
    subjects,
    timeAxis: COHORT_FRAME.timeAxis,
    metadata: COHORT_FRAME.metadata,
  };
}

function findEdge(
  edges: { source: string; target: string }[],
  a: string,
  b: string,
) {
  return edges.find(
    (e) =>
      (e.source === a && e.target === b) || (e.source === b && e.target === a),
  );
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("fciAlgorithm — registry metadata", () => {
  it("declares id, version, description, defaults", () => {
    expect(fciAlgorithm.id).toBe("fci");
    expect(fciAlgorithm.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(fciAlgorithm.description).toContain("FCI");
    expect(fciAlgorithm.defaultParams.alpha).toBeGreaterThan(0);
    expect(fciAlgorithm.defaultParams.alpha).toBeLessThan(1);
  });
});

describe("fciAlgorithm — pattern recovery", () => {
  it("produces no edges for three independent variables", () => {
    // Tight alpha keeps false-positive rate ~1% per pair, so the joint
    // expected count across 3 pairs stays well below 1 — robust to
    // random-seed jitter without seed-fishing.
    const cohort = buildCohort({
      variableIds: ["x", "y", "z"],
      generate: (_, rand) => ({
        x: gauss(rand),
        y: gauss(rand),
        z: gauss(rand),
      }),
      nSubjects: 4,
      nSteps: 400,
      seed: 100,
    });
    const result = fciAlgorithm.run(cohort, { alpha: 0.01 });
    expect(result.edges).toHaveLength(0);
  });

  it("recovers the chain X → Y → Z (skeleton: X-Y, Y-Z; X-Z separated by Y)", () => {
    const cohort = buildCohort({
      variableIds: ["x", "y", "z"],
      generate: (_, rand) => {
        const x = gauss(rand);
        const y = 0.9 * x + 0.4 * gauss(rand);
        const z = 0.9 * y + 0.4 * gauss(rand);
        return { x, y, z };
      },
      nSubjects: 3,
      nSteps: 300,
      seed: 200,
    });
    const result = fciAlgorithm.run(cohort);
    expect(findEdge(result.edges, "x", "y")).toBeDefined();
    expect(findEdge(result.edges, "y", "z")).toBeDefined();
    expect(findEdge(result.edges, "x", "z")).toBeUndefined();
  });

  it("does not mark a chain as a v-structure (Y stays circle, not arrowhead)", () => {
    const cohort = buildCohort({
      variableIds: ["x", "y", "z"],
      generate: (_, rand) => {
        const x = gauss(rand);
        const y = 0.9 * x + 0.4 * gauss(rand);
        const z = 0.9 * y + 0.4 * gauss(rand);
        return { x, y, z };
      },
      nSubjects: 3,
      nSteps: 300,
      seed: 201,
    });
    const result = fciAlgorithm.run(cohort);
    const xy = findEdge(result.edges, "x", "y")!;
    const yz = findEdge(result.edges, "y", "z")!;
    // Neither edge should have an arrowhead at the Y end (Y is a separator).
    const yMarkOnXY = xy.source === "y" ? xy.endpointMarks?.sourceMark : xy.endpointMarks?.targetMark;
    const yMarkOnYZ = yz.source === "y" ? yz.endpointMarks?.sourceMark : yz.endpointMarks?.targetMark;
    expect(yMarkOnXY).not.toBe("arrow");
    expect(yMarkOnYZ).not.toBe("arrow");
  });

  it("recovers a fork X ← Z → Y (skeleton: X-Z, Z-Y; X-Y separated by Z)", () => {
    const cohort = buildCohort({
      variableIds: ["x", "y", "z"],
      generate: (_, rand) => {
        const z = gauss(rand);
        const x = 0.9 * z + 0.4 * gauss(rand);
        const y = 0.9 * z + 0.4 * gauss(rand);
        return { x, y, z };
      },
      nSubjects: 3,
      nSteps: 300,
      seed: 300,
    });
    const result = fciAlgorithm.run(cohort);
    expect(findEdge(result.edges, "x", "z")).toBeDefined();
    expect(findEdge(result.edges, "y", "z")).toBeDefined();
    expect(findEdge(result.edges, "x", "y")).toBeUndefined();
  });

  it("orients a collider X → Z ← Y as a v-structure (arrowheads at Z)", () => {
    const cohort = buildCohort({
      variableIds: ["x", "y", "z"],
      generate: (_, rand) => {
        const x = gauss(rand);
        const y = gauss(rand);
        const z = 0.9 * x + 0.9 * y + 0.4 * gauss(rand);
        return { x, y, z };
      },
      nSubjects: 4,
      nSteps: 350,
      seed: 400,
    });
    const result = fciAlgorithm.run(cohort);
    const xz = findEdge(result.edges, "x", "z");
    const yz = findEdge(result.edges, "y", "z");
    expect(xz).toBeDefined();
    expect(yz).toBeDefined();
    // The X-Y edge should be absent (independent marginally).
    expect(findEdge(result.edges, "x", "y")).toBeUndefined();
    // Both incident edges must carry an arrowhead at the Z endpoint.
    const zMarkOnXZ = xz!.source === "z" ? xz!.endpointMarks?.sourceMark : xz!.endpointMarks?.targetMark;
    const zMarkOnYZ = yz!.source === "z" ? yz!.endpointMarks?.sourceMark : yz!.endpointMarks?.targetMark;
    expect(zMarkOnXZ).toBe("arrow");
    expect(zMarkOnYZ).toBe("arrow");
  });
});

describe("fciAlgorithm — output shape", () => {
  it("attaches endpointMarks to every emitted edge", () => {
    const cohort = buildCohort({
      variableIds: ["x", "y"],
      generate: (_, rand) => {
        const x = gauss(rand);
        const y = 0.9 * x + 0.3 * gauss(rand);
        return { x, y };
      },
      nSubjects: 3,
      nSteps: 250,
      seed: 500,
    });
    const result = fciAlgorithm.run(cohort);
    expect(result.edges.length).toBeGreaterThan(0);
    for (const e of result.edges) {
      expect(e.endpointMarks).toBeDefined();
      expect(["circle", "arrow", "tail"]).toContain(e.endpointMarks!.sourceMark);
      expect(["circle", "arrow", "tail"]).toContain(e.endpointMarks!.targetMark);
    }
  });

  it("returns variables matching the cohort's variable ids", () => {
    const cohort = buildCohort({
      variableIds: ["a", "b", "c"],
      generate: (_, rand) => ({ a: gauss(rand), b: gauss(rand), c: gauss(rand) }),
      nSubjects: 2,
      nSteps: 200,
      seed: 600,
    });
    const result = fciAlgorithm.run(cohort);
    expect(result.variables).toEqual(["a", "b", "c"]);
  });

  it("emits diagnostics with sample size and sepset count", () => {
    const cohort = buildCohort({
      variableIds: ["x", "y", "z"],
      generate: (_, rand) => {
        const x = gauss(rand);
        const y = 0.9 * x + 0.3 * gauss(rand);
        const z = 0.9 * y + 0.3 * gauss(rand);
        return { x, y, z };
      },
      nSubjects: 3,
      nSteps: 300,
      seed: 700,
    });
    const result = fciAlgorithm.run(cohort);
    expect(result.diagnostics).toBeDefined();
    expect(typeof (result.diagnostics as { sampleSize: number }).sampleSize).toBe("number");
    expect(typeof (result.diagnostics as { sepsetCount: number }).sepsetCount).toBe("number");
  });

  it("returns empty edges with reason diagnostic when no subject grids meet minGridPoints", () => {
    const cohort = buildCohort({
      variableIds: ["x", "y"],
      generate: (_, rand) => ({ x: gauss(rand), y: gauss(rand) }),
      nSubjects: 1,
      nSteps: 5,
      seed: 800,
    });
    const result = fciAlgorithm.run(cohort);
    expect(result.edges).toEqual([]);
    expect((result.diagnostics as { reason?: string }).reason).toBeDefined();
  });
});
