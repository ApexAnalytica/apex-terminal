import { describe, it, expect } from "vitest";
import { runTarskiValidation } from "@/lib/tarski-data";
import { makeNode, makeEdge, makeGraph } from "./fixtures/graph-fixtures";
import type { LiveDataPoint } from "@/lib/types";

const sanctionsPoint = (programs: number, source = "OFAC SDN — Iran"): LiveDataPoint => ({
  kind: "sanctions",
  value: programs,
  capacity: 1,
  unit: "programs",
  observedAt: "2025-01-01T00:00:00.000Z",
  source,
});

describe("R-01 Jurisdictional Concentration — liveData branch", () => {
  it("flags a high-weight edge to a live-sanctioned node even when static J is low", () => {
    const graph = makeGraph(
      [
        makeNode({ id: "buyer", label: "European Refinery" }),
        makeNode({
          id: "iran_node",
          label: "Iranian Producer",
          omegaFragility: {
            composite: 5,
            irreplaceability: 5,
            cascadeLoad: 5,
            tailDepth: 5,
            restorationLatency: 5,
            jurisdictionalHazard: 4, // static J well below the 8 threshold
          },
          liveData: [sanctionsPoint(3)],
        }),
      ],
      [makeEdge({ id: "e1", source: "iran_node", target: "buyer", weight: 0.8 })],
    );
    const report = runTarskiValidation(graph, new Set(["R-01"]));
    expect(report.inconsistentEdgeIds.has("e1")).toBe(true);
    const trace = report.proofTraces.find((t) => t.violatedAxioms.includes("R-01"));
    expect(trace?.detail).toContain("active program");
  });

  it("does not flag low-weight edges (< 0.7) regardless of sanctions", () => {
    const graph = makeGraph(
      [
        makeNode({ id: "buyer", label: "European Refinery" }),
        makeNode({
          id: "iran_node",
          label: "Iranian Producer",
          liveData: [sanctionsPoint(5)],
        }),
      ],
      [makeEdge({ id: "e1", source: "iran_node", target: "buyer", weight: 0.5 })],
    );
    const report = runTarskiValidation(graph, new Set(["R-01"]));
    expect(report.totalViolations).toBe(0);
  });

  it("falls back to static J ≥ 8 when no liveData is attached", () => {
    const graph = makeGraph(
      [
        makeNode({ id: "buyer", label: "European Refinery" }),
        makeNode({
          id: "high_j",
          label: "Conflict Zone Asset",
          omegaFragility: {
            composite: 5, irreplaceability: 5, cascadeLoad: 5, tailDepth: 5,
            restorationLatency: 5, jurisdictionalHazard: 9,
          },
        }),
      ],
      [makeEdge({ id: "e1", source: "high_j", target: "buyer", weight: 0.8 })],
    );
    const report = runTarskiValidation(graph, new Set(["R-01"]));
    expect(report.inconsistentEdgeIds.has("e1")).toBe(true);
    const trace = report.proofTraces.find((t) => t.violatedAxioms.includes("R-01"));
    expect(trace?.detail).toContain("static J");
  });
});

describe("R-02 Force Majeure Exposure", () => {
  const conflictNode = (id: string, J: number, R: number, label = id) =>
    makeNode({
      id,
      label,
      omegaFragility: {
        composite: 5, irreplaceability: 5, cascadeLoad: 5, tailDepth: 5,
        restorationLatency: R, jurisdictionalHazard: J,
      },
    });

  it("flags a node with live sanctions AND high restoration latency", () => {
    const graph = makeGraph(
      [
        conflictNode("syria_asset", 4, 8, "Damascus Production"),
        makeNode({ id: "buyer", label: "European Refinery" }),
      ],
      [makeEdge({ id: "e1", source: "syria_asset", target: "buyer", weight: 0.5 })],
    );
    graph.nodes[0].liveData = [sanctionsPoint(2, "OFAC SDN — Syria")];

    const report = runTarskiValidation(graph, new Set(["R-02"]));
    expect(report.restrictedNodeIds.has("syria_asset")).toBe(true);
    expect(report.inconsistentEdgeIds.has("e1")).toBe(true);
    const trace = report.proofTraces.find((t) => t.violatedAxioms.includes("R-02"));
    expect(trace?.detail).toContain("Syria");
    expect(trace?.detail).toContain("restoration latency");
  });

  it("does not flag when restoration latency is below 7", () => {
    const graph = makeGraph(
      [
        conflictNode("low_R", 9, 5, "Recoverable Asset"),
        makeNode({ id: "buyer" }),
      ],
      [makeEdge({ id: "e1", source: "low_R", target: "buyer" })],
    );
    const report = runTarskiValidation(graph, new Set(["R-02"]));
    expect(report.totalViolations).toBe(0);
  });

  it("does not flag a high-R node without sanctions or static high J", () => {
    const graph = makeGraph(
      [
        conflictNode("normal_node", 5, 9, "Slow Recovery But No Conflict"),
        makeNode({ id: "buyer" }),
      ],
      [makeEdge({ id: "e1", source: "normal_node", target: "buyer" })],
    );
    const report = runTarskiValidation(graph, new Set(["R-02"]));
    expect(report.totalViolations).toBe(0);
  });

  it("falls back to static J ≥ 7 ∧ R ≥ 7 when no liveData attached", () => {
    const graph = makeGraph(
      [
        conflictNode("static_force_majeure", 8, 8, "Static Conflict Asset"),
        makeNode({ id: "buyer" }),
      ],
      [makeEdge({ id: "e1", source: "static_force_majeure", target: "buyer" })],
    );
    const report = runTarskiValidation(graph, new Set(["R-02"]));
    expect(report.restrictedNodeIds.has("static_force_majeure")).toBe(true);
    const trace = report.proofTraces.find((t) => t.violatedAxioms.includes("R-02"));
    expect(trace?.detail).toContain("no live sanctions data");
  });
});
