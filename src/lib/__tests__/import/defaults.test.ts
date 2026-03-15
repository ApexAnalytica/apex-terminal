import { describe, it, expect } from "vitest";
import { applyNodeDefaults, applyEdgeDefaults } from "@/lib/import/defaults";
import { RawNode, RawEdge } from "@/lib/import/types";

describe("applyNodeDefaults", () => {
  it("generates an ID from index when id is missing", () => {
    const node = applyNodeDefaults({}, 3);
    expect(node.id).toBe("imported_node_3");
  });

  it("uses provided id", () => {
    const node = applyNodeDefaults({ id: "my_node" }, 0);
    expect(node.id).toBe("my_node");
  });

  it("derives label from id via titleCase when label missing", () => {
    const node = applyNodeDefaults({ id: "hello_world" }, 0);
    expect(node.label).toBe("Hello World");
  });

  it("derives shortLabel from label when missing", () => {
    const node = applyNodeDefaults({ id: "test", label: "Alpha Node" }, 0);
    expect(node.shortLabel).toBe("ALP");
  });

  it("defaults category to infrastructure for invalid values", () => {
    const node = applyNodeDefaults({ id: "x", category: "bogus" }, 0);
    expect(node.category).toBe("infrastructure");
  });

  it("preserves valid categories", () => {
    const node = applyNodeDefaults({ id: "x", category: "energy" }, 0);
    expect(node.category).toBe("energy");
  });

  it("clamps omega values to [0, 10]", () => {
    const node = applyNodeDefaults(
      { id: "x", omegaFragility: { composite: 15, irreplaceability: -3 } },
      0
    );
    expect(node.omegaFragility.composite).toBe(10);
    expect(node.omegaFragility.irreplaceability).toBe(0);
  });

  it("applies midpoint (5.0) defaults for missing omega fields", () => {
    const node = applyNodeDefaults({ id: "x" }, 0);
    expect(node.omegaFragility.composite).toBe(5.0);
    expect(node.omegaFragility.cascadeLoad).toBe(5.0);
    expect(node.omegaFragility.tailDepth).toBe(5.0);
    expect(node.omegaFragility.restorationLatency).toBe(5.0);
    expect(node.omegaFragility.jurisdictionalHazard).toBe(5.0);
  });

  it("defaults discoverySource to merged for invalid values", () => {
    const node = applyNodeDefaults({ id: "x", discoverySource: "INVALID" }, 0);
    expect(node.discoverySource).toBe("merged");
  });

  it("preserves valid discoverySource", () => {
    const node = applyNodeDefaults({ id: "x", discoverySource: "DCD" }, 0);
    expect(node.discoverySource).toBe("DCD");
  });
});

describe("applyEdgeDefaults", () => {
  it("generates an ID from index when id is missing", () => {
    const edge = applyEdgeDefaults({ source: "a", target: "b" }, 5);
    expect(edge.id).toBe("imported_edge_5");
  });

  it("clamps weight to [0, 1]", () => {
    const edge = applyEdgeDefaults({ source: "a", target: "b", weight: 2.5 }, 0);
    expect(edge.weight).toBe(1);
  });

  it("clamps negative weight to 0", () => {
    const edge = applyEdgeDefaults({ source: "a", target: "b", weight: -0.5 }, 0);
    expect(edge.weight).toBe(0);
  });

  it("clamps confidence to [0, 1]", () => {
    const edge = applyEdgeDefaults({ source: "a", target: "b", confidence: 5 }, 0);
    expect(edge.confidence).toBe(1);
  });

  it("defaults weight and confidence to 0.5", () => {
    const edge = applyEdgeDefaults({ source: "a", target: "b" }, 0);
    expect(edge.weight).toBe(0.5);
    expect(edge.confidence).toBe(0.5);
  });

  it("defaults type to directed for invalid values", () => {
    const edge = applyEdgeDefaults({ source: "a", target: "b", type: "bogus" }, 0);
    expect(edge.type).toBe("directed");
  });

  it("preserves valid edge types", () => {
    const edge = applyEdgeDefaults({ source: "a", target: "b", type: "confounded" }, 0);
    expect(edge.type).toBe("confounded");
  });

  it("defaults empty source/target to empty string", () => {
    const edge = applyEdgeDefaults({}, 0);
    expect(edge.source).toBe("");
    expect(edge.target).toBe("");
  });
});
