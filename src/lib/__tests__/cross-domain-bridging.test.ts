import { describe, it, expect } from "vitest";
import {
  applyCrossDomainBridges,
  findConnectedComponents,
  proposeCrossDomainBridges,
  bridgesToEdges,
  isAutoBridge,
  extractAutoBridgeScore,
  bridgeStatus,
  AUTO_BRIDGE_ID_PREFIX,
} from "@/lib/cross-domain-bridging";
import { makeGraph, makeNode, makeEdge } from "./fixtures/graph-fixtures";

describe("findConnectedComponents", () => {
  it("returns one component for a fully-connected graph", () => {
    const nodes = [makeNode({ id: "A" }), makeNode({ id: "B" }), makeNode({ id: "C" })];
    const edges = [
      makeEdge({ id: "e1", source: "A", target: "B" }),
      makeEdge({ id: "e2", source: "B", target: "C" }),
    ];
    const { components, membership } = findConnectedComponents(makeGraph(nodes, edges));
    expect(components.length).toBe(1);
    expect(components[0].sort()).toEqual(["A", "B", "C"]);
    expect(membership.get("A")).toBe(membership.get("C"));
  });

  it("returns multiple components when the graph is disconnected", () => {
    const nodes = [
      makeNode({ id: "A" }),
      makeNode({ id: "B" }),
      makeNode({ id: "C" }),
      makeNode({ id: "D" }),
    ];
    const edges = [
      makeEdge({ id: "e1", source: "A", target: "B" }),
      makeEdge({ id: "e2", source: "C", target: "D" }),
    ];
    const { components } = findConnectedComponents(makeGraph(nodes, edges));
    expect(components.length).toBe(2);
  });

  it("treats edges as undirected when finding components", () => {
    const nodes = [makeNode({ id: "A" }), makeNode({ id: "B" })];
    // Single directed edge A → B: A and B are still in the same component.
    const edges = [makeEdge({ id: "e1", source: "A", target: "B" })];
    const { components } = findConnectedComponents(makeGraph(nodes, edges));
    expect(components.length).toBe(1);
  });

  it("places isolated nodes in their own components", () => {
    const nodes = [makeNode({ id: "A" }), makeNode({ id: "B" }), makeNode({ id: "C" })];
    const edges = [makeEdge({ id: "e1", source: "A", target: "B" })];
    const { components } = findConnectedComponents(makeGraph(nodes, edges));
    expect(components.length).toBe(2); // {A, B} and {C}
  });
});

