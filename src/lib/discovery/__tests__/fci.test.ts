import { describe, it, expect } from "vitest";
import {
  fciAlgorithm,
  runOrientation,
  buildInitialEdges,
  applyVStructures,
  applyR1,
  applyR2,
  applyR3,
  applyR4,
  findDiscriminatingPath,
  type SkeletonResult,
  type OrientedEdge,
} from "../algorithms/fci";
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

// ─── Orientation-rule unit tests (constructed skeleton fixture) ──────
//
// Building synthetic cohorts that exercise R1 cleanly is hard: PC-stable's
// depth-bounded search interacts with the data-generating process in ways
// that make the input → output mapping less direct. Testing R1 against
// a constructed `SkeletonResult` is more rigorous — we control exactly
// which adjacencies and sepsets the rule sees and can assert the expected
// mark transitions deterministically.
//
// R2 is implemented in `runOrientation` per Zhang (2008). A dedicated R2
// fixture-test is deferred — triggering R2 end-to-end through
// `runOrientation` requires constructing a 6+ node fixture with two
// v-structures + a triangle, which is complex enough to merit its own
// follow-up. R2 not firing spuriously is implicitly verified by all the
// pattern-recovery tests passing.

function makeSkeleton(
  edges: [number, number][],
  sepsets: Record<string, number[]>,
  nNodes: number,
): SkeletonResult {
  const adj: Set<number>[] = Array.from(
    { length: nNodes },
    () => new Set<number>(),
  );
  for (const [a, b] of edges) {
    adj[a].add(b);
    adj[b].add(a);
  }
  const sepset = new Map<string, number[]>();
  for (const k of Object.keys(sepsets)) sepset.set(k, sepsets[k]);
  return {
    adj,
    sepset,
    pairKey: (i, j) => (i < j ? `${i}:${j}` : `${j}:${i}`),
    marginalR: new Map(),
  };
}

describe("runOrientation — R1 propagates arrowheads outward from v-structures", () => {
  it("orients Y→Z and Y→W via R1 after a v-structure puts arrowheads at Y", () => {
    // 5-node skeleton:
    //   Edges: A(0)-Y(1), B(2)-Y(1), Y(1)-Z(3), Y(1)-W(4)
    //   sepset(A, B) = []  → v-structure at Y (arrowheads at Y on A-Y and B-Y)
    //   sepset(A, Z) = {Y}, sepset(B, Z) = {Y} → not v-structures, but R1 fires
    //   sepset(A, W) = {Y}, sepset(B, W) = {Y} → R1 also fires here
    //   sepset(Z, W) = {Y} → Z, W not adjacent in skeleton
    const skel = makeSkeleton(
      [
        [0, 1],
        [2, 1],
        [1, 3],
        [1, 4],
      ],
      {
        "0:2": [],
        "0:3": [1],
        "2:3": [1],
        "0:4": [1],
        "2:4": [1],
        "3:4": [1],
      },
      5,
    );
    const out = runOrientation(skel);

    const find = (a: number, b: number) =>
      out.find(
        (e) => (e.a === a && e.b === b) || (e.a === b && e.b === a),
      )!;

    // V-structure: arrows at Y on A-Y and B-Y.
    const ay = find(0, 1);
    const by = find(1, 2);
    expect(ay.a === 1 ? ay.markA : ay.markB).toBe("arrow");
    expect(by.a === 1 ? by.markA : by.markB).toBe("arrow");

    // R1: orient Y-Z and Y-W as Y→Z and Y→W respectively.
    const yz = find(1, 3);
    const yw = find(1, 4);
    expect(yz.a === 1 ? yz.markA : yz.markB).toBe("tail");
    expect(yz.a === 3 ? yz.markA : yz.markB).toBe("arrow");
    expect(yw.a === 1 ? yw.markA : yw.markB).toBe("tail");
    expect(yw.a === 4 ? yw.markA : yw.markB).toBe("arrow");
  });

  it("does not orient when triple is shielded (X-Z is adjacent)", () => {
    // Triangle X(0)-Y(1)-Z(2) with all three edges adjacent. R1's
    // unshielded-triple precondition fails, so even with an arrowhead
    // at Y on X-Y, R1 does NOT propagate to Y-Z.
    // Setup: add a v-structure-source W(3) with W-X edge and W
    // independent of Y, Z so v-structure check at X gives arrow at X.
    // R1 then fires on (W, X, Y) — but only because W,Y are not
    // adjacent — and orients X-Y as X→Y. R1 does NOT fire on (X, Y, Z)
    // because X-Z is adjacent (shielded). Y-Z stays as o-o.
    const skel = makeSkeleton(
      [
        [0, 1], // X-Y
        [1, 2], // Y-Z
        [0, 2], // X-Z (shielded)
        [3, 0], // W-X
        [4, 0], // V-X
      ],
      {
        "3:4": [], // W, V independent → v-structure at X
        "1:3": [0], // W-Y separated by X
        "1:4": [0],
        "2:3": [0], // W-Z separated by X
        "2:4": [0],
      },
      5,
    );
    const out = runOrientation(skel);
    const find = (a: number, b: number) =>
      out.find(
        (e) => (e.a === a && e.b === b) || (e.a === b && e.b === a),
      )!;

    // Y-Z must remain unoriented (both circles) — R1 was blocked by
    // the shielded X-Z edge.
    const yz = find(1, 2);
    expect(yz.markA).toBe("circle");
    expect(yz.markB).toBe("circle");
  });
});

