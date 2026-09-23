import { describe, it, expect } from "vitest";
import { omegaBridgeDensity } from "@/lib/estimators/omega-bridge-density";
import type { CausalGraph } from "@/lib/types";
import { makeNode, makeEdge } from "../fixtures/graph-fixtures";

// Tests cover:
//   1. The canonical |χ★| / |E| identity on hand-computable fixtures.
//   2. Endpoint behaviour: density ∈ [0, 1] always.
//   3. Tree → density 1; large highly-connected graph → small density.
//   4. Empty graph: 0 (defined, not NaN).
//   5. Pass-through of chiStar options (topK control).
//   6. bridgeFraction subset relationship.

function makeGraph(
  nodeIds: string[],
  edgeSpecs: { id: string; source: string; target: string }[],
): CausalGraph {
  return {
    nodes: nodeIds.map((id) => makeNode({ id })),
    edges: edgeSpecs.map((s) => makeEdge(s)),
    metadata: {
      density: 0,
      constraintType: "",
      verificationStatus: "UNVERIFIED",
      totalNodes: nodeIds.length,
      totalEdges: edgeSpecs.length,
      inconsistentEdges: 0,
      restrictedNodes: 0,
    },
  };
}

describe("omegaBridgeDensity — canonical |χ★| / |E|", () => {
  it("path graph: every edge is a bridge → density = 1", () => {
    // 3-edge path. χ★ = all 3 edges. |E| = 3. Density = 1.
    const g = makeGraph(
      ["a", "b", "c", "d"],
      [
        { id: "ab", source: "a", target: "b" },
        { id: "bc", source: "b", target: "c" },
        { id: "cd", source: "c", target: "d" },
      ],
    );
    const r = omegaBridgeDensity(g);
    expect(r.density).toBe(1);
    expect(r.chiStarSize).toBe(3);
    expect(r.edgeCount).toBe(3);
    expect(r.bridgeFraction).toBe(1);
  });

  it("triangle: no bridges, but auto topK = max(1, ⌊0.1·3⌋) = 1, so density = 1/3", () => {
    const g = makeGraph(
      ["a", "b", "c"],
      [
        { id: "ab", source: "a", target: "b" },
        { id: "bc", source: "b", target: "c" },
        { id: "ca", source: "c", target: "a" },
      ],
    );
    const r = omegaBridgeDensity(g);
    expect(r.bridgeFraction).toBe(0); // no strict bridges in a cycle
    expect(r.density).toBeCloseTo(1 / 3, 12); // 1 top-BES edge
    expect(r.chiStarSize).toBe(1);
    expect(r.edgeCount).toBe(3);
  });

  it("two triangles + bridge: bridge plus auto topK = 1 → density = 1/7", () => {
    // 7 edges total; 1 strict bridge ("cf"). Auto topK = max(1, ⌊0.1·7⌋) = 1.
    // Top-BES is also "cf" (carries every cross-component shortest path).
    // χ★ = {cf}. Density = 1/7 ≈ 0.143.
    const g = makeGraph(
      ["a", "b", "c", "d", "e", "f"],
      [
        { id: "ab", source: "a", target: "b" },
        { id: "bc", source: "b", target: "c" },
        { id: "ca", source: "c", target: "a" },
        { id: "de", source: "d", target: "e" },
        { id: "ef", source: "e", target: "f" },
        { id: "fd", source: "f", target: "d" },
        { id: "cf", source: "c", target: "f" },
      ],
    );
    const r = omegaBridgeDensity(g);
    expect(r.chiStarSize).toBe(1);
    expect(r.edgeCount).toBe(7);
    expect(r.density).toBeCloseTo(1 / 7, 12);
    expect(r.bridgeFraction).toBeCloseTo(1 / 7, 12);
  });

  it("complete K4 with topK=0: no bridges, no BES additions → density = 0", () => {
    const g = makeGraph(
      ["a", "b", "c", "d"],
      [
        { id: "ab", source: "a", target: "b" },
        { id: "ac", source: "a", target: "c" },
        { id: "ad", source: "a", target: "d" },
        { id: "bc", source: "b", target: "c" },
        { id: "bd", source: "b", target: "d" },
        { id: "cd", source: "c", target: "d" },
      ],
    );
    const r = omegaBridgeDensity(g, { topK: 0 });
    expect(r.density).toBe(0);
    expect(r.bridgeFraction).toBe(0);
    expect(r.edgeCount).toBe(6);
  });

  it("star graph: every spoke is a bridge → density = 1", () => {
    const g = makeGraph(
      ["hub", "l1", "l2", "l3", "l4"],
      [
        { id: "s1", source: "hub", target: "l1" },
        { id: "s2", source: "hub", target: "l2" },
        { id: "s3", source: "hub", target: "l3" },
        { id: "s4", source: "hub", target: "l4" },
      ],
    );
    const r = omegaBridgeDensity(g);
    expect(r.density).toBe(1);
    expect(r.bridgeFraction).toBe(1);
  });

  it("density is always in [0, 1]", () => {
    const fixtures: CausalGraph[] = [
      makeGraph([], []),
      makeGraph(["a"], []),
      makeGraph(
        ["a", "b"],
        [{ id: "ab", source: "a", target: "b" }],
      ),
      makeGraph(
        ["a", "b", "c", "d"],
        [
          { id: "ab", source: "a", target: "b" },
          { id: "bc", source: "b", target: "c" },
          { id: "cd", source: "c", target: "d" },
          { id: "ad", source: "a", target: "d" },
        ],
      ),
    ];
    for (const g of fixtures) {
      const r = omegaBridgeDensity(g);
      expect(r.density).toBeGreaterThanOrEqual(0);
      expect(r.density).toBeLessThanOrEqual(1);
      expect(r.bridgeFraction).toBeGreaterThanOrEqual(0);
      expect(r.bridgeFraction).toBeLessThanOrEqual(1);
    }
  });
});