describe("proposeCrossDomainBridges", () => {
  it("returns no bridges when the graph is already connected", () => {
    const nodes = [
      makeNode({ id: "A", domain: "X" }),
      makeNode({ id: "B", domain: "Y" }),
    ];
    const edges = [makeEdge({ id: "e1", source: "A", target: "B" })];
    const bridges = proposeCrossDomainBridges(makeGraph(nodes, edges));
    expect(bridges).toEqual([]);
  });

  it("proposes a bridge between two disconnected cross-domain components when category aligns", () => {
    const nodes = [
      makeNode({
        id: "A",
        domain: "Energy Grid",
        category: "energy",
        label: "US Power Plant",
      }),
      makeNode({
        id: "B",
        domain: "Energy Grid",
        category: "energy",
        label: "US Power Substation",
      }),
      makeNode({
        id: "C",
        domain: "Supply Chain",
        category: "infrastructure",
        label: "Port Power Connection",
      }),
      makeNode({
        id: "D",
        domain: "Supply Chain",
        category: "infrastructure",
        label: "Port Loading Crane",
      }),
    ];
    const edges = [
      makeEdge({ id: "e1", source: "A", target: "B" }),
      makeEdge({ id: "e2", source: "C", target: "D" }),
    ];
    const bridges = proposeCrossDomainBridges(makeGraph(nodes, edges));
    expect(bridges.length).toBeGreaterThanOrEqual(1);
    const top = bridges[0];
    // The pair should be cross-domain.
    const sourceDomain = nodes.find((n) => n.id === top.sourceId)!.domain;
    const targetDomain = nodes.find((n) => n.id === top.targetId)!.domain;
    expect(sourceDomain).not.toBe(targetDomain);
    expect(top.score).toBeGreaterThanOrEqual(0.3);
    expect(top.rationale).toMatch(/category|label|Ω/);
  });

  it("does NOT propose bridges between same-domain components (treats as data issue)", () => {
    const nodes = [
      makeNode({ id: "A", domain: "Energy Grid", category: "energy" }),
      makeNode({ id: "B", domain: "Energy Grid", category: "energy" }),
      makeNode({ id: "C", domain: "Energy Grid", category: "energy" }),
      makeNode({ id: "D", domain: "Energy Grid", category: "energy" }),
    ];
    const edges = [
      makeEdge({ id: "e1", source: "A", target: "B" }),
      makeEdge({ id: "e2", source: "C", target: "D" }),
    ];
    const bridges = proposeCrossDomainBridges(makeGraph(nodes, edges));
    expect(bridges).toEqual([]);
  });

  it("respects minScore — high cutoff keeps only strong matches", () => {
    const nodes = [
      makeNode({
        id: "A",
        domain: "X",
        category: "science",
        label: "Asteroid Belt",
      }),
      makeNode({
        id: "B",
        domain: "Y",
        category: "agriculture",
        label: "Wheat Field",
      }),
    ];
    const edges: [] = [];
    const bridges = proposeCrossDomainBridges(makeGraph(nodes, edges), {
      minScore: 0.8,
    });
    expect(bridges).toEqual([]);
  });

  it("respects maxPerComponentPair — caps how many bridges connect each component pair", () => {
    const nodes = [
      makeNode({ id: "A1", domain: "X", category: "energy" }),
      makeNode({ id: "A2", domain: "X", category: "energy" }),
      makeNode({ id: "A3", domain: "X", category: "energy" }),
      makeNode({ id: "B1", domain: "Y", category: "infrastructure" }),
      makeNode({ id: "B2", domain: "Y", category: "infrastructure" }),
      makeNode({ id: "B3", domain: "Y", category: "infrastructure" }),
    ];
    const edges = [
      makeEdge({ id: "e1", source: "A1", target: "A2" }),
      makeEdge({ id: "e2", source: "A2", target: "A3" }),
      makeEdge({ id: "e3", source: "B1", target: "B2" }),
      makeEdge({ id: "e4", source: "B2", target: "B3" }),
    ];
    const bridges = proposeCrossDomainBridges(makeGraph(nodes, edges), {
      maxPerComponentPair: 1,
    });
    expect(bridges.length).toBe(1);
  });

  it("respects maxTotal cap when many candidates clear minScore", () => {
    // 4 disconnected pairs, each cross-domain & same-category → 6 component-pair bridges
    const nodes = [
      makeNode({ id: "A1", domain: "X", category: "energy" }),
      makeNode({ id: "A2", domain: "X", category: "energy" }),
      makeNode({ id: "B1", domain: "Y", category: "energy" }),
      makeNode({ id: "B2", domain: "Y", category: "energy" }),
      makeNode({ id: "C1", domain: "Z", category: "energy" }),
      makeNode({ id: "C2", domain: "Z", category: "energy" }),
      makeNode({ id: "D1", domain: "W", category: "energy" }),
      makeNode({ id: "D2", domain: "W", category: "energy" }),
    ];
    const edges = [
      makeEdge({ id: "e1", source: "A1", target: "A2" }),
      makeEdge({ id: "e2", source: "B1", target: "B2" }),
      makeEdge({ id: "e3", source: "C1", target: "C2" }),
      makeEdge({ id: "e4", source: "D1", target: "D2" }),
    ];
    const bridges = proposeCrossDomainBridges(makeGraph(nodes, edges), {
      maxPerComponentPair: 2,
      maxTotal: 3,
    });
    expect(bridges.length).toBe(3);
  });

  it("sorts bridges by score (highest first)", () => {
    const nodes = [
      // High affinity pair (same category + label overlap)
      makeNode({ id: "A1", domain: "X", category: "energy", label: "Power Grid East" }),
      makeNode({ id: "B1", domain: "Y", category: "energy", label: "Power Grid West" }),
      // Medium-affinity pair (related categories, no label overlap)
      makeNode({ id: "A2", domain: "X", category: "agriculture", label: "Wheat Belt" }),
      makeNode({ id: "B2", domain: "Z", category: "manufacturing", label: "Fertilizer Plant" }),
    ];
    const edges = [
      makeEdge({ id: "e1", source: "A1", target: "A2" }),
      // B1, B2 are isolated components
    ];
    const bridges = proposeCrossDomainBridges(makeGraph(nodes, edges), {
      maxPerComponentPair: 5,
      maxTotal: 10,
    });
    for (let k = 1; k < bridges.length; k++) {
      expect(bridges[k].score).toBeLessThanOrEqual(bridges[k - 1].score);
    }
  });
});

describe("bridgesToEdges", () => {
  it("emits low-confidence (0.5) directed edges tagged with the auto-bridge rationale", () => {
    const bridges = [
      {
        sourceId: "A",
        targetId: "B",
        score: 0.75,
        rationale: "same category (energy)",
        componentA: 0,
        componentB: 1,
      },
    ];
    const edges = bridgesToEdges(bridges);
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe("A");
    expect(edges[0].target).toBe("B");
    expect(edges[0].confidence).toBe(0.5); // below R-04 0.7 → flagged
    expect(edges[0].type).toBe("directed");
    expect(edges[0].physicalMechanism).toContain("auto-bridge");
    expect(edges[0].physicalMechanism).toContain("same category");
    expect(edges[0].id).toContain("auto-bridge");
  });
});

