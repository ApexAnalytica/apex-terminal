import { describe, it, expect } from "vitest";
import { runTarskiValidation } from "@/lib/tarski-data";
import { makeGraph, makeNode, makeEdge } from "./fixtures/graph-fixtures";
import type { LiveDataPoint } from "@/lib/types";

// ─── R-04 — Cross-Domain Dependency × WGI governance branch ──────────
//
// R-04 flags cross-domain edges with confidence below a threshold. The
// threshold defaults to 0.7 but tightens to 0.85 when either endpoint
// carries a `governance` LiveDataPoint with value < 0 (below world
// average on the WGI scale). These fixtures verify the live-vs-static
// branching of that logic.

function governance(value: number, label: string): LiveDataPoint {
  return {
    kind: "governance",
    providerId: "world-bank",
    value,
    capacity: 0,
    unit: "WGI",
    observedAt: "2026-01-01T00:00:00Z",
    source: `World Bank · WGI Rule of Law (test, ${label})`,
  };
}

const R04 = new Set(["R-04"]);

describe("R-04 — cross-domain confidence threshold (static fallback)", () => {
  it("flags a cross-domain edge with confidence < 0.7 (no governance live data)", () => {
    const nodes = [
      makeNode({ id: "src", domain: "Geopolitical" }),
      makeNode({ id: "tgt", domain: "Macro" }),
    ];
    const edges = [
      makeEdge({ id: "e", source: "src", target: "tgt", confidence: 0.65 }),
    ];
    const report = runTarskiValidation(makeGraph(nodes, edges), R04);
    expect(report.inconsistentEdgeIds).toContain("e");
  });

  it("does NOT flag a cross-domain edge with confidence 0.75 (passes static 0.7)", () => {
    const nodes = [
      makeNode({ id: "src", domain: "Geopolitical" }),
      makeNode({ id: "tgt", domain: "Macro" }),
    ];
    const edges = [
      makeEdge({ id: "e", source: "src", target: "tgt", confidence: 0.75 }),
    ];
    const report = runTarskiValidation(makeGraph(nodes, edges), R04);
    expect(report.inconsistentEdgeIds).not.toContain("e");
  });

  it("does NOT flag same-domain edges regardless of confidence", () => {
    const nodes = [
      makeNode({ id: "src", domain: "Same" }),
      makeNode({ id: "tgt", domain: "Same" }),
    ];
    const edges = [
      makeEdge({ id: "e", source: "src", target: "tgt", confidence: 0.4 }),
    ];
    const report = runTarskiValidation(makeGraph(nodes, edges), R04);
    expect(report.inconsistentEdgeIds).not.toContain("e");
  });
});

describe("R-04 — cross-domain confidence threshold (WGI governance branch)", () => {
  it("flags a 0.75-confidence cross-domain edge when source has WGI < 0 (threshold tightens to 0.85)", () => {
    const nodes = [
      makeNode({
        id: "src",
        domain: "Geopolitical",
        liveData: [governance(-0.4, "China")],
      }),
      makeNode({ id: "tgt", domain: "Macro" }),
    ];
    const edges = [
      makeEdge({ id: "e", source: "src", target: "tgt", confidence: 0.75 }),
    ];
    const report = runTarskiValidation(makeGraph(nodes, edges), R04);
    expect(report.inconsistentEdgeIds).toContain("e");
    const trace = report.proofTraces.find((t) => t.edgeId === "e");
    expect(trace).toBeDefined();
    expect(trace!.detail).toContain("WGI");
    expect(trace!.detail).toContain("-0.40");
  });

  it("flags a 0.75-confidence cross-domain edge when target (not source) has WGI < 0", () => {
    const nodes = [
      makeNode({ id: "src", domain: "Geopolitical" }),
      makeNode({
        id: "tgt",
        domain: "Macro",
        liveData: [governance(-0.2, "Brazil")],
      }),
    ];
    const edges = [
      makeEdge({ id: "e", source: "src", target: "tgt", confidence: 0.75 }),
    ];
    const report = runTarskiValidation(makeGraph(nodes, edges), R04);
    expect(report.inconsistentEdgeIds).toContain("e");
  });

  it("uses the WEAKEST endpoint's governance score for detail when both have WGI < 0", () => {
    const nodes = [
      makeNode({
        id: "src",
        domain: "Geopolitical",
        label: "Less Weak",
        liveData: [governance(-0.3, "Less weak")],
      }),
      makeNode({
        id: "tgt",
        domain: "Macro",
        label: "Most Weak",
        liveData: [governance(-1.2, "Most weak")],
      }),
    ];
    const edges = [
      makeEdge({ id: "e", source: "src", target: "tgt", confidence: 0.8 }),
    ];
    const report = runTarskiValidation(makeGraph(nodes, edges), R04);
    expect(report.inconsistentEdgeIds).toContain("e");
    const trace = report.proofTraces.find((t) => t.edgeId === "e");
    expect(trace!.detail).toContain("Most Weak");
    expect(trace!.detail).toContain("-1.20");
  });

  it("does NOT tighten when endpoint governance is ≥ 0 (strong governance)", () => {
    const nodes = [
      makeNode({
        id: "src",
        domain: "Geopolitical",
        liveData: [governance(0.5, "Strong")],
      }),
      makeNode({ id: "tgt", domain: "Macro" }),
    ];
    const edges = [
      makeEdge({ id: "e", source: "src", target: "tgt", confidence: 0.75 }),
    ];
    const report = runTarskiValidation(makeGraph(nodes, edges), R04);
    expect(report.inconsistentEdgeIds).not.toContain("e");
  });

  it("does NOT flag a 0.9-confidence cross-domain edge even with weak governance", () => {
    const nodes = [
      makeNode({
        id: "src",
        domain: "Geopolitical",
        liveData: [governance(-1.5, "Very weak")],
      }),
      makeNode({ id: "tgt", domain: "Macro" }),
    ];
    const edges = [
      makeEdge({ id: "e", source: "src", target: "tgt", confidence: 0.9 }),
    ];
    const report = runTarskiValidation(makeGraph(nodes, edges), R04);
    expect(report.inconsistentEdgeIds).not.toContain("e");
  });
});
