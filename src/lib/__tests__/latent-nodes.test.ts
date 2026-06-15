import { describe, it, expect } from "vitest";
import { deriveLatentNodes, MIN_LATENT_MEMBERS } from "@/lib/latent-nodes";
import type { CausalGraph, CausalNode, CausalEdge, EdgeType } from "@/lib/types";

function node(id: string): CausalNode {
  return { id, shortLabel: id, label: id } as unknown as CausalNode;
}

function edge(
  source: string,
  target: string,
  opts: Partial<CausalEdge> = {},
): CausalEdge {
  return {
    id: `${source}__${target}`,
    source,
    target,
    weight: 0.5,
    lag: 1,
    type: "confounded" as EdgeType,
    confidence: 0.6,
    isInconsistent: false,
    physicalMechanism: "",
    ...opts,
  } as CausalEdge;
}

function graph(nodes: CausalNode[], edges: CausalEdge[]): CausalGraph {
  return { nodes, edges, metadata: {} } as unknown as CausalGraph;
}

describe("deriveLatentNodes", () => {
  it("returns nothing when there are no confounded edges", () => {
    const g = graph(
      [node("A"), node("B")],
      [edge("A", "B", { type: "directed" as EdgeType })],
    );
    expect(deriveLatentNodes(g)).toEqual([]);
  });

  it("promotes a 3-node confounded cluster to one latent node (node-over-edge rule)", () => {
    const g = graph(
      [node("A"), node("B"), node("C")],
      [
        edge("A", "B", { confidence: 0.6 }),
        edge("B", "C", { confidence: 0.8 }),
        edge("A", "C", { confidence: 0.7 }),
      ],
    );
    const latents = deriveLatentNodes(g);
    expect(latents).toHaveLength(1);
    expect(latents[0].explains.sort()).toEqual(["A", "B", "C"]);
    expect(latents[0].method).toBe("confounded-cluster");
    // strength = mean confidence of internal confounded edges = (0.6+0.8+0.7)/3
    expect(latents[0].strength).toBe(0.7);
    expect(latents[0].label).toContain("Inferred common cause");
  });

  it("does NOT promote a pairwise (2-node) confounded relationship — stays an edge", () => {
    const g = graph([node("A"), node("B")], [edge("A", "B")]);
    expect(deriveLatentNodes(g)).toEqual([]);
    expect(MIN_LATENT_MEMBERS).toBe(3);
  });

  it("separates disjoint clusters into distinct latent nodes", () => {
    const g = graph(
      ["A", "B", "C", "D", "E", "F"].map(node),
      [
        edge("A", "B"), edge("B", "C"), edge("A", "C"),
        edge("D", "E"), edge("E", "F"), edge("D", "F"),
      ],
    );
    const latents = deriveLatentNodes(g);
    expect(latents).toHaveLength(2);
    const sets = latents.map((l) => l.explains.sort().join(","));
    expect(sets).toContain("A,B,C");
    expect(sets).toContain("D,E,F");
  });

  it("ignores severed confounded edges", () => {
    // A-B-C triangle but A-C severed → A,B,C still connected via A-B-C path? No:
    // A-B and B-C remain → component {A,B,C} of size 3 still promotes.
    const g = graph(
      ["A", "B", "C"].map(node),
      [edge("A", "B"), edge("B", "C"), edge("A", "C", { isSevered: true })],
    );
    expect(deriveLatentNodes(g)).toHaveLength(1);

    // Now sever B-C too → only A-B remains → pair → no latent.
    const g2 = graph(
      ["A", "B", "C"].map(node),
      [edge("A", "B"), edge("B", "C", { isSevered: true }), edge("A", "C", { isSevered: true })],
    );
    expect(deriveLatentNodes(g2)).toEqual([]);
  });
});

describe("safety guarantee — latent nodes never enter the real graph", () => {
  const g = graph(
    ["A", "B", "C"].map(node),
    [edge("A", "B"), edge("B", "C"), edge("A", "C")],
  );

  it("does not mutate the input graph", () => {
    const nodesBefore = g.nodes.length;
    const edgesBefore = g.edges.length;
    deriveLatentNodes(g);
    expect(g.nodes.length).toBe(nodesBefore);
    expect(g.edges.length).toBe(edgesBefore);
  });

  it("latent ids are namespaced and never collide with real node ids", () => {
    const latents = deriveLatentNodes(g);
    const realIds = new Set(g.nodes.map((n) => n.id));
    for (const l of latents) {
      expect(l.id.startsWith("latent__")).toBe(true);
      expect(realIds.has(l.id)).toBe(false);
    }
  });
});