describe("applyCrossDomainBridges", () => {
  it("is a no-op on already-connected graphs", () => {
    const nodes = [
      makeNode({ id: "A", domain: "X", category: "energy" }),
      makeNode({ id: "B", domain: "Y", category: "energy" }),
    ];
    const edges = [makeEdge({ id: "e1", source: "A", target: "B" })];
    const before = makeGraph(nodes, edges);
    const { graph: after, bridges } = applyCrossDomainBridges(before);
    expect(after).toBe(before); // returns the same reference when nothing to do
    expect(bridges).toEqual([]);
  });

  it("appends bridge edges to the graph (does not mutate input)", () => {
    const nodes = [
      makeNode({ id: "A1", domain: "X", category: "energy" }),
      makeNode({ id: "A2", domain: "X", category: "energy" }),
      makeNode({ id: "B1", domain: "Y", category: "energy" }),
      makeNode({ id: "B2", domain: "Y", category: "energy" }),
    ];
    const edges = [
      makeEdge({ id: "e1", source: "A1", target: "A2" }),
      makeEdge({ id: "e2", source: "B1", target: "B2" }),
    ];
    const before = makeGraph(nodes, edges);
    const beforeEdgeCount = before.edges.length;
    const { graph: after, bridges } = applyCrossDomainBridges(before);
    expect(bridges.length).toBeGreaterThan(0);
    expect(after.edges.length).toBe(beforeEdgeCount + bridges.length);
    // Original graph reference unchanged.
    expect(before.edges.length).toBe(beforeEdgeCount);
    // Metadata totalEdges updated.
    expect(after.metadata.totalEdges).toBe(beforeEdgeCount + bridges.length);
  });

  it("after bridging, the graph has fewer components than before", () => {
    const nodes = [
      makeNode({ id: "A1", domain: "X", category: "energy" }),
      makeNode({ id: "A2", domain: "X", category: "energy" }),
      makeNode({ id: "B1", domain: "Y", category: "energy" }),
      makeNode({ id: "B2", domain: "Y", category: "energy" }),
    ];
    const edges = [
      makeEdge({ id: "e1", source: "A1", target: "A2" }),
      makeEdge({ id: "e2", source: "B1", target: "B2" }),
    ];
    const before = makeGraph(nodes, edges);
    const { components: beforeComps } = findConnectedComponents(before);
    const { graph: after } = applyCrossDomainBridges(before);
    const { components: afterComps } = findConnectedComponents(after);
    expect(afterComps.length).toBeLessThan(beforeComps.length);
  });
});

describe("isAutoBridge / extractAutoBridgeScore — EdgeInspector helpers", () => {
  it("isAutoBridge: true on auto-bridge id prefix, false on regular edges", () => {
    expect(isAutoBridge({ id: "auto-bridge-0-A-B" })).toBe(true);
    expect(isAutoBridge({ id: AUTO_BRIDGE_ID_PREFIX })).toBe(true);
    expect(isAutoBridge({ id: "regular-edge-id" })).toBe(false);
    expect(isAutoBridge({ id: "e1" })).toBe(false);
    expect(isAutoBridge({ id: "" })).toBe(false);
  });

  it("extractAutoBridgeScore: pulls the score out of the physicalMechanism string", () => {
    expect(
      extractAutoBridgeScore(
        "auto-bridge: same category (energy) · Ω 7.5×6.2 (heuristic score 0.73)",
      ),
    ).toBeCloseTo(0.73);
    expect(extractAutoBridgeScore("auto-bridge: x · (heuristic score 0.5)")).toBe(0.5);
  });

  it("extractAutoBridgeScore: returns null on null / undefined / unmatched strings", () => {
    expect(extractAutoBridgeScore(null)).toBeNull();
    expect(extractAutoBridgeScore(undefined)).toBeNull();
    expect(extractAutoBridgeScore("")).toBeNull();
    expect(extractAutoBridgeScore("regular physical mechanism, no score")).toBeNull();
  });

  it("end-to-end: bridgesToEdges output is recognised by isAutoBridge + has extractable score", () => {
    const edges = bridgesToEdges([
      {
        sourceId: "A",
        targetId: "B",
        score: 0.65,
        rationale: "same category (energy)",
        componentA: 0,
        componentB: 1,
      },
    ]);
    expect(isAutoBridge(edges[0])).toBe(true);
    expect(extractAutoBridgeScore(edges[0].physicalMechanism)).toBeCloseTo(0.65);
  });

  it("bridgeStatus: auto / promoted / none lifecycle states", () => {
    // none — curator-authored edge
    expect(bridgeStatus({ id: "regular-edge" })).toBe("none");

    // auto — minted by bridgesToEdges
    const auto = bridgesToEdges([
      {
        sourceId: "A",
        targetId: "B",
        score: 0.5,
        rationale: "same category",
        componentA: 0,
        componentB: 1,
      },
    ])[0];
    expect(bridgeStatus(auto)).toBe("auto");

    // promoted — id retained, physicalMechanism prefix flipped (what
    // the promoteAutoBridge store action does)
    const promoted = {
      ...auto,
      physicalMechanism: auto.physicalMechanism!.replace(
        /^auto-bridge:/,
        "promoted bridge:",
      ),
    };
    expect(bridgeStatus(promoted)).toBe("promoted");
    // …and isAutoBridge stops returning true once promoted
    expect(isAutoBridge(promoted)).toBe(false);
  });
});
