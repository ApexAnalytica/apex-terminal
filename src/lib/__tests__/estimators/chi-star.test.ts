import { describe, it, expect } from "vitest";
import {
  findBridges,
  edgeBetweenness,
  bridgeEdgeStrength,
  chiStar,
  resolveChiStarEdges,
} from "@/lib/estimators/chi-star";
import type { CausalGraph } from "@/lib/types";
import { makeNode, makeEdge } from "../fixtures/graph-fixtures";

// Tests cover:
//   1. Tarjan bridge detection on canonical graphs (path, cycle, star,
//      two-triangles-by-bridge, K4, multi-edge).
//   2. Brandes edge betweenness on graphs with hand-computable values.
//   3. χ★ set composition (bridges ∪ top-k BES).
//   4. Edge cases: empty graph, single node, disconnected components.
//
// Uses the existing makeNode / makeEdge fixture builders. The χ★
// algorithms only read id, source, target (and treat the graph as
// undirected for connectivity / shortest-path purposes).

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

describe("findBridges (Tarjan)", () => {
  it("path graph: every edge is a bridge", () => {
    // a — b — c — d
    const g = makeGraph(
      ["a", "b", "c", "d"],
      [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "b", target: "c" },
        { id: "e3", source: "c", target: "d" },
      ],
    );
    expect(findBridges(g).sort()).toEqual(["e1", "e2", "e3"]);
  });

  it("cycle graph: no bridges", () => {
    // a — b — c — a
    const g = makeGraph(
      ["a", "b", "c"],
      [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "b", target: "c" },
        { id: "e3", source: "c", target: "a" },
      ],
    );
    expect(findBridges(g)).toEqual([]);
  });

  it("two triangles connected by a single edge: only the connector is a bridge", () => {
    //   a — b      d — e
    //    \ /        \ /
    //     c — — — — f
    const g = makeGraph(
      ["a", "b", "c", "d", "e", "f"],
      [
        { id: "ab", source: "a", target: "b" },
        { id: "bc", source: "b", target: "c" },
        { id: "ca", source: "c", target: "a" },
        { id: "de", source: "d", target: "e" },
        { id: "ef", source: "e", target: "f" },
        { id: "fd", source: "f", target: "d" },
        { id: "cf", source: "c", target: "f" }, // bridge
      ],
    );
    expect(findBridges(g)).toEqual(["cf"]);
  });

  it("star graph: every spoke is a bridge", () => {
    // hub connected to 4 leaves
    const g = makeGraph(
      ["hub", "l1", "l2", "l3", "l4"],
      [
        { id: "s1", source: "hub", target: "l1" },
        { id: "s2", source: "hub", target: "l2" },
        { id: "s3", source: "hub", target: "l3" },
        { id: "s4", source: "hub", target: "l4" },
      ],
    );
    expect(findBridges(g).sort()).toEqual(["s1", "s2", "s3", "s4"]);
  });

  it("complete K4: no bridges", () => {
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
    expect(findBridges(g)).toEqual([]);
  });

  it("multi-edge between two nodes: neither is a bridge", () => {
    // Parallel edges form a 2-edge cycle, so removing either leaves
    // the graph connected. Tarjan must use parent-EDGE not parent-NODE
    // bookkeeping for this to work.
    const g = makeGraph(
      ["a", "b"],
      [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "a", target: "b" },
      ],
    );
    expect(findBridges(g)).toEqual([]);
  });

  it("disconnected components: bridges found within each component", () => {
    // Component 1: a—b—c (path, both edges bridges)
    // Component 2: d—e—f—d (cycle, no bridges)
    const g = makeGraph(
      ["a", "b", "c", "d", "e", "f"],
      [
        { id: "ab", source: "a", target: "b" },
        { id: "bc", source: "b", target: "c" },
        { id: "de", source: "d", target: "e" },
        { id: "ef", source: "e", target: "f" },
        { id: "fd", source: "f", target: "d" },
      ],
    );
    expect(findBridges(g).sort()).toEqual(["ab", "bc"]);
  });

  it("empty graph", () => {
    const g = makeGraph([], []);
    expect(findBridges(g)).toEqual([]);
  });

  it("single node, no edges", () => {
    const g = makeGraph(["a"], []);
    expect(findBridges(g)).toEqual([]);
  });
});

