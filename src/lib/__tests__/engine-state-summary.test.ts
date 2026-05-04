import { describe, it, expect } from "vitest";
import {
  renderEngineStateText,
  summarizeEngineState,
  summarizeFeeds,
  summarizePillarOverlays,
  summarizeTarski,
} from "@/lib/engine-state-summary";
import { makeNode, makeEdge, makeGraph } from "./fixtures/graph-fixtures";
import type { LiveDataPoint } from "@/lib/types";
import type { TarskiValidationReport } from "@/lib/tarski-data";

const livePoint = (
  kind: string,
  source: string,
  observedAt: string,
): LiveDataPoint => ({
  kind,
  value: 1,
  capacity: 1,
  unit: "",
  observedAt,
  source,
});

describe("summarizeFeeds", () => {
  it("returns empty array when no node has liveData", () => {
    const nodes = [makeNode({ id: "a", label: "A" })];
    expect(summarizeFeeds(nodes)).toEqual([]);
  });

  it("counts nodes per distinct kind and reports the latest observedAt", () => {
    const nodes = [
      makeNode({
        id: "a",
        label: "A",
        liveData: [livePoint("throughput", "EIA v2 (period 2025-01)", "2025-01-15T00:00:00.000Z")],
      }),
      makeNode({
        id: "b",
        label: "B",
        liveData: [livePoint("throughput", "EIA v2 (period 2025-02)", "2025-02-15T00:00:00.000Z")],
      }),
      makeNode({
        id: "c",
        label: "C",
        liveData: [livePoint("sanctions", "OFAC SDN — Iran:", "2025-03-01T00:00:00.000Z")],
      }),
    ];
    const summary = summarizeFeeds(nodes);
    expect(summary).toHaveLength(2);
    const tp = summary.find((s) => s.kind === "throughput")!;
    expect(tp.nodeCount).toBe(2);
    expect(tp.latestObservedAt).toBe("2025-02-15T00:00:00.000Z");
    expect(tp.mode).toBe("live");
    const sn = summary.find((s) => s.kind === "sanctions")!;
    expect(sn.nodeCount).toBe(1);
  });

  it("classifies mock-tagged sources correctly", () => {
    const nodes = [
      makeNode({
        id: "a",
        label: "A",
        liveData: [livePoint("indicator", "FRED · DFF (mock — FRED_API_KEY unset)", "2025-01-15T00:00:00.000Z")],
      }),
    ];
    const [s] = summarizeFeeds(nodes);
    expect(s.mode).toBe("mock");
  });

  it("sorts entries alphabetically by kind for stable comparison", () => {
    const nodes = [
      makeNode({ id: "a", label: "A", liveData: [livePoint("zeta", "x", "2025-01-15T00:00:00.000Z")] }),
      makeNode({ id: "b", label: "B", liveData: [livePoint("alpha", "y", "2025-01-15T00:00:00.000Z")] }),
    ];
    const summary = summarizeFeeds(nodes);
    expect(summary.map((s) => s.kind)).toEqual(["alpha", "zeta"]);
  });
});

describe("summarizeTarski", () => {
  it("returns inactive shape when report is null", () => {
    const s = summarizeTarski(null);
    expect(s.active).toBe(false);
    expect(s.violationsByAxiom).toEqual([]);
    expect(s.proofTraceCount).toBe(0);
  });

  it("counts per-axiom violations from proofTraces (one per axiomId per trace)", () => {
    const report: TarskiValidationReport = {
      inconsistentEdgeIds: new Set(["e1", "e2"]),
      restrictedNodeIds: new Set(["n1"]),
      proofTraces: [
        { edgeId: "e1", violatedAxioms: ["A-04", "R-01"], verdict: "FLAGGED", solverUsed: "Z3", checkTimeMs: 5 },
        { edgeId: "e2", violatedAxioms: ["A-04"], verdict: "FLAGGED", solverUsed: "Z3", checkTimeMs: 5 },
      ],
      totalViolations: 3,
    };
    const s = summarizeTarski(report);
    expect(s.active).toBe(true);
    expect(s.inconsistentEdgeCount).toBe(2);
    expect(s.restrictedNodeCount).toBe(1);
    expect(s.proofTraceCount).toBe(2);
    expect(s.violationsByAxiom).toEqual([
      { axiomId: "A-04", count: 2 },
      { axiomId: "R-01", count: 1 },
    ]);
  });

  it("orders axiom counts descending, ties broken alphabetically", () => {
    const report: TarskiValidationReport = {
      inconsistentEdgeIds: new Set(),
      restrictedNodeIds: new Set(),
      proofTraces: [
        { edgeId: "e1", violatedAxioms: ["R-02"], verdict: "FLAGGED", solverUsed: "Z3", checkTimeMs: 1 },
        { edgeId: "e2", violatedAxioms: ["A-04"], verdict: "FLAGGED", solverUsed: "Z3", checkTimeMs: 1 },
      ],
      totalViolations: 2,
    };
    const s = summarizeTarski(report);
    // Both have count 1 → alphabetical: A-04 before R-02
    expect(s.violationsByAxiom.map((v) => v.axiomId)).toEqual(["A-04", "R-02"]);
  });
});