describe("omegaBridgeDensity — bridgeFraction is a subset of density", () => {
  it("strict bridges are a subset of χ★, so bridgeFraction ≤ density", () => {
    // Mixed graph: triangle attached to a tail.
    //   a—b—c—a (triangle)
    //   c—d (bridge to tail)
    //   d—e (bridge to leaf)
    const g = makeGraph(
      ["a", "b", "c", "d", "e"],
      [
        { id: "ab", source: "a", target: "b" },
        { id: "bc", source: "b", target: "c" },
        { id: "ca", source: "c", target: "a" },
        { id: "cd", source: "c", target: "d" },
        { id: "de", source: "d", target: "e" },
      ],
    );
    const r = omegaBridgeDensity(g);
    expect(r.bridgeFraction).toBeLessThanOrEqual(r.density);
    // 2 strict bridges (cd, de), 5 edges.
    expect(r.bridgeFraction).toBeCloseTo(2 / 5, 12);
  });
});

describe("omegaBridgeDensity — empty / degenerate graphs", () => {
  it("empty graph: density 0 (defined, not NaN)", () => {
    const g = makeGraph([], []);
    const r = omegaBridgeDensity(g);
    expect(r.density).toBe(0);
    expect(r.chiStarSize).toBe(0);
    expect(r.edgeCount).toBe(0);
    expect(Number.isNaN(r.density)).toBe(false);
  });

  it("single isolated node: density 0", () => {
    const g = makeGraph(["a"], []);
    const r = omegaBridgeDensity(g);
    expect(r.density).toBe(0);
  });

  it("single edge: density 1", () => {
    const g = makeGraph(
      ["a", "b"],
      [{ id: "ab", source: "a", target: "b" }],
    );
    const r = omegaBridgeDensity(g);
    expect(r.density).toBe(1);
    expect(r.bridgeFraction).toBe(1);
  });
});

describe("omegaBridgeDensity — option pass-through", () => {
  it("topK=0 reduces density to bridges-only", () => {
    // Triangle has 0 bridges but auto topK = 1, so default density > 0.
    // topK = 0 forces density = 0.
    const g = makeGraph(
      ["a", "b", "c"],
      [
        { id: "ab", source: "a", target: "b" },
        { id: "bc", source: "b", target: "c" },
        { id: "ca", source: "c", target: "a" },
      ],
    );
    const auto = omegaBridgeDensity(g);
    const zero = omegaBridgeDensity(g, { topK: 0 });
    expect(auto.density).toBeGreaterThan(0);
    expect(zero.density).toBe(0);
  });

  it("larger topK increases (or holds) density monotonically", () => {
    // 20-node cycle: 0 bridges. As topK grows, more BES edges are
    // included; density can only rise.
    const ids: string[] = [];
    const edges: { id: string; source: string; target: string }[] = [];
    for (let i = 0; i < 20; i++) ids.push(`n${i}`);
    for (let i = 0; i < 20; i++) {
      edges.push({
        id: `e${i}`,
        source: `n${i}`,
        target: `n${(i + 1) % 20}`,
      });
    }
    const g = makeGraph(ids, edges);
    let prev = -1;
    for (const k of [0, 1, 2, 5, 10, 20]) {
      const d = omegaBridgeDensity(g, { topK: k }).density;
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });

  it("returns the underlying chiStar result for further inspection", () => {
    const g = makeGraph(
      ["a", "b", "c", "d"],
      [
        { id: "ab", source: "a", target: "b" },
        { id: "bc", source: "b", target: "c" },
        { id: "cd", source: "c", target: "d" },
      ],
    );
    const r = omegaBridgeDensity(g);
    expect(r.chiStar.bridges.sort()).toEqual(["ab", "bc", "cd"]);
    expect(r.chiStar.besRanking.length).toBe(3);
    expect(r.chiStar.bes.size).toBe(3);
  });
});