// ─── R2 direct fixture tests (constructed OrientedEdge map) ──────────
//
// Triggering R2 end-to-end through `runOrientation` requires a 6+ node
// graph with two v-structures that R1 then orients into a directed
// sub-path through a triangle — complex to set up. The refactor exposes
// `applyR2` directly, so we construct the post-R1 OrientedEdge state by
// hand and verify R2's exact mark transitions.

function buildAdj(edges: [number, number][], nNodes: number): Set<number>[] {
  const adj: Set<number>[] = Array.from(
    { length: nNodes },
    () => new Set<number>(),
  );
  for (const [a, b] of edges) {
    adj[a].add(b);
    adj[b].add(a);
  }
  return adj;
}

function buildEdges(
  triples: [number, number, "circle" | "arrow" | "tail", "circle" | "arrow" | "tail"][],
): Map<string, OrientedEdge> {
  const m = new Map<string, OrientedEdge>();
  for (const [a, b, mA, mB] of triples) {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const markLo = lo === a ? mA : mB;
    const markHi = hi === a ? mA : mB;
    m.set(`${lo}:${hi}`, { a: lo, b: hi, markA: markLo, markB: markHi });
  }
  return m;
}

describe("applyR2 — propagates arrowhead through a directed sub-path", () => {
  it("orients X-Z's Z-side as arrow when X → Y and Y *→ Z (triangle)", () => {
    // Triangle X(0)-Y(1)-Z(2) with X-Z adjacent.
    // Pre-state: X → Y (tail at X, arrow at Y); Y *→ Z (circle at Y,
    // arrow at Z); X-Z (circle, circle).
    const adj = buildAdj([[0, 1], [1, 2], [0, 2]], 3);
    const edges = buildEdges([
      [0, 1, "tail", "arrow"], // X → Y
      [1, 2, "circle", "arrow"], // Y *→ Z
      [0, 2, "circle", "circle"], // X o-o Z
    ]);
    const changed = applyR2(edges, adj);
    expect(changed).toBe(true);
    const xz = edges.get("0:2")!;
    expect(xz.markA).toBe("circle"); // X-side stays circle
    expect(xz.markB).toBe("arrow"); // Z-side flipped to arrow
  });

  it("orients X-Z's Z-side as arrow when X *→ Y and Y → Z (triangle, other branch)", () => {
    const adj = buildAdj([[0, 1], [1, 2], [0, 2]], 3);
    const edges = buildEdges([
      [0, 1, "circle", "arrow"], // X *→ Y
      [1, 2, "tail", "arrow"], // Y → Z
      [0, 2, "circle", "circle"],
    ]);
    const changed = applyR2(edges, adj);
    expect(changed).toBe(true);
    const xz = edges.get("0:2")!;
    expect(xz.markB).toBe("arrow");
  });

  it("does not fire when the triple is unshielded (X-Z not adjacent)", () => {
    const adj = buildAdj([[0, 1], [1, 2]], 3); // no X-Z edge
    const edges = buildEdges([
      [0, 1, "tail", "arrow"],
      [1, 2, "circle", "arrow"],
    ]);
    const changed = applyR2(edges, adj);
    expect(changed).toBe(false);
  });

  it("does not fire when the directed sub-path is incomplete", () => {
    // X-Y has arrow at Y but X-side is circle (not directed). Y *→ Z
    // present, X-Z circle/circle. R2 needs (directedXY AND arrowAtZ)
    // OR (arrowAtY AND directedYZ). With only arrow at Y on X-Y AND
    // only arrow at Z on Y-Z (no tail at Y on Y-Z), neither branch
    // triggers.
    const adj = buildAdj([[0, 1], [1, 2], [0, 2]], 3);
    const edges = buildEdges([
      [0, 1, "circle", "arrow"], // X *→ Y (X-side circle)
      [1, 2, "circle", "arrow"], // Y *→ Z (Y-side circle)
      [0, 2, "circle", "circle"],
    ]);
    const changed = applyR2(edges, adj);
    expect(changed).toBe(false);
  });
});

