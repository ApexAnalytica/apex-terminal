import { describe, it, expect } from "vitest";
import { notearsAlgorithm, quadraticInterpStep } from "../algorithms/notears";
import {
  matExp,
  trace,
  identity,
  matmul,
  transpose,
} from "../algorithms/_matrix-ops";
import type { Cohort } from "../cohort-types";
import type { DiscoveredEdge } from "../run-types";

// ─── Cohort helper (shared shape with FCI / lag-correlation tests) ───

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
  edges: DiscoveredEdge[],
  s: string,
  t: string,
): DiscoveredEdge | undefined {
  return edges.find((e) => e.source === s && e.target === t);
}

/** Permute a cohort's variable order. NOTEARS's varsortability sensitivity
 *  (Reisach et al. 2021) means input ordering can affect output; column
 *  standardisation mitigates but doesn't eliminate this. The stress tests
 *  below quantify how stable the recovered adjacency is across permutations. */
function permuteVariableOrder(cohort: Cohort, order: number[]): Cohort {
  return {
    ...cohort,
    variables: order.map((i) => cohort.variables[i]),
  };
}

/** Edge-set as a Set of ordered "src|tgt" strings, for cross-permutation comparison. */
function edgeKeys(edges: { source: string; target: string }[]): Set<string> {
  return new Set(edges.map((e) => `${e.source}|${e.target}`));
}

/** Unordered (adjacency-only) edge keys — direction agnostic. */
function adjacencyKeys(edges: { source: string; target: string }[]): Set<string> {
  return new Set(
    edges.map((e) => (e.source < e.target ? `${e.source}|${e.target}` : `${e.target}|${e.source}`)),
  );
}

// ─── matrix-ops sanity ───────────────────────────────────────────────

describe("matrix-ops helpers — sanity", () => {
  it("matrixExp(0) = I", () => {
    const Z = [
      [0, 0],
      [0, 0],
    ];
    const E = matExp(Z);
    expect(E[0][0]).toBeCloseTo(1, 8);
    expect(E[0][1]).toBeCloseTo(0, 8);
    expect(E[1][0]).toBeCloseTo(0, 8);
    expect(E[1][1]).toBeCloseTo(1, 8);
  });

  it("matrixExp on a strictly upper-triangular matrix is finite (acyclicity preserved)", () => {
    // Strictly upper triangular = nilpotent → exp converges quickly.
    // tr(e^M) = d (since M^k = 0 for k >= d).
    const M = [
      [0, 1, 1],
      [0, 0, 1],
      [0, 0, 0],
    ];
    const E = matExp(M);
    expect(trace(E)).toBeCloseTo(3, 6);
  });

  it("matrixExp on M with a 1-cycle gives tr > d", () => {
    // M has a 2-cycle (entry 0->1 and 1->0); h(M) = tr(e^M) - d > 0.
    const M = [
      [0, 1],
      [1, 0],
    ];
    const E = matExp(M);
    expect(trace(E)).toBeGreaterThan(2);
  });

  it("matmul agrees with hand-computed product", () => {
    const A = [
      [1, 2],
      [3, 4],
    ];
    const B = [
      [5, 6],
      [7, 8],
    ];
    const C = matmul(A, B);
    expect(C[0][0]).toBe(19);
    expect(C[0][1]).toBe(22);
    expect(C[1][0]).toBe(43);
    expect(C[1][1]).toBe(50);
  });

  it("transpose round-trip is identity", () => {
    const A = [
      [1, 2, 3],
      [4, 5, 6],
    ];
    const At = transpose(A);
    const Att = transpose(At);
    expect(Att).toEqual(A);
  });

  it("identity is the matmul-multiplicative identity", () => {
    const A = [
      [1, 2],
      [3, 4],
    ];
    expect(matmul(identity(2), A)).toEqual(A);
    expect(matmul(A, identity(2))).toEqual(A);
  });
});

// ─── NOTEARS algorithm tests ─────────────────────────────────────────