describe("summarizePillarOverlays", () => {
  it("returns zeros when no node carries adjustments", () => {
    const s = summarizePillarOverlays([makeNode({ id: "a", label: "A" })]);
    expect(s).toEqual({ nodesWithJDelta: 0, nodesWithCDelta: 0, totalJDelta: 0, totalCDelta: 0 });
  });

  it("aggregates positive J and C deltas separately", () => {
    const nodes = [
      makeNode({ id: "a", label: "A", liveAdjustments: { jurisdictionalHazardDelta: 1.6 } }),
      makeNode({ id: "b", label: "B", liveAdjustments: { jurisdictionalHazardDelta: 0.8, cascadeLoadDelta: 0.9 } }),
      makeNode({ id: "c", label: "C", liveAdjustments: { cascadeLoadDelta: 1.5 } }),
    ];
    const s = summarizePillarOverlays(nodes);
    expect(s.nodesWithJDelta).toBe(2);
    expect(s.nodesWithCDelta).toBe(2);
    expect(s.totalJDelta).toBeCloseTo(2.4, 1);
    expect(s.totalCDelta).toBeCloseTo(2.4, 1);
  });

  it("ignores zero or negative deltas (cleanup leftovers)", () => {
    const nodes = [
      makeNode({ id: "a", label: "A", liveAdjustments: { jurisdictionalHazardDelta: 0 } }),
      makeNode({ id: "b", label: "B", liveAdjustments: { cascadeLoadDelta: -0.1 } }),
    ];
    const s = summarizePillarOverlays(nodes);
    expect(s.nodesWithJDelta).toBe(0);
    expect(s.nodesWithCDelta).toBe(0);
  });
});

describe("summarizeEngineState (top-level composition)", () => {
  it("composes graph + feeds + tarski + pillars in one structured object", () => {
    const graph = makeGraph(
      [
        makeNode({
          id: "a",
          label: "Node A",
          liveData: [livePoint("indicator", "FRED · DFF (period 2025-01)", "2025-01-15T00:00:00.000Z")],
          liveAdjustments: { jurisdictionalHazardDelta: 1.2 },
        }),
        makeNode({ id: "b", label: "Node B" }),
      ],
      [makeEdge({ id: "e1", source: "a", target: "b" })],
    );
    const report: TarskiValidationReport = {
      inconsistentEdgeIds: new Set(["e1"]),
      restrictedNodeIds: new Set(),
      proofTraces: [{ edgeId: "e1", violatedAxioms: ["A-04"], verdict: "FLAGGED", solverUsed: "Z3", checkTimeMs: 1 }],
      totalViolations: 1,
    };
    const s = summarizeEngineState(graph, report);
    expect(s.graph.nodeCount).toBe(2);
    expect(s.graph.edgeCount).toBe(1);
    expect(s.feeds).toHaveLength(1);
    expect(s.tarski.active).toBe(true);
    expect(s.tarski.violationsByAxiom).toEqual([{ axiomId: "A-04", count: 1 }]);
    expect(s.pillars.nodesWithJDelta).toBe(1);
    expect(s.pillars.totalJDelta).toBeCloseTo(1.2, 1);
    expect(typeof s.computedAt).toBe("string");
  });
});

describe("renderEngineStateText", () => {
  it("renders an empty graph cleanly", () => {
    const text = renderEngineStateText({
      graph: { nodeCount: 0, edgeCount: 0, density: 0 },
      feeds: [],
      tarski: { active: false, inconsistentEdgeCount: 0, restrictedNodeCount: 0, proofTraceCount: 0, violationsByAxiom: [] },
      pillars: { nodesWithJDelta: 0, nodesWithCDelta: 0, totalJDelta: 0, totalCDelta: 0 },
      computedAt: "now",
    });
    expect(text).toContain("Graph: 0 nodes");
    expect(text).toContain("Live feeds: none attached");
    expect(text).toContain("Tarski: RAW");
  });

  it("renders feeds, tarski violations, and pillar overlays when present", () => {
    const text = renderEngineStateText({
      graph: { nodeCount: 167, edgeCount: 318, density: 0.011 },
      feeds: [
        { kind: "indicator", mode: "live", nodeCount: 28, latestObservedAt: "2025-04-01T00:00:00.000Z" },
        { kind: "sanctions", mode: "mock-fallback", nodeCount: 1, latestObservedAt: "2025-04-01T00:00:00.000Z" },
      ],
      tarski: {
        active: true,
        inconsistentEdgeCount: 5,
        restrictedNodeCount: 2,
        proofTraceCount: 5,
        violationsByAxiom: [{ axiomId: "A-04", count: 3 }, { axiomId: "R-01", count: 2 }],
      },
      pillars: { nodesWithJDelta: 1, nodesWithCDelta: 3, totalJDelta: 1.6, totalCDelta: 2.7 },
      computedAt: "now",
    });
    expect(text).toContain("167 nodes, 318 edges");
    expect(text).toContain("indicator (live): 28 nodes");
    expect(text).toContain("sanctions (mock-fallback): 1 node");
    expect(text).toContain("Tarski: VERIFIED");
    expect(text).toContain("A-04: 3 violations");
    expect(text).toContain("Pillar overlays: 1 nodes J-elevated (+1.6 ΩF)");
    expect(text).toContain("3 nodes C-elevated (+2.7 ΩF)");
  });
});
