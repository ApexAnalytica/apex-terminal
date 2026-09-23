import { describe, it, expect } from "vitest";
import {
  notearsMlpAlgorithm,
  __testing,
} from "../algorithms/notears-mlp";
import type { Cohort } from "../cohort-types";

const { initMLP, mlpForward, derivedAdjacency, hAndGradOnAdj } = __testing;

// ─── Synthetic cohort builder (shared shape with notears.test.ts) ─────

const COHORT_FRAME = {
  source: {
    adapter: "test",
    adapterVersion: "0",
    ingestedAt: "2026-05-23T00:00:00Z",
    containsPHI: false as const,
  },
  timeAxis: {
    zeroConvention: "subject-session-start" as const,
    displayUnit: "seconds" as const,
  },
  metadata: { description: "test", accessTier: "public" as const },
};

function lcg(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return ((state >>> 8) / 0xffffff) * 2 - 1;
  };
}

function gauss(rand: () => number): number {
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
    const rand = lcg(seed + si * 7919);
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
    (e) => (e.source === a && e.target === b) || (e.source === b && e.target === a),
  );
}

// ─── MLP primitive tests ──────────────────────────────────────────────

describe("NOTEARS-MLP — primitives", () => {
  it("initMLP pins the self-input column to zero", () => {
    const mlp = initMLP(4, 6, 2, 0.5);
    for (let h = 0; h < mlp.W1.length; h++) {
      expect(mlp.W1[h][2]).toBe(0);
    }
  });

  it("mlpForward returns a finite scalar for a typical input", () => {
    const mlp = initMLP(3, 4, 0, 0.3);
    const { y } = mlpForward(mlp, [1, 0.5, -0.5]);
    expect(Number.isFinite(y)).toBe(true);
  });

  it("derivedAdjacency: A[i, j] = column-norm of MLP_j's first layer at input i; A[j, j] = 0", () => {
    const mlps = [
      initMLP(3, 4, 0, 0.3),
      initMLP(3, 4, 1, 0.3),
      initMLP(3, 4, 2, 0.3),
    ];
    const A = derivedAdjacency(mlps);
    expect(A.length).toBe(3);
    expect(A[0][0]).toBe(0);
    expect(A[1][1]).toBe(0);
    expect(A[2][2]).toBe(0);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (i === j) continue;
        expect(A[i][j]).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(A[i][j])).toBe(true);
      }
    }
  });

  it("hAndGradOnAdj: h(0) = 0 and h(A) > 0 for cyclic A", () => {
    const zero = [
      [0, 0],
      [0, 0],
    ];
    expect(hAndGradOnAdj(zero, 20).h).toBeCloseTo(0, 6);

    // 2-cycle: A[0][1] = A[1][0] = 1
    const cycle = [
      [0, 1],
      [1, 0],
    ];
    expect(hAndGradOnAdj(cycle, 20).h).toBeGreaterThan(0);
  });
});

// ─── Registry + output-shape contracts ─────────────────────────────────