describe("applyR3 — orients D *→ B via the discriminating kite", () => {
  it("orients D-B's B-side as arrow given the canonical kite pattern", () => {
    // Kite: A(0) *→ B(1) ←* C(2), with D(3) adjacent to A, B, C.
    // Pre-state marks:
    //   A-B: A-side circle, B-side arrow (A *→ B)
    //   C-B: C-side circle, B-side arrow (C *→ B)
    //   A-D: A-side circle, D-side circle  (the "A *-o D" precondition
    //        only requires circle at D, but for cleanness keep both as
    //        circles)
    //   C-D: same shape as A-D
    //   D-B: D-side circle, B-side circle (the edge R3 will orient)
    //   A and C NOT adjacent.
    const adj = buildAdj(
      [
        [0, 1], // A-B
        [2, 1], // C-B
        [0, 3], // A-D
        [2, 3], // C-D
        [3, 1], // D-B
      ],
      4,
    );
    const edges = buildEdges([
      [0, 1, "circle", "arrow"], // A *→ B
      [2, 1, "circle", "arrow"], // C *→ B
      [0, 3, "circle", "circle"], // A o-o D
      [2, 3, "circle", "circle"], // C o-o D
      [3, 1, "circle", "circle"], // D o-o B
    ]);
    const changed = applyR3(edges, adj);
    expect(changed).toBe(true);
    const db = edges.get("1:3")!;
    // B-side should be arrow now.
    const bMark = db.a === 1 ? db.markA : db.markB;
    const dMark = db.a === 3 ? db.markA : db.markB;
    expect(bMark).toBe("arrow");
    expect(dMark).toBe("circle"); // D-side stays
  });

  it("does not fire when A and C are adjacent (kite collapses)", () => {
    const adj = buildAdj(
      [
        [0, 1], // A-B
        [2, 1], // C-B
        [0, 3], // A-D
        [2, 3], // C-D
        [3, 1], // D-B
        [0, 2], // A-C — breaks the precondition
      ],
      4,
    );
    const edges = buildEdges([
      [0, 1, "circle", "arrow"],
      [2, 1, "circle", "arrow"],
      [0, 3, "circle", "circle"],
      [2, 3, "circle", "circle"],
      [3, 1, "circle", "circle"],
      [0, 2, "circle", "circle"],
    ]);
    const changed = applyR3(edges, adj);
    expect(changed).toBe(false);
  });

  it("does not fire when D-B already has arrow at B", () => {
    const adj = buildAdj(
      [
        [0, 1],
        [2, 1],
        [0, 3],
        [2, 3],
        [3, 1],
      ],
      4,
    );
    const edges = buildEdges([
      [0, 1, "circle", "arrow"],
      [2, 1, "circle", "arrow"],
      [0, 3, "circle", "circle"],
      [2, 3, "circle", "circle"],
      [3, 1, "circle", "arrow"], // already arrow at B — no work for R3
    ]);
    const changed = applyR3(edges, adj);
    expect(changed).toBe(false);
  });
});

