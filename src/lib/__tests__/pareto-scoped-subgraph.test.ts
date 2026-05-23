import { describe, expect, it } from "vitest";

import {
  buildScopedAdjacency,
  inducedEdgeCount,
} from "@/lib/pareto-scoped-subgraph";
import type { CausalEdge } from "@/lib/types";

// Compact edge factory — pins only the fields the helpers actually
// read, leaves the rest to sensible defaults so test cases stay
// readable. `weight` / `lag` / `type` / `confidence` /
// `physicalMechanism` are required by the type but irrelevant here.
function edge(
  source: string,
  target: string,
  extra: Partial<CausalEdge> = {},
): CausalEdge {
  return {
    id: `${source}__${target}`,
    source,
    target,
    weight: 0.5,
    lag: 0,
    type: "directed",
    confidence: 0.5,
    isInconsistent: false,
    physicalMechanism: "",
    ...extra,
  };
}

describe("inducedEdgeCount", () => {
  it("counts only edges with both endpoints in scope", () => {
    const edges = [
      edge("a", "b"),
      edge("b", "c"),
      edge("c", "d"),
      edge("a", "z"), // z out of scope
    ];
    expect(inducedEdgeCount(edges, ["a", "b", "c"])).toBe(2);
  });

  it("returns 0 for empty scope", () => {
    expect(inducedEdgeCount([edge("a", "b")], [])).toBe(0);
  });

  it("returns 0 when no edges match (all out of scope)", () => {
    const edges = [edge("a", "b"), edge("b", "c")];
    expect(inducedEdgeCount(edges, ["x", "y", "z"])).toBe(0);
  });

  it("skips severed edges even when both endpoints are in scope", () => {
    const edges = [
      edge("a", "b"),
      edge("b", "c", { isSevered: true }),
      edge("c", "d"),
    ];
    expect(inducedEdgeCount(edges, ["a", "b", "c", "d"])).toBe(2);
  });

  it("counts a self-loop in scope once", () => {
    // Matches the pre-extraction inline behaviour — a self-loop
    // passes the both-endpoints-in-set check trivially.
    expect(inducedEdgeCount([edge("a", "a")], ["a"])).toBe(1);
  });

  it("scales: large scope, no scope mismatch", () => {
    // Sanity check that the helper handles the 348-edge geopolitical
    // graph size without surprises.
    const edges: CausalEdge[] = [];
    const ids: string[] = [];
    for (let i = 0; i < 200; i++) ids.push(`n${i}`);
    for (let i = 0; i < 199; i++) edges.push(edge(`n${i}`, `n${i + 1}`));
    expect(inducedEdgeCount(edges, ids)).toBe(199);
  });
});

describe("buildScopedAdjacency", () => {
  it("returns an empty matrix for empty scope", () => {
    expect(buildScopedAdjacency([edge("a", "b")], [])).toEqual([]);
  });

  it("places symmetric 1s for each in-scope edge before normalisation", () => {
    // Before row-normalisation the structural symmetry is W[i][j] = W[j][i].
    // After row-normalisation row sums equal 1 (or 0 for isolated rows).
    const ids = ["a", "b", "c"];
    const W = buildScopedAdjacency([edge("a", "b"), edge("b", "c")], ids);
    // a: one neighbour → row [0, 1, 0]
    expect(W[0]).toEqual([0, 1, 0]);
    // b: two neighbours → row [0.5, 0, 0.5]
    expect(W[1]).toEqual([0.5, 0, 0.5]);
    // c: one neighbour → row [0, 1, 0]
    expect(W[2]).toEqual([0, 1, 0]);
  });

  it("leaves isolated rows as all zeros (S₀ = 0 handled by Moran)", () => {
    const ids = ["a", "b", "c"];
    // Only a–b connected; c isolated.
    const W = buildScopedAdjacency([edge("a", "b")], ids);
    expect(W[2]).toEqual([0, 0, 0]);
  });

  it("skips edges with an endpoint outside the scope", () => {
    const ids = ["a", "b"];
    const W = buildScopedAdjacency(
      [edge("a", "b"), edge("a", "z"), edge("z", "y")],
      ids,
    );
    // Only a–b should make it in.
    expect(W).toEqual([
      [0, 1],
      [1, 0],
    ]);
  });

  it("skips severed edges", () => {
    const ids = ["a", "b", "c"];
    const W = buildScopedAdjacency(
      [
        edge("a", "b"),
        edge("b", "c", { isSevered: true }),
      ],
      ids,
    );
    // Only a–b survives. b has 1 neighbour (a) post-cut, not 2.
    expect(W[1]).toEqual([1, 0, 0]);
  });

  it("uses scopedNodeIds order, not edge order, for row indexing", () => {
    const ids = ["c", "a", "b"]; // reversed
    const W = buildScopedAdjacency([edge("a", "b")], ids);
    // Index in W follows the scopedNodeIds order:
    //   row 0 = c, row 1 = a, row 2 = b.
    // Only a–b is connected → W[1][2] = W[2][1] = 1.
    expect(W[0]).toEqual([0, 0, 0]);
    expect(W[1]).toEqual([0, 0, 1]);
    expect(W[2]).toEqual([0, 1, 0]);
  });
});