describe("notearsMlpAlgorithm — registry metadata", () => {
  it("declares id, version, description, defaults", () => {
    expect(notearsMlpAlgorithm.id).toBe("notears-mlp");
    expect(notearsMlpAlgorithm.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(notearsMlpAlgorithm.description).toContain("NOTEARS-MLP");
    expect(notearsMlpAlgorithm.defaultParams.hiddenSize).toBeGreaterThan(0);
    expect(notearsMlpAlgorithm.defaultParams.edgeThreshold).toBeGreaterThan(0);
  });
});

describe("notearsMlpAlgorithm — output shape", () => {
  it("returns variables matching the cohort's variable ids", () => {
    const cohort = buildCohort({
      variableIds: ["a", "b", "c"],
      generate: (_, rand) => ({ a: gauss(rand), b: gauss(rand), c: gauss(rand) }),
      nSubjects: 2,
      nSteps: 80,
      seed: 600,
    });
    const result = notearsMlpAlgorithm.run(cohort, {
      maxOuterIter: 2,
      maxInnerIter: 20,
    });
    expect(result.variables).toEqual(["a", "b", "c"]);
  });

  it("emits diagnostics with sampleSize + finalH + hiddenSize", () => {
    const cohort = buildCohort({
      variableIds: ["x", "y"],
      generate: (_, rand) => {
        const x = gauss(rand);
        return { x, y: 0.9 * x + 0.3 * gauss(rand) };
      },
      nSubjects: 2,
      nSteps: 80,
      seed: 601,
    });
    const result = notearsMlpAlgorithm.run(cohort, {
      maxOuterIter: 2,
      maxInnerIter: 20,
    });
    const diag = result.diagnostics as {
      sampleSize: number;
      finalH: number;
      hiddenSize: number;
    };
    expect(typeof diag.sampleSize).toBe("number");
    expect(typeof diag.finalH).toBe("number");
    expect(typeof diag.hiddenSize).toBe("number");
  });

  it("returns empty edges + reason diagnostic when no subject grids meet minGridPoints", () => {
    const cohort = buildCohort({
      variableIds: ["x", "y"],
      generate: (_, rand) => ({ x: gauss(rand), y: gauss(rand) }),
      nSubjects: 1,
      nSteps: 5,
      seed: 602,
    });
    const result = notearsMlpAlgorithm.run(cohort);
    expect(result.edges).toEqual([]);
    expect((result.diagnostics as { reason?: string }).reason).toBeDefined();
  });

  it("does not emit self-loops", () => {
    const cohort = buildCohort({
      variableIds: ["x", "y"],
      generate: (_, rand) => {
        const x = gauss(rand);
        return { x, y: 0.9 * x + 0.3 * gauss(rand) };
      },
      nSubjects: 2,
      nSteps: 80,
      seed: 603,
    });
    const result = notearsMlpAlgorithm.run(cohort, {
      maxOuterIter: 2,
      maxInnerIter: 20,
    });
    expect(result.edges.every((e) => e.source !== e.target)).toBe(true);
  });
});

// ─── Pattern-recovery — adjacency, not direction ──────────────────────
//
// NOTEARS-MLP shares NOTEARS's varsortability sensitivity; direction is
// approximate under symmetric Gaussian noise. We only assert adjacency
// on the linear-chain DGP. The nonlinear-detection capability is tested
// separately below — that's the differentiated win vs linear NOTEARS.

describe("notearsMlpAlgorithm — pattern recovery (linear chain baseline)", () => {
  it("recovers the chain X → Y → Z as adjacency", () => {
    const cohort = buildCohort({
      variableIds: ["x", "y", "z"],
      generate: (_, rand) => {
        const x = gauss(rand);
        const y = 0.9 * x + 0.3 * gauss(rand);
        const z = 0.9 * y + 0.3 * gauss(rand);
        return { x, y, z };
      },
      nSubjects: 3,
      nSteps: 200,
      seed: 700,
    });
    const result = notearsMlpAlgorithm.run(cohort, {
      maxOuterIter: 4,
      maxInnerIter: 60,
    });
    // Expect at least one adjacency from {X,Y} and {Y,Z} or transitive {X,Z}.
    const xy = findEdge(result.edges, "x", "y");
    const yzOrXz =
      findEdge(result.edges, "y", "z") || findEdge(result.edges, "x", "z");
    expect(xy).toBeDefined();
    expect(yzOrXz).toBeDefined();
  });
});

describe("notearsMlpAlgorithm — nonlinear detection (the differentiated win)", () => {
  it("recovers the adjacency on Y = sin(X) + noise where linear NOTEARS would miss", () => {
    // Pearson r(X, Y) ≈ 0 because sin is symmetric around 0, so linear
    // NOTEARS sees no signal. NOTEARS-MLP captures the nonlinear coupling
    // through the tanh-activated hidden layer.
    const cohort = buildCohort({
      variableIds: ["x", "y"],
      generate: (_, rand) => {
        const x = gauss(rand) * Math.PI;
        const y = Math.sin(x) + 0.2 * gauss(rand);
        return { x, y };
      },
      nSubjects: 3,
      nSteps: 200,
      seed: 800,
    });
    const result = notearsMlpAlgorithm.run(cohort, {
      maxOuterIter: 4,
      maxInnerIter: 60,
      edgeThreshold: 0.15,
    });
    const adj = findEdge(result.edges, "x", "y");
    expect(adj).toBeDefined();
  });
});
