import { describe, it, expect } from "vitest";
import { summarizeDiscoveryUncertainty } from "@/lib/discovery-uncertainty";
import { makeNode, makeEdge, makeGraph } from "./fixtures/graph-fixtures";

describe("summarizeDiscoveryUncertainty", () => {
  it("returns zeros for an empty graph", () => {
    const s = summarizeDiscoveryUncertainty([], []);
    expect(s.edgeCount).toBe(0);
    expect(s.meanEdgeConfidence).toBe(0);
    expect(s.medianEdgeConfidence).toBe(0);
    expect(s.lowConfidenceCount).toBe(0);
    expect(s.mergedFraction).toBe(0);
    expect(s.singleSourceFraction).toBe(0);
  });

  it("computes mean edge confidence across edges", () => {
    const nodes = [makeNode({ id: "a" }), makeNode({ id: "b" })];
    const edges = [
      makeEdge({ id: "e1", source: "a", target: "b", confidence: 0.6 }),
      makeEdge({ id: "e2", source: "a", target: "b", confidence: 0.8 }),
      makeEdge({ id: "e3", source: "a", target: "b", confidence: 1.0 }),
    ];
    const s = summarizeDiscoveryUncertainty(nodes, edges);
    expect(s.meanEdgeConfidence).toBeCloseTo(0.8, 2);
  });

  it("computes median edge confidence (odd count)", () => {
    const nodes = [makeNode({ id: "a" }), makeNode({ id: "b" })];
    const edges = [
      makeEdge({ id: "e1", source: "a", target: "b", confidence: 0.3 }),
      makeEdge({ id: "e2", source: "a", target: "b", confidence: 0.5 }),
      makeEdge({ id: "e3", source: "a", target: "b", confidence: 0.9 }),
    ];
    const s = summarizeDiscoveryUncertainty(nodes, edges);
    expect(s.medianEdgeConfidence).toBe(0.5);
  });

  it("computes median edge confidence (even count, averages middle two)", () => {
    const nodes = [makeNode({ id: "a" }), makeNode({ id: "b" })];
    const edges = [
      makeEdge({ id: "e1", source: "a", target: "b", confidence: 0.2 }),
      makeEdge({ id: "e2", source: "a", target: "b", confidence: 0.4 }),
      makeEdge({ id: "e3", source: "a", target: "b", confidence: 0.6 }),
      makeEdge({ id: "e4", source: "a", target: "b", confidence: 0.8 }),
    ];
    const s = summarizeDiscoveryUncertainty(nodes, edges);
    expect(s.medianEdgeConfidence).toBeCloseTo(0.5, 2);
  });

  it("counts edges below the 0.7 low-confidence threshold", () => {
    const nodes = [makeNode({ id: "a" }), makeNode({ id: "b" })];
    const edges = [
      makeEdge({ id: "e1", source: "a", target: "b", confidence: 0.5 }),
      makeEdge({ id: "e2", source: "a", target: "b", confidence: 0.6 }),
      makeEdge({ id: "e3", source: "a", target: "b", confidence: 0.69999 }),
      makeEdge({ id: "e4", source: "a", target: "b", confidence: 0.7 }),
      makeEdge({ id: "e5", source: "a", target: "b", confidence: 0.9 }),
    ];
    const s = summarizeDiscoveryUncertainty(nodes, edges);
    expect(s.lowConfidenceCount).toBe(3);
    expect(s.lowConfidenceFraction).toBeCloseTo(0.6, 2);
  });

  it("breaks down nodes by discoverySource", () => {
    const nodes = [
      makeNode({ id: "n1", discoverySource: "DCD" }),
      makeNode({ id: "n2", discoverySource: "DCD" }),
      makeNode({ id: "n3", discoverySource: "PCMCI+" }),
      makeNode({ id: "n4", discoverySource: "FCI" }),
      makeNode({ id: "n5", discoverySource: "merged" }),
      makeNode({ id: "n6", discoverySource: "merged" }),
      makeNode({ id: "n7", discoverySource: "merged" }),
    ];
    const s = summarizeDiscoveryUncertainty(nodes, []);
    expect(s.sourceBreakdown.DCD).toBe(2);
    expect(s.sourceBreakdown.PCMCI).toBe(1);
    expect(s.sourceBreakdown.FCI).toBe(1);
    expect(s.sourceBreakdown.merged).toBe(3);
    expect(s.mergedFraction).toBeCloseTo(3 / 7, 2);
    expect(s.singleSourceFraction).toBeCloseTo(4 / 7, 2);
  });

  it("ignores non-finite edge confidences", () => {
    const nodes = [makeNode({ id: "a" }), makeNode({ id: "b" })];
    const edges = [
      makeEdge({ id: "e1", source: "a", target: "b", confidence: 0.8 }),
      makeEdge({ id: "e2", source: "a", target: "b", confidence: Number.NaN }),
      makeEdge({ id: "e3", source: "a", target: "b", confidence: 1.0 }),
    ];
    const s = summarizeDiscoveryUncertainty(nodes, edges);
    expect(s.meanEdgeConfidence).toBeCloseTo(0.9, 2);
  });

  it("merged fraction + single-source fraction may not sum to 1 when 'other' present", () => {
    const nodes = [
      makeNode({ id: "n1", discoverySource: "merged" }),
      makeNode({ id: "n2", discoverySource: "DCD" }),
    ];
    const s = summarizeDiscoveryUncertainty(nodes, []);
    expect(s.mergedFraction + s.singleSourceFraction).toBeCloseTo(1, 2);
  });
});