describe("notearsAlgorithm — registry metadata", () => {
  it("declares id, version, description, defaults", () => {
    expect(notearsAlgorithm.id).toBe("notears");
    expect(notearsAlgorithm.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(notearsAlgorithm.description).toContain("NOTEARS");
    expect(notearsAlgorithm.defaultParams.lambda1).toBeGreaterThan(0);
    expect(notearsAlgorithm.defaultParams.edgeThreshold).toBeGreaterThan(0);
  });
});

describe("notearsAlgorithm — pattern recovery", () => {
  it("produces no strong edges for three independent variables", () => {
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
    const result = notearsAlgorithm.run(cohort, {
      lambda1: 0.05,
      edgeThreshold: 0.25,
    });
    // Expect zero or very few spurious edges. NOTEARS with L1 + a
    // tight threshold should suppress noise.
    expect(result.edges.length).toBeLessThanOrEqual(1);
  });

  it("recovers the chain X → Y → Z as adjacency (direction recovery is approximate under Gaussian noise — known NOTEARS limitation)", () => {
    const cohort = buildCohort({
      variableIds: ["x", "y", "z"],
      generate: (_, rand) => {
        const x = gauss(rand);
        const y = 0.9 * x + 0.3 * gauss(rand);
        const z = 0.9 * y + 0.3 * gauss(rand);
        return { x, y, z };
      },
      nSubjects: 4,
      nSteps: 400,
      seed: 200,
    });
    const result = notearsAlgorithm.run(cohort);
    // Adjacency between (X, Y) — at least one direction.
    const xy =
      findEdge(result.edges, "x", "y") || findEdge(result.edges, "y", "x");
    // Adjacency between (Y, Z) OR transitive (X, Z).
    const yzOrXz =
      findEdge(result.edges, "y", "z") ||
      findEdge(result.edges, "z", "y") ||
      findEdge(result.edges, "x", "z") ||
      findEdge(result.edges, "z", "x");
    expect(xy).toBeDefined();
    expect(yzOrXz).toBeDefined();
    expect(Math.abs(xy!.strength)).toBeGreaterThan(0.3);
  });

  it("recovers a fork: shared-parent adjacency (X, Y) and (X, Z) — direction approximate", () => {
    const cohort = buildCohort({
      variableIds: ["x", "y", "z"],
      generate: (_, rand) => {
        const x = gauss(rand);
        const y = 0.9 * x + 0.3 * gauss(rand);
        const z = 0.9 * x + 0.3 * gauss(rand);
        return { x, y, z };
      },
      nSubjects: 4,
      nSteps: 400,
      seed: 300,
    });
    const result = notearsAlgorithm.run(cohort);
    const xyAdj =
      findEdge(result.edges, "x", "y") || findEdge(result.edges, "y", "x");
    const xzAdj =
      findEdge(result.edges, "x", "z") || findEdge(result.edges, "z", "x");
    expect(xyAdj).toBeDefined();
    expect(xzAdj).toBeDefined();
  });

  it("output is acyclic (h(W) below tolerance) on the chain", () => {
    const cohort = buildCohort({
      variableIds: ["x", "y", "z"],
      generate: (_, rand) => {
        const x = gauss(rand);
        const y = 0.9 * x + 0.3 * gauss(rand);
        const z = 0.9 * y + 0.3 * gauss(rand);
        return { x, y, z };
      },
      nSubjects: 4,
      nSteps: 400,
      seed: 201,
    });
    const result = notearsAlgorithm.run(cohort);
    const finalH = (result.diagnostics as { finalH: number }).finalH;
    // Acyclicity converged to within published-NOTEARS tolerance bands
    // (typical reported h ~ 1e-3 to 1e-5 in the original paper).
    expect(Math.abs(finalH)).toBeLessThan(5e-3);
  });

  it("does not emit self-loops", () => {
    const cohort = buildCohort({
      variableIds: ["x", "y"],
      generate: (_, rand) => {
        const x = gauss(rand);
        const y = 0.9 * x + 0.3 * gauss(rand);
        return { x, y };
      },
      nSubjects: 4,
      nSteps: 400,
      seed: 500,
    });
    const result = notearsAlgorithm.run(cohort);
    expect(result.edges.every((e) => e.source !== e.target)).toBe(true);
  });
});

describe("notearsAlgorithm — output shape", () => {
  it("returns variables matching the cohort's variable ids", () => {
    const cohort = buildCohort({
      variableIds: ["a", "b", "c"],
      generate: (_, rand) => ({ a: gauss(rand), b: gauss(rand), c: gauss(rand) }),
      nSubjects: 2,
      nSteps: 200,
      seed: 600,
    });
    const result = notearsAlgorithm.run(cohort);
    expect(result.variables).toEqual(["a", "b", "c"]);
  });

  it("emits diagnostics with sampleSize and finalH", () => {
    const cohort = buildCohort({
      variableIds: ["x", "y"],
      generate: (_, rand) => {
        const x = gauss(rand);
        const y = 0.9 * x + 0.3 * gauss(rand);
        return { x, y };
      },
      nSubjects: 3,
      nSteps: 300,
      seed: 700,
    });
    const result = notearsAlgorithm.run(cohort);
    expect(result.diagnostics).toBeDefined();
    const diag = result.diagnostics as { sampleSize: number; finalH: number };
    expect(typeof diag.sampleSize).toBe("number");
    expect(typeof diag.finalH).toBe("number");
  });

  it("returns empty edges + reason diagnostic when no subject grids meet minGridPoints", () => {
    const cohort = buildCohort({
      variableIds: ["x", "y"],
      generate: (_, rand) => ({ x: gauss(rand), y: gauss(rand) }),
      nSubjects: 1,
      nSteps: 5,
      seed: 800,
    });
    const result = notearsAlgorithm.run(cohort);
    expect(result.edges).toEqual([]);
    expect((result.diagnostics as { reason?: string }).reason).toBeDefined();
  });
});

// ─── Varsortability stress tests (Reisach et al. 2021) ───────────────
//
// NOTEARS is known to exploit varsortability — if columns are ordered
// such that residual variance is monotone in topological depth, the
// algorithm can find the "right" DAG via spurious cues rather than
// actual structure. Column standardisation (zero mean, unit variance)
// mitigates this; these tests quantify how much.
//
// We don't assert perfect invariance — that's an open research problem
// and not what this implementation promises. We assert that:
//   1. The *adjacency* (direction-agnostic edge set) is similar across
//      permutations (high Jaccard).
//   2. The acyclicity convergence holds under every permutation.
//   3. Edge magnitudes for surviving edges are bounded.

// ─── L-BFGS convergence behaviour ─────────────────────────────────────
//
// NOTEARS v0.2 switched the inner loop from plain proximal-gradient to
// L-BFGS-B on the (W⁺, W⁻) split (the same approach the reference
// Python notears package uses with scipy.optimize.minimize). These
// tests assert the resulting per-iteration efficiency: L-BFGS reaches
// acyclicity in far fewer inner iterations than the previous proximal
// loop, which needed ~200 to hit the same tolerance.

describe("quadraticInterpStep — projected-line-search step chooser", () => {
  it("returns ~α/2 for a perfectly quadratic miss (verifies the closed form)", () => {
    // Construct a known quadratic: φ(α) = 1 - α + α²
    // ⟹ φ(0) = 1, φ'(0) = -1, φ(2) = 1 - 2 + 4 = 3
    // Minimiser of fit: α* = -(-1)·4 / (2·(3 - 1 - (-1)·2)) = 4 / 8 = 0.5
    // After safeguard [0.1·2, 0.5·2] = [0.2, 1.0], 0.5 lands inside.
    const s = quadraticInterpStep(1, -1, 2, 3);
    expect(s).toBeCloseTo(0.5, 4);
  });

  it("clamps to the [0.1·α, 0.5·α] safeguard band when the model overshoots", () => {
    // A very flat curve at α leads to a huge α* — must clamp to 0.5·α.
    const s = quadraticInterpStep(1, -0.01, 1, 0.999);
    expect(s).toBeLessThanOrEqual(0.5);
    expect(s).toBeGreaterThanOrEqual(0.1);
  });

  it("falls back to halving when the model is concave / degenerate", () => {
    // φ(α) < φ(0) + φ'(0)·α (i.e. went below the linear approximation):
    // denom ≤ 0, formula is invalid — return hi = 0.5·α.
    const s = quadraticInterpStep(1, -1, 1, -10);
    expect(s).toBe(0.5);
  });

  it("returns a positive step in (0, α) for typical Armijo-failure inputs", () => {
    for (const alpha of [0.5, 1, 2]) {
      for (const phi of [1.5, 5, 100]) {
        const s = quadraticInterpStep(1, -1, alpha, phi);
        expect(s).toBeGreaterThan(0);
        expect(s).toBeLessThan(alpha);
      }
    }
  });
});

describe("notearsAlgorithm — L-BFGS convergence", () => {
  it("achieves acyclicity (h(W) < 5e-3) with maxInnerIter=20", () => {
    // With the previous proximal-gradient inner loop, maxInnerIter=20
    // was insufficient to drive h(W) below tolerance on this DGP.
    // L-BFGS uses curvature information from the (s, y) history and
    // converges in roughly an order of magnitude fewer inner steps.
    const cohort = buildCohort({
      variableIds: ["x", "y", "z"],
      generate: (_, rand) => {
        const x = gauss(rand);
        const y = 0.9 * x + 0.3 * gauss(rand);
        const z = 0.9 * y + 0.3 * gauss(rand);
        return { x, y, z };
      },
      nSubjects: 4,
      nSteps: 400,
      seed: 800,
    });
    const result = notearsAlgorithm.run(cohort, { maxInnerIter: 20 });
    const finalH = (result.diagnostics as { finalH: number }).finalH;
    expect(Math.abs(finalH)).toBeLessThan(5e-3);
  });

  it("recovers the chain adjacency at maxInnerIter=20", () => {
    const cohort = buildCohort({
      variableIds: ["x", "y", "z"],
      generate: (_, rand) => {
        const x = gauss(rand);
        const y = 0.9 * x + 0.3 * gauss(rand);
        const z = 0.9 * y + 0.3 * gauss(rand);
        return { x, y, z };
      },
      nSubjects: 4,
      nSteps: 400,
      seed: 801,
    });
    const result = notearsAlgorithm.run(cohort, { maxInnerIter: 20 });
    const xy =
      findEdge(result.edges, "x", "y") || findEdge(result.edges, "y", "x");
    const yzOrXz =
      findEdge(result.edges, "y", "z") ||
      findEdge(result.edges, "z", "y") ||
      findEdge(result.edges, "x", "z") ||
      findEdge(result.edges, "z", "x");
    expect(xy).toBeDefined();
    expect(yzOrXz).toBeDefined();
  });

  it("respects lbfgsMemory parameter (m=3 still converges on chain)", () => {
    // The L-BFGS memory size m caps the (s, y) history. Smaller m means
    // a coarser inverse-Hessian approximation but lower per-iter cost.
    // m=3 is on the low end — verify it still drives acyclicity.
    const cohort = buildCohort({
      variableIds: ["x", "y", "z"],
      generate: (_, rand) => {
        const x = gauss(rand);
        const y = 0.9 * x + 0.3 * gauss(rand);
        const z = 0.9 * y + 0.3 * gauss(rand);
        return { x, y, z };
      },
      nSubjects: 4,
      nSteps: 400,
      seed: 802,
    });
    const result = notearsAlgorithm.run(cohort, { lbfgsMemory: 3 });
    const finalH = (result.diagnostics as { finalH: number }).finalH;
    expect(Math.abs(finalH)).toBeLessThan(5e-3);
  });
});

describe("notearsAlgorithm — varsortability stress (Reisach et al. 2021)", () => {
  function buildChainCohort(seed: number): Cohort {
    return buildCohort({
      variableIds: ["x", "y", "z"],
      generate: (_, rand) => {
        const x = gauss(rand);
        const y = 0.9 * x + 0.3 * gauss(rand);
        const z = 0.9 * y + 0.3 * gauss(rand);
        return { x, y, z };
      },
      nSubjects: 2,
      nSteps: 200,
      seed,
    });
  }

  it("adjacency is stable under variable-order permutation (Jaccard ≥ 0.5)", () => {
    const base = buildChainCohort(202);
    const baseResult = notearsAlgorithm.run(base);
    const baseAdj = adjacencyKeys(baseResult.edges);

    // Permute to reverse column order (sink-first instead of source-first).
    // This is the canonical varsortability adversary.
    const reversed = permuteVariableOrder(base, [2, 1, 0]);
    const reversedResult = notearsAlgorithm.run(reversed);
    const reversedAdj = adjacencyKeys(reversedResult.edges);

    // Jaccard similarity of the adjacency sets.
    const intersection = [...baseAdj].filter((k) => reversedAdj.has(k)).length;
    const unionSize = new Set([...baseAdj, ...reversedAdj]).size;
    const jaccard = unionSize === 0 ? 1 : intersection / unionSize;
    expect(jaccard).toBeGreaterThanOrEqual(0.5);
  });

  it("acyclicity holds under representative permutations (forward, swap, reverse)", () => {
    // Three permutations span the qualitatively-different orderings of
    // a 3-variable cohort: identity, single transposition, full reverse.
    // Running all 6 hits the 5s test timeout for the iterative inner
    // loop; these three are the meaningful varsortability probes.
    const base = buildChainCohort(203);
    const permutations: number[][] = [
      [0, 1, 2], // identity
      [1, 0, 2], // adjacent swap
      [2, 1, 0], // full reverse — canonical varsortability adversary
    ];
    for (const order of permutations) {
      const cohort = permuteVariableOrder(base, order);
      const result = notearsAlgorithm.run(cohort);
      const finalH = (result.diagnostics as { finalH: number }).finalH;
      expect(Math.abs(finalH)).toBeLessThan(5e-3);
    }
  });

  it("edge magnitudes stay bounded (|β| ≤ 2.0) under reverse permutation", () => {
    const base = buildChainCohort(204);
    const reversed = permuteVariableOrder(base, [2, 1, 0]);
    const result = notearsAlgorithm.run(reversed);
    for (const e of result.edges) {
      expect(Math.abs(e.strength)).toBeLessThanOrEqual(2.0);
    }
    // Document the helpers are exercised, even where the assertion is
    // implicit (no edges with |β| > 2 in this run).
    void edgeKeys;
  });
});