describe("edgeBetweenness (Brandes)", () => {
  it("path graph: middle edge has highest betweenness", () => {
    // a — b — c — d
    // Shortest paths through each edge (undirected, n=4):
    //   ab carries: {a-b, a-c, a-d}                 → 3
    //   bc carries: {a-c, a-d, b-c, b-d}            → 4
    //   cd carries: {a-d, b-d, c-d}                 → 3
    const g = makeGraph(
      ["a", "b", "c", "d"],
      [
        { id: "ab", source: "a", target: "b" },
        { id: "bc", source: "b", target: "c" },
        { id: "cd", source: "c", target: "d" },
      ],
    );
    const eb = edgeBetweenness(g);
    expect(eb.get("ab")).toBeCloseTo(3, 12);
    expect(eb.get("bc")).toBeCloseTo(4, 12);
    expect(eb.get("cd")).toBeCloseTo(3, 12);
  });

  it("triangle: all edges equal by symmetry", () => {
    // a—b—c—a, every pair has 2 shortest paths of length 1; each pair
    // contributes 1/2 to each of the two edges on its path — but wait,
    // pairs at distance 1 have a single shortest path (the direct edge).
    // So each edge carries betweenness = 1 (its endpoints' pair).
    const g = makeGraph(
      ["a", "b", "c"],
      [
        { id: "ab", source: "a", target: "b" },
        { id: "bc", source: "b", target: "c" },
        { id: "ca", source: "c", target: "a" },
      ],
    );
    const eb = edgeBetweenness(g);
    expect(eb.get("ab")).toBeCloseTo(1, 12);
    expect(eb.get("bc")).toBeCloseTo(1, 12);
    expect(eb.get("ca")).toBeCloseTo(1, 12);
  });

  it("star graph: every spoke equally betwixt", () => {
    // hub—l1, hub—l2, hub—l3, hub—l4
    // Pairs of leaves (li, lj) each have one shortest path through hub
    // using two edges; each leaf-pair contributes 1 to each of its 2
    // spoke edges. Pairs (hub, li) contribute 1 to spoke i.
    // Spoke i's betweenness = 1 (hub-li pair) + 3 (other 3 leaves
    // connecting to li through the spoke) = 4.
    const g = makeGraph(
      ["hub", "l1", "l2", "l3", "l4"],
      [
        { id: "s1", source: "hub", target: "l1" },
        { id: "s2", source: "hub", target: "l2" },
        { id: "s3", source: "hub", target: "l3" },
        { id: "s4", source: "hub", target: "l4" },
      ],
    );
    const eb = edgeBetweenness(g);
    expect(eb.get("s1")).toBeCloseTo(4, 12);
    expect(eb.get("s2")).toBeCloseTo(4, 12);
    expect(eb.get("s3")).toBeCloseTo(4, 12);
    expect(eb.get("s4")).toBeCloseTo(4, 12);
  });

  it("bridge between two triangles has highest betweenness", () => {
    // Same fixture as bridge test. The connector cf carries every
    // shortest path between the two triangle components.
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
    const eb = edgeBetweenness(g);
    // 3 nodes on each side; 3·3 = 9 cross-pairs all routing through cf.
    expect(eb.get("cf")).toBeCloseTo(9, 12);
    // Internal triangle edges carry strictly less.
    for (const eid of ["ab", "bc", "ca", "de", "ef", "fd"]) {
      expect(eb.get(eid)!).toBeLessThan(eb.get("cf")!);
    }
  });

  it("disconnected components: betweenness only counts within-component pairs", () => {
    // Two separate paths: a—b and c—d. Each edge carries one pair.
    const g = makeGraph(
      ["a", "b", "c", "d"],
      [
        { id: "ab", source: "a", target: "b" },
        { id: "cd", source: "c", target: "d" },
      ],
    );
    const eb = edgeBetweenness(g);
    expect(eb.get("ab")).toBeCloseTo(1, 12);
    expect(eb.get("cd")).toBeCloseTo(1, 12);
  });
});

describe("bridgeEdgeStrength", () => {
  it("normalises to [0, 1] with max = 1", () => {
    const g = makeGraph(
      ["a", "b", "c", "d"],
      [
        { id: "ab", source: "a", target: "b" },
        { id: "bc", source: "b", target: "c" },
        { id: "cd", source: "c", target: "d" },
      ],
    );
    const bes = bridgeEdgeStrength(g);
    let maxBes = 0;
    for (const v of bes.values()) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      if (v > maxBes) maxBes = v;
    }
    expect(maxBes).toBeCloseTo(1, 12);
    // Middle edge should be the max.
    expect(bes.get("bc")).toBeCloseTo(1, 12);
    expect(bes.get("ab")).toBeCloseTo(0.75, 12); // 3 / 4
    expect(bes.get("cd")).toBeCloseTo(0.75, 12);
  });

  it("returns all zeros for a single isolated node", () => {
    const g = makeGraph(["a"], []);
    const bes = bridgeEdgeStrength(g);
    expect(bes.size).toBe(0);
  });
});

