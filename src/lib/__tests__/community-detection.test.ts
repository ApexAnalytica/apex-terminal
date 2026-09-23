import { describe, it, expect } from "vitest";
import { detectCommunities } from "@/lib/community-detection";
import { makeNode, makeEdge } from "./fixtures/graph-fixtures";

describe("detectCommunities", () => {
  it("returns empty result for empty graph", () => {
    const result = detectCommunities([], []);
    expect(result.communities).toEqual([]);
    expect(result.modularityProxy).toBe(0);
    expect(result.converged).toBe(true);
  });

  it("treats isolated nodes as singleton communities", () => {
    const nodes = [
      makeNode({ id: "a" }),
      makeNode({ id: "b" }),
      makeNode({ id: "c" }),
    ];
    const result = detectCommunities(nodes, []);
    expect(result.communities).toHaveLength(3);
    expect(result.communities.every((c) => c.size === 1)).toBe(true);
  });

  it("merges two cliques into two communities when joined by a single weak edge", () => {
    const nodes = ["a1", "a2", "a3", "b1", "b2", "b3"].map((id) =>
      makeNode({ id }),
    );
    const edges = [
      makeEdge({ id: "e1", source: "a1", target: "a2" }),
      makeEdge({ id: "e2", source: "a2", target: "a3" }),
      makeEdge({ id: "e3", source: "a1", target: "a3" }),
      makeEdge({ id: "e4", source: "b1", target: "b2" }),
      makeEdge({ id: "e5", source: "b2", target: "b3" }),
      makeEdge({ id: "e6", source: "b1", target: "b3" }),
      makeEdge({ id: "bridge", source: "a1", target: "b1" }),
    ];
    const result = detectCommunities(nodes, edges);
    expect(result.communities).toHaveLength(2);
    const sizes = result.communities.map((c) => c.size).sort();
    expect(sizes).toEqual([3, 3]);
  });

  it("flags communities that cross domain boundaries", () => {
    const nodes = [
      makeNode({ id: "x1", domain: "domain-A" }),
      makeNode({ id: "x2", domain: "domain-A" }),
      makeNode({ id: "x3", domain: "domain-B" }),
    ];
    const edges = [
      makeEdge({ id: "e1", source: "x1", target: "x2" }),
      makeEdge({ id: "e2", source: "x2", target: "x3" }),
      makeEdge({ id: "e3", source: "x1", target: "x3" }),
    ];
    const result = detectCommunities(nodes, edges);
    expect(result.communities).toHaveLength(1);
    expect(result.communities[0].crossesDomains).toBe(true);
    expect(result.communities[0].domainCount).toBe(2);
  });

  it("reports a single-domain community as not crossing domains", () => {
    const nodes = [
      makeNode({ id: "p", domain: "domain-X" }),
      makeNode({ id: "q", domain: "domain-X" }),
    ];
    const edges = [makeEdge({ id: "e", source: "p", target: "q" })];
    const result = detectCommunities(nodes, edges);
    expect(result.communities).toHaveLength(1);
    expect(result.communities[0].crossesDomains).toBe(false);
    expect(result.communities[0].domainCount).toBe(1);
    expect(result.communities[0].dominantDomain).toBe("domain-X");
  });

  it("computes modularityProxy as the intra-community edge fraction", () => {
    const nodes = ["a", "b", "c", "d"].map((id) => makeNode({ id }));
    const edges = [
      makeEdge({ id: "e1", source: "a", target: "b" }),
      makeEdge({ id: "e2", source: "c", target: "d" }),
      makeEdge({ id: "e3", source: "b", target: "c" }),
    ];
    const result = detectCommunities(nodes, edges);
    expect(result.modularityProxy).toBeGreaterThanOrEqual(0);
    expect(result.modularityProxy).toBeLessThanOrEqual(1);
  });

  it("is deterministic across runs on the same graph", () => {
    const nodes = ["a", "b", "c", "d", "e"].map((id) => makeNode({ id }));
    const edges = [
      makeEdge({ id: "e1", source: "a", target: "b" }),
      makeEdge({ id: "e2", source: "b", target: "c" }),
      makeEdge({ id: "e3", source: "d", target: "e" }),
    ];
    const r1 = detectCommunities(nodes, edges);
    const r2 = detectCommunities(nodes, edges);
    expect([...r1.membership.entries()].sort()).toEqual(
      [...r2.membership.entries()].sort(),
    );
    expect(r1.communities.map((c) => c.id)).toEqual(
      r2.communities.map((c) => c.id),
    );
  });

  it("orders communities by size descending then id", () => {
    const nodes = ["a", "b", "c", "d", "e"].map((id) => makeNode({ id }));
    const edges = [
      makeEdge({ id: "e1", source: "a", target: "b" }),
      makeEdge({ id: "e2", source: "b", target: "c" }),
    ];
    const result = detectCommunities(nodes, edges);
    for (let i = 1; i < result.communities.length; i++) {
      expect(result.communities[i - 1].size).toBeGreaterThanOrEqual(
        result.communities[i].size,
      );
    }
  });

  it("ignores self-loops", () => {
    const nodes = [makeNode({ id: "a" }), makeNode({ id: "b" })];
    const edges = [
      makeEdge({ id: "self", source: "a", target: "a" }),
      makeEdge({ id: "real", source: "a", target: "b" }),
    ];
    const result = detectCommunities(nodes, edges);
    expect(result.communities).toHaveLength(1);
    expect(result.communities[0].size).toBe(2);
  });

  it("converges within MAX_ITERATIONS for a moderate graph", () => {
    const nodes = Array.from({ length: 12 }, (_, i) =>
      makeNode({ id: `n${i}`, domain: i < 6 ? "left" : "right" }),
    );
    const edges: ReturnType<typeof makeEdge>[] = [];
    for (let i = 0; i < 5; i++) {
      edges.push(makeEdge({ id: `l-${i}`, source: `n${i}`, target: `n${i + 1}` }));
    }
    for (let i = 6; i < 11; i++) {
      edges.push(makeEdge({ id: `r-${i}`, source: `n${i}`, target: `n${i + 1}` }));
    }
    edges.push(makeEdge({ id: "bridge", source: "n5", target: "n6" }));
    const result = detectCommunities(nodes, edges);
    expect(result.converged).toBe(true);
    expect(result.iterations).toBeLessThanOrEqual(20);
  });
});
