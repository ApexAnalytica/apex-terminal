import { describe, it, expect } from "vitest";
import { runTarskiValidation } from "@/lib/tarski-data";
import { makeNode, makeEdge, makeGraph } from "./fixtures/graph-fixtures";
import type { LiveDataPoint } from "@/lib/types";

const livePoint = (value: number, capacity = 21): LiveDataPoint => ({
  kind: "throughput",
  value,
  capacity,
  unit: "mb/d",
  observedAt: "2025-01-01T00:00:00.000Z",
  source: "test",
});

const stormPoint = (intensityKt: number, basin = "Atlantic"): LiveDataPoint => ({
  kind: "storm",
  value: intensityKt,
  capacity: 64, // hurricane threshold
  unit: "kt",
  observedAt: "2025-01-01T00:00:00.000Z",
  source: `NOAA NHC · ${basin} · 1 active (top: HU TEST @ ${intensityKt}kt)`,
});

const buildHormuzGraph = (chokepointPatch: Partial<{ liveData: LiveDataPoint[] }>) =>
  makeGraph(
    [
      makeNode({ id: "prod", label: "Persian Gulf Producer", domain: "Saudi Aramco Energy" }),
      makeNode({
        id: "hormuz",
        label: "Strait of Hormuz",
        domain: "Saudi Aramco Energy",
        ...chokepointPatch,
      }),
      makeNode({ id: "buyer", label: "Asian Refinery", domain: "QatarEnergy LNG" }),
    ],
    [
      makeEdge({ id: "e1", source: "prod", target: "hormuz", weight: 0.5, type: "temporal" }),
      makeEdge({ id: "e2", source: "hormuz", target: "buyer", weight: 0.5, type: "temporal" }),
    ],
  );

describe("A-04 Chokepoint Throughput Ceiling — liveData branch", () => {
  it("does NOT flag when liveData ratio is below the 0.9 saturation threshold", () => {
    const graph = buildHormuzGraph({ liveData: [livePoint(15)] }); // 15/21 ≈ 0.71
    const report = runTarskiValidation(graph, new Set(["A-04"]));
    expect(report.totalViolations).toBe(0);
    expect(report.restrictedNodeIds.has("hormuz")).toBe(false);
  });

  it("flags when liveData ratio exceeds 0.9", () => {
    const graph = buildHormuzGraph({ liveData: [livePoint(20)] }); // 20/21 ≈ 0.95
    const report = runTarskiValidation(graph, new Set(["A-04"]));
    expect(report.restrictedNodeIds.has("hormuz")).toBe(true);
    expect(report.inconsistentEdgeIds.size).toBeGreaterThan(0);
    const trace = report.proofTraces.find((t) => t.violatedAxioms.includes("A-04"));
    expect(trace).toBeDefined();
    expect(trace!.detail).toContain("Strait of Hormuz");
    expect(trace!.detail).toContain("mb/d");
  });

  it("liveData branch supersedes the structural fallback", () => {
    // With low edge weights but liveData over capacity, must flag.
    // (Without liveData, the same low-weight graph would NOT flag.)
    const graph = buildHormuzGraph({ liveData: [livePoint(20)] });
    expect(graph.edges.every((e) => e.weight === 0.5)).toBe(true);
    const sumWeights = graph.edges.reduce((s, e) => s + e.weight, 0);
    expect(sumWeights).toBeLessThan(3.0); // structural threshold not met
    const report = runTarskiValidation(graph, new Set(["A-04"]));
    expect(report.restrictedNodeIds.has("hormuz")).toBe(true);
  });

  it("falls back to structural edge-weight sum when liveData is absent", () => {
    // No liveData — depend purely on structural sum > 3.0
    const heavyGraph = makeGraph(
      [
        makeNode({ id: "prod", label: "Persian Gulf Producer", domain: "Saudi Aramco Energy" }),
        makeNode({ id: "hormuz", label: "Strait of Hormuz", domain: "Saudi Aramco Energy" }),
        makeNode({ id: "buyer", label: "Asian Refinery", domain: "QatarEnergy LNG" }),
      ],
      [
        makeEdge({ id: "e1", source: "prod", target: "hormuz", weight: 1.0, type: "temporal" }),
        makeEdge({ id: "e2", source: "hormuz", target: "buyer", weight: 1.0, type: "temporal" }),
        makeEdge({ id: "e3", source: "prod", target: "hormuz", weight: 1.0, type: "temporal" }),
        makeEdge({ id: "e4", source: "hormuz", target: "buyer", weight: 1.0, type: "temporal" }),
      ],
    );
    const report = runTarskiValidation(heavyGraph, new Set(["A-04"]));
    expect(report.restrictedNodeIds.has("hormuz")).toBe(true);
    const trace = report.proofTraces.find((t) => t.violatedAxioms.includes("A-04"));
    expect(trace?.detail).toContain("structural");
  });

});