describe("chiStar", () => {
  it("path graph: bridges cover every edge, χ★ = all edges", () => {
    const g = makeGraph(
      ["a", "b", "c", "d"],
      [
        { id: "ab", source: "a", target: "b" },
        { id: "bc", source: "b", target: "c" },
        { id: "cd", source: "c", target: "d" },
      ],
    );
    const r = chiStar(g);
    expect(r.bridges.sort()).toEqual(["ab", "bc", "cd"]);
    expect([...r.chiStar].sort()).toEqual(["ab", "bc", "cd"]);
  });

  it("two triangles + bridge: χ★ contains the bridge plus top-k BES", () => {
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
    const r = chiStar(g, { topK: 1 });
    expect(r.bridges).toEqual(["cf"]);
    // topK=1 → top BES edge is cf (betweenness 9, the max).
    // χ★ = {cf} ∪ {cf} = {cf}.
    expect(r.chiStar).toEqual(["cf"]);
  });

  it("topK can be larger than bridges, adds top-BES edges", () => {
    const g = makeGraph(
      ["a", "b", "c", "d"],
      [
        { id: "ab", source: "a", target: "b" },
        { id: "bc", source: "b", target: "c" },
        { id: "cd", source: "c", target: "d" },
      ],
    );
    // All three are bridges. topK=2 picks top-2 BES (bc, then a tie
    // between ab/cd resolved by Map insertion order).
    const r = chiStar(g, { topK: 2 });
    expect(r.bridges.sort()).toEqual(["ab", "bc", "cd"]);
    expect(r.chiStar.length).toBe(3); // bridges already cover everything
  });

  it("topK = 0 returns only strict bridges", () => {
    const g = makeGraph(
      ["a", "b", "c", "d"],
      [
        { id: "ab", source: "a", target: "b" },
        { id: "bc", source: "b", target: "c" },
        { id: "ca", source: "c", target: "a" },
        { id: "cd", source: "c", target: "d" }, // bridge
      ],
    );
    const r = chiStar(g, { topK: 0 });
    expect(r.bridges).toEqual(["cd"]);
    expect(r.chiStar).toEqual(["cd"]);
  });

  it("auto topK defaults to ~10% of edges, minimum 1 edge", () => {
    // 20-edge cycle has no bridges; auto topK = max(1, floor(0.1 · 20)) = 2.
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
    const r = chiStar(g);
    expect(r.bridges).toEqual([]);
    expect(r.topK).toBe(2);
    expect(r.chiStar.length).toBe(2);
  });

  it("besRanking is sorted descending", () => {
    const g = makeGraph(
      ["a", "b", "c", "d"],
      [
        { id: "ab", source: "a", target: "b" },
        { id: "bc", source: "b", target: "c" },
        { id: "cd", source: "c", target: "d" },
      ],
    );
    const r = chiStar(g);
    for (let i = 1; i < r.besRanking.length; i++) {
      expect(r.besRanking[i].bes).toBeLessThanOrEqual(
        r.besRanking[i - 1].bes,
      );
    }
  });

  it("rejects negative or non-finite topK", () => {
    const g = makeGraph(
      ["a", "b"],
      [{ id: "ab", source: "a", target: "b" }],
    );
    expect(() => chiStar(g, { topK: -1 })).toThrow(/topK/);
    expect(() => chiStar(g, { topK: NaN })).toThrow(/topK/);
    expect(() => chiStar(g, { topK: Infinity })).toThrow(/topK/);
  });

  it("empty graph: empty result", () => {
    const g = makeGraph([], []);
    const r = chiStar(g);
    expect(r.bridges).toEqual([]);
    expect(r.chiStar).toEqual([]);
    expect(r.bes.size).toBe(0);
  });
});

describe("resolveChiStarEdges", () => {
  it("returns the original CausalEdge objects in χ★ order", () => {
    const g = makeGraph(
      ["a", "b", "c"],
      [
        { id: "ab", source: "a", target: "b" },
        { id: "bc", source: "b", target: "c" },
      ],
    );
    const r = chiStar(g);
    const edges = resolveChiStarEdges(g, r);
    expect(edges.map((e) => e.id).sort()).toEqual(["ab", "bc"]);
    expect(edges[0]).toMatchObject({ source: expect.any(String), target: expect.any(String) });
  });

  it("skips edge ids not present in the graph (defensive)", () => {
    const g = makeGraph(
      ["a", "b"],
      [{ id: "ab", source: "a", target: "b" }],
    );
    const r = chiStar(g);
    // Manually inject a phantom id — resolver should skip it.
    const fakeResult = { ...r, chiStar: [...r.chiStar, "ghost"] };
    const edges = resolveChiStarEdges(g, fakeResult);
    expect(edges.map((e) => e.id)).toEqual(["ab"]);
  });
});