describe("applyR4 — discriminating-path rule (length-3 / 4-node MV)", () => {
  it("orients B-C as B → C when B is in sepset(W, C)", () => {
    // Discriminating path: W(0) *→ V(1) ←* B(2) - C(3), with V → C and
    // W not adjacent to C, B in sepset(W, C). Per R4: orient B-C as B → C.
    const adj = buildAdj(
      [
        [0, 1], // W-V
        [1, 2], // V-B
        [1, 3], // V-C
        [2, 3], // B-C
      ],
      4,
    );
    const sepset = new Map<string, number[]>();
    sepset.set("0:3", [2]); // sepset(W, C) = {B}
    const edges = buildEdges([
      [0, 1, "circle", "arrow"], // W *→ V (arrow at V)
      [1, 2, "arrow", "arrow"], // V ←* B (arrow at V; B-side also arrow simulates the "*" wildcard)
      [1, 3, "tail", "arrow"], // V → C (tail at V, arrow at C)
      [2, 3, "circle", "circle"], // B-C unoriented
    ]);
    const changed = applyR4(edges, adj, sepset);
    expect(changed).toBe(true);
    const bc = edges.get("2:3")!;
    // B-C oriented as B → C: tail at B (idx 2), arrow at C (idx 3).
    const bMark = bc.a === 2 ? bc.markA : bc.markB;
    const cMark = bc.a === 3 ? bc.markA : bc.markB;
    expect(bMark).toBe("tail");
    expect(cMark).toBe("arrow");
  });

  it("orients B-C as bidirected when B is NOT in sepset(W, C)", () => {
    // Same discriminating path; sepset(W, C) does NOT include B
    // (e.g. sepset = {V}). Per R4: orient B-C as bidirected (latent
    // confounder).
    const adj = buildAdj(
      [
        [0, 1],
        [1, 2],
        [1, 3],
        [2, 3],
      ],
      4,
    );
    const sepset = new Map<string, number[]>();
    sepset.set("0:3", [1]); // sepset = {V}, not including B
    const edges = buildEdges([
      [0, 1, "circle", "arrow"],
      [1, 2, "arrow", "arrow"],
      [1, 3, "tail", "arrow"],
      [2, 3, "circle", "circle"],
    ]);
    const changed = applyR4(edges, adj, sepset);
    expect(changed).toBe(true);
    const bc = edges.get("2:3")!;
    expect(bc.markA).toBe("arrow"); // bidirected: arrow at B-side
    expect(bc.markB).toBe("arrow"); // bidirected: arrow at C-side
  });

  it("does not fire when V is not a parent of C (V-C not directed V → C)", () => {
    // Same skeleton, but V-C has circle at V instead of tail — V is
    // not a definite parent of C, so the discriminating-path
    // precondition fails.
    const adj = buildAdj(
      [
        [0, 1],
        [1, 2],
        [1, 3],
        [2, 3],
      ],
      4,
    );
    const sepset = new Map<string, number[]>();
    sepset.set("0:3", [2]);
    const edges = buildEdges([
      [0, 1, "circle", "arrow"],
      [1, 2, "arrow", "arrow"],
      [1, 3, "circle", "arrow"], // V-C has circle at V (not directed V → C)
      [2, 3, "circle", "circle"],
    ]);
    const changed = applyR4(edges, adj, sepset);
    expect(changed).toBe(false);
  });

  it("does not fire when W is adjacent to C (path is shielded)", () => {
    const adj = buildAdj(
      [
        [0, 1],
        [1, 2],
        [1, 3],
        [2, 3],
        [0, 3], // W-C — breaks the precondition
      ],
      4,
    );
    const sepset = new Map<string, number[]>();
    sepset.set("0:3", [2]);
    const edges = buildEdges([
      [0, 1, "circle", "arrow"],
      [1, 2, "arrow", "arrow"],
      [1, 3, "tail", "arrow"],
      [2, 3, "circle", "circle"],
      [0, 3, "circle", "circle"],
    ]);
    const changed = applyR4(edges, adj, sepset);
    expect(changed).toBe(false);
  });
});