describe("A-04 — NOAA storm branch (chokepoint × active tropical cyclone)", () => {
  it("does NOT flag when storm intensity is below the 64 kt hurricane threshold", () => {
    // Tropical-storm strength only (55 kt < 64 kt floor).
    const graph = buildHormuzGraph({ liveData: [livePoint(15), stormPoint(55)] });
    const report = runTarskiValidation(graph, new Set(["A-04"]));
    expect(report.restrictedNodeIds.has("hormuz")).toBe(false);
  });

  it("flags when an active hurricane (≥ 64 kt) is observed on a chokepoint", () => {
    const graph = buildHormuzGraph({ liveData: [livePoint(15), stormPoint(80)] });
    const report = runTarskiValidation(graph, new Set(["A-04"]));
    expect(report.restrictedNodeIds.has("hormuz")).toBe(true);
    const trace = report.proofTraces.find((t) => t.violatedAxioms.includes("A-04"));
    expect(trace).toBeDefined();
    expect(trace!.detail).toContain("active storm");
    expect(trace!.detail).toContain("80");
    expect(trace!.detail).toContain("NOAA NHC");
  });

  it("storm and throughput violations compose in the same proof detail", () => {
    // Throughput saturated AND hurricane present — detail should mention both.
    const graph = buildHormuzGraph({ liveData: [livePoint(20), stormPoint(120)] });
    const report = runTarskiValidation(graph, new Set(["A-04"]));
    const trace = report.proofTraces.find((t) => t.violatedAxioms.includes("A-04"));
    expect(trace!.detail).toContain("mb/d"); // throughput portion
    expect(trace!.detail).toContain("active storm"); // storm portion
    expect(trace!.detail).toContain("·"); // composed with the joiner
  });

  it("storm-only violation fires when throughput is healthy", () => {
    // Throughput well below saturation, but a major hurricane is bearing down.
    const graph = buildHormuzGraph({ liveData: [livePoint(10), stormPoint(96)] });
    const report = runTarskiValidation(graph, new Set(["A-04"]));
    expect(report.restrictedNodeIds.has("hormuz")).toBe(true);
    const trace = report.proofTraces.find((t) => t.violatedAxioms.includes("A-04"));
    // Throughput is fine (10/21 ≈ 48%, well under 0.9), so only the storm
    // line should land in detail.
    expect(trace!.detail).not.toContain("mb/d");
    expect(trace!.detail).toContain("active storm");
  });

  it("storm signal on a non-chokepoint node does not flag (A-04 stays scoped to chokepoints)", () => {
    const graph = makeGraph(
      [
        makeNode({ id: "prod", label: "Persian Gulf Producer", domain: "Saudi Aramco Energy" }),
        makeNode({
          id: "shipping",
          label: "Shipping Cost Index",
          domain: "Supply Chain",
          liveData: [stormPoint(100)],
        }),
      ],
      [makeEdge({ id: "e1", source: "prod", target: "shipping", type: "temporal" })],
    );
    const report = runTarskiValidation(graph, new Set(["A-04"]));
    expect(report.restrictedNodeIds.has("shipping")).toBe(false);
  });
});