// ─── Longer discriminating paths (R4 v0.5) ────────────────────────────
//
// Zhang's R4 now searches for discriminating paths of any length up to
// `maxLength`. The fixtures below construct length-4 and length-5 paths
// where the new BFS-based R4 should fire — the previous v0.4
// implementation would have missed these because it only iterated
// over the single-intermediate (length-3) neighborhood.

describe("findDiscriminatingPath — BFS through parents-of-C colliders", () => {
  it("returns the length-3 endpoint W on the canonical 4-node path", () => {
    // W(0) *→ V(1) ←* B(2) − C(3) with V → C and W not adjacent to C.
    const adj = buildAdj(
      [
        [0, 1],
        [1, 2],
        [1, 3],
        [2, 3],
      ],
      4,
    );
    const edges = buildEdges([
      [0, 1, "circle", "arrow"],
      [1, 2, "arrow", "arrow"],
      [1, 3, "tail", "arrow"],
      [2, 3, "circle", "circle"],
    ]);
    const w = findDiscriminatingPath(2, 3, edges, adj, 5);
    expect(w).toBe(0);
  });

  it("returns the length-4 endpoint W on a 5-node path with two intermediates", () => {
    // Path: W(0) - U(1) - V(2) - B(3) - C(4)
    //   W *→ U (arrow at U)
    //   U ↔ V (both colliders — arrows on both sides of U-V)
    //   V ↔ B (arrow at V — V is collider on the U-V-B path)
    //   U → C, V → C (both parents of C)
    //   W not adjacent to C
    const adj = buildAdj(
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [1, 4],
        [2, 4],
      ],
      5,
    );
    const edges = buildEdges([
      [0, 1, "circle", "arrow"], // W *→ U
      [1, 2, "arrow", "arrow"], // U ↔ V (both colliders along path)
      [2, 3, "arrow", "arrow"], // V ↔ B (V is collider toward B)
      [3, 4, "circle", "circle"], // B-C unoriented (R4 will fire here)
      [1, 4, "tail", "arrow"], // U → C (parent)
      [2, 4, "tail", "arrow"], // V → C (parent)
    ]);
    const w = findDiscriminatingPath(3, 4, edges, adj, 5);
    expect(w).toBe(0);
  });

  it("returns null when an intermediate is not a parent of C", () => {
    // Same skeleton as the length-4 case, but V-C is circle-at-V instead
    // of tail-at-V, so V is not a definite parent of C — the
    // discriminating-path precondition fails.
    const adj = buildAdj(
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [1, 4],
        [2, 4],
      ],
      5,
    );
    const edges = buildEdges([
      [0, 1, "circle", "arrow"],
      [1, 2, "arrow", "arrow"],
      [2, 3, "arrow", "arrow"],
      [3, 4, "circle", "circle"],
      [1, 4, "tail", "arrow"],
      [2, 4, "circle", "arrow"], // V-C: circle at V (NOT parent of C)
    ]);
    const w = findDiscriminatingPath(3, 4, edges, adj, 5);
    expect(w).toBeNull();
  });

  it("returns null when an intermediate is not a collider on the path", () => {
    // V-B has circle at V instead of arrow — V is not a collider on U-V-B.
    const adj = buildAdj(
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [1, 4],
        [2, 4],
      ],
      5,
    );
    const edges = buildEdges([
      [0, 1, "circle", "arrow"],
      [1, 2, "arrow", "arrow"],
      [2, 3, "circle", "arrow"], // V-B: circle at V (not collider toward B)
      [3, 4, "circle", "circle"],
      [1, 4, "tail", "arrow"],
      [2, 4, "tail", "arrow"],
    ]);
    const w = findDiscriminatingPath(3, 4, edges, adj, 5);
    expect(w).toBeNull();
  });

  it("respects maxLength — caps the search at length-3 with maxLength=1", () => {
    // 5-node length-4 path exists, but maxLength=1 forbids it.
    const adj = buildAdj(
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [1, 4],
        [2, 4],
      ],
      5,
    );
    const edges = buildEdges([
      [0, 1, "circle", "arrow"],
      [1, 2, "arrow", "arrow"],
      [2, 3, "arrow", "arrow"],
      [3, 4, "circle", "circle"],
      [1, 4, "tail", "arrow"],
      [2, 4, "tail", "arrow"],
    ]);
    const w = findDiscriminatingPath(3, 4, edges, adj, 1);
    expect(w).toBeNull();
  });
});

describe("applyR4 — longer discriminating paths (v0.5)", () => {
  it("orients B → C on a length-4 path when B is in sepset(W, C)", () => {
    const adj = buildAdj(
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [1, 4],
        [2, 4],
      ],
      5,
    );
    const sepset = new Map<string, number[]>();
    sepset.set("0:4", [3]); // sepset(W, C) = {B} → orient B → C
    const edges = buildEdges([
      [0, 1, "circle", "arrow"],
      [1, 2, "arrow", "arrow"],
      [2, 3, "arrow", "arrow"],
      [3, 4, "circle", "circle"],
      [1, 4, "tail", "arrow"],
      [2, 4, "tail", "arrow"],
    ]);
    const changed = applyR4(edges, adj, sepset);
    expect(changed).toBe(true);
    const bc = edges.get("3:4")!;
    const bMark = bc.a === 3 ? bc.markA : bc.markB;
    const cMark = bc.a === 4 ? bc.markA : bc.markB;
    expect(bMark).toBe("tail");
    expect(cMark).toBe("arrow");
  });

  it("orients B ↔ C (bidirected) on a length-4 path when B is NOT in sepset(W, C)", () => {
    const adj = buildAdj(
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [1, 4],
        [2, 4],
      ],
      5,
    );
    const sepset = new Map<string, number[]>();
    sepset.set("0:4", [1, 2]); // sepset = {U, V}, no B → bidirected
    const edges = buildEdges([
      [0, 1, "circle", "arrow"],
      [1, 2, "arrow", "arrow"],
      [2, 3, "arrow", "arrow"],
      [3, 4, "circle", "circle"],
      [1, 4, "tail", "arrow"],
      [2, 4, "tail", "arrow"],
    ]);
    const changed = applyR4(edges, adj, sepset);
    expect(changed).toBe(true);
    const bc = edges.get("3:4")!;
    expect(bc.markA).toBe("arrow");
    expect(bc.markB).toBe("arrow");
  });

  it("does not orient when no discriminating path exists at any allowed length", () => {
    // Same 5-node skeleton, but neither U nor V is a definite parent of C
    // (both U-C and V-C have circle at U / V instead of tail). With no
    // parents of C among the candidate intermediates, no discriminating
    // path of any length can exist for any of the focus edges.
    const adj = buildAdj(
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [1, 4],
        [2, 4],
      ],
      5,
    );
    const sepset = new Map<string, number[]>();
    sepset.set("0:4", [3]);
    const edges = buildEdges([
      [0, 1, "circle", "arrow"],
      [1, 2, "arrow", "arrow"],
      [2, 3, "arrow", "arrow"],
      [3, 4, "circle", "circle"],
      [1, 4, "circle", "arrow"], // U-C: U not parent of C
      [2, 4, "circle", "arrow"], // V-C: V not parent of C
    ]);
    const changed = applyR4(edges, adj, sepset);
    expect(changed).toBe(false);
  });

  it("orients on a length-5 path (6 nodes, 3 intermediates all parents of C)", () => {
    // Path: W(0) - T(1) - U(2) - V(3) - B(4) - C(5)
    // All of T, U, V are colliders AND parents of C.
    const adj = buildAdj(
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 5],
        [1, 5],
        [2, 5],
        [3, 5],
      ],
      6,
    );
    const sepset = new Map<string, number[]>();
    sepset.set("0:5", [4]); // sepset(W, C) = {B} → B → C
    const edges = buildEdges([
      [0, 1, "circle", "arrow"], // W *→ T
      [1, 2, "arrow", "arrow"], // T ↔ U
      [2, 3, "arrow", "arrow"], // U ↔ V
      [3, 4, "arrow", "arrow"], // V ↔ B
      [4, 5, "circle", "circle"], // B-C unoriented
      [1, 5, "tail", "arrow"], // T → C
      [2, 5, "tail", "arrow"], // U → C
      [3, 5, "tail", "arrow"], // V → C
    ]);
    const changed = applyR4(edges, adj, sepset);
    expect(changed).toBe(true);
    const bc = edges.get("4:5")!;
    const bMark = bc.a === 4 ? bc.markA : bc.markB;
    const cMark = bc.a === 5 ? bc.markA : bc.markB;
    expect(bMark).toBe("tail");
    expect(cMark).toBe("arrow");
  });
});

describe("buildInitialEdges + applyVStructures — exported helpers compose", () => {
  it("initializes all edges as circle/circle and applyVStructures is a no-op when nothing qualifies", () => {
    const skel = makeSkeleton([[0, 1]], { "0:1": [] }, 2);
    const edges = buildInitialEdges(skel);
    expect([...edges.values()].every((e) => e.markA === "circle" && e.markB === "circle")).toBe(true);
    const changed = applyVStructures(edges, skel);
    expect(changed).toBe(false);
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

// ─── FCI v0.6 — CMI-knn nonparametric CI test ─────────────────────────
//
// FCI now offers two CI tests: the v0.5 default `partial-correlation`
// (linear-Gaussian, fast) and the new `cmi-knn` (k-NN conditional
// mutual information, slower but detects nonlinear dependence).
// These tests cover the integration: that the param is wired, that
// the linear chain still recovers under cmi-knn, and that nonlinear
// dependence — which partial correlation misses — gets caught.

describe("fciAlgorithm — CMI-knn ciTest (FCI v0.6)", () => {
  it("evidence string declares the active ci test", () => {
    const cohort = buildCohort({
      variableIds: ["x", "y", "z"],
      generate: (_, rand) => {
        const x = gauss(rand);
        const y = 0.9 * x + 0.3 * gauss(rand);
        const z = 0.9 * y + 0.3 * gauss(rand);
        return { x, y, z };
      },
      nSubjects: 2,
      nSteps: 80,
      seed: 1100,
    });
    const cmiResult = fciAlgorithm.run(cohort, { ciTest: "cmi-knn" });
    const cmiEdge = cmiResult.edges[0];
    expect(cmiEdge?.evidence).toContain("ci=cmi-knn");

    const parResult = fciAlgorithm.run(cohort);
    const parEdge = parResult.edges[0];
    expect(parEdge?.evidence).toContain("ci=partial-correlation");
  });

  it("recovers a linear chain (X→Y→Z) under cmi-knn — sanity-check fallback to baseline", () => {
    const cohort = buildCohort({
      variableIds: ["x", "y", "z"],
      generate: (_, rand) => {
        const x = gauss(rand);
        const y = 0.9 * x + 0.3 * gauss(rand);
        const z = 0.9 * y + 0.3 * gauss(rand);
        return { x, y, z };
      },
      nSubjects: 2,
      nSteps: 80,
      seed: 1200,
    });
    const result = fciAlgorithm.run(cohort, { ciTest: "cmi-knn" });
    // Should keep X-Y and Y-Z adjacencies on the chain (just like the
    // partial-correlation default). Direction-agnostic check.
    expect(findEdge(result.edges, "x", "y")).toBeDefined();
    expect(findEdge(result.edges, "y", "z")).toBeDefined();
  });

  it("catches NONLINEAR dependence (Y = sin(X) + noise) that partial-correlation misses", () => {
    // Construct a 2-variable cohort where X→Y via Y=sin(X)+noise.
    // Partial correlation sees Pearson r ≈ 0 (sin is symmetric around 0),
    // so it'll drop the X-Y edge at the marginal CI test. CMI-knn sees
    // the nonlinear coupling.
    const cohort = buildCohort({
      variableIds: ["x", "y"],
      generate: (_, rand) => {
        const x = gauss(rand) * Math.PI;
        const y = Math.sin(x) + 0.2 * gauss(rand);
        return { x, y };
      },
      nSubjects: 3,
      nSteps: 100,
      seed: 1300,
    });
    const parResult = fciAlgorithm.run(cohort);
    const cmiResult = fciAlgorithm.run(cohort, { ciTest: "cmi-knn" });

    const parXY = findEdge(parResult.edges, "x", "y");
    const cmiXY = findEdge(cmiResult.edges, "x", "y");
    // Partial-correlation should drop the X-Y edge (no linear signal).
    expect(parXY).toBeUndefined();
    // CMI-knn should keep it.
    expect(cmiXY).toBeDefined();
  });
});
