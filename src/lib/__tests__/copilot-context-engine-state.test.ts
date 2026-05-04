import { describe, it, expect } from "vitest";
import { serializeGraphContext } from "@/lib/copilot-context";
import { makeNode, makeEdge, makeGraph } from "./fixtures/graph-fixtures";
import type { LiveDataPoint } from "@/lib/types";
import type { TarskiValidationReport } from "@/lib/tarski-data";

const livePoint = (kind: string, source: string): LiveDataPoint => ({
  kind,
  value: 1,
  capacity: 1,
  unit: "",
  observedAt: "2025-04-01T00:00:00.000Z",
  source,
});

describe("copilot context — engine-state snapshot wire-up (#14 follow-up)", () => {
  it("emits an ENGINE STATE SNAPSHOT section before the GRAPH METADATA", () => {
    const graph = makeGraph(
      [makeNode({ id: "a", label: "Node A" })],
      [],
    );
    const ctx = serializeGraphContext(graph, {
      selectedNode: null,
      severedEdges: [],
      shocks: [],
      interventionMode: false,
      interventionTarget: null,
    });
    const snapshotIdx = ctx.indexOf("=== ENGINE STATE SNAPSHOT ===");
    const metadataIdx = ctx.indexOf("=== GRAPH METADATA ===");
    expect(snapshotIdx).toBeGreaterThan(0);
    expect(metadataIdx).toBeGreaterThan(snapshotIdx);
  });

  it("includes feed counts in the snapshot when liveData is attached", () => {
    const graph = makeGraph(
      [
        makeNode({
          id: "a",
          label: "FRED-fed",
          liveData: [livePoint("indicator", "FRED · DFF (period 2025-01)")],
        }),
        makeNode({
          id: "b",
          label: "OFAC-fed",
          liveData: [livePoint("sanctions", "OFAC SDN — Iran:")],
        }),
      ],
      [],
    );
    const ctx = serializeGraphContext(graph, {
      selectedNode: null,
      severedEdges: [],
      shocks: [],
      interventionMode: false,
      interventionTarget: null,
    });
    expect(ctx).toContain("Live feeds:");
    expect(ctx).toContain("indicator (live)");
    expect(ctx).toContain("sanctions (live)");
  });

  it("includes Tarski state in the snapshot when a report is provided", () => {
    const graph = makeGraph(
      [makeNode({ id: "a", label: "A" })],
      [makeEdge({ id: "e1", source: "a", target: "a", weight: 0.5 })],
    );
    const tarskiReport: TarskiValidationReport = {
      inconsistentEdgeIds: new Set(["e1"]),
      restrictedNodeIds: new Set(),
      proofTraces: [
        { edgeId: "e1", violatedAxioms: ["A-04"], verdict: "FLAGGED", solverUsed: "Z3", checkTimeMs: 1 },
      ],
      totalViolations: 1,
    };
    const ctx = serializeGraphContext(graph, {
      selectedNode: null,
      severedEdges: [],
      shocks: [],
      interventionMode: false,
      interventionTarget: null,
      tarskiReport,
    });
    expect(ctx).toContain("Tarski: VERIFIED");
    expect(ctx).toContain("A-04: 1 violation");
  });

  it("includes pillar overlay summary when liveAdjustments are present", () => {
    const graph = makeGraph(
      [
        makeNode({
          id: "a",
          label: "Hub",
          liveAdjustments: { jurisdictionalHazardDelta: 1.2, cascadeLoadDelta: 0.9 },
        }),
      ],
      [],
    );
    const ctx = serializeGraphContext(graph, {
      selectedNode: null,
      severedEdges: [],
      shocks: [],
      interventionMode: false,
      interventionTarget: null,
    });
    expect(ctx).toContain("Pillar overlays");
    expect(ctx).toContain("J-elevated");
    expect(ctx).toContain("C-elevated");
  });

  it("renders cleanly even when nothing is attached (empty engine state)", () => {
    const graph = makeGraph(
      [makeNode({ id: "a", label: "Plain" })],
      [],
    );
    const ctx = serializeGraphContext(graph, {
      selectedNode: null,
      severedEdges: [],
      shocks: [],
      interventionMode: false,
      interventionTarget: null,
    });
    expect(ctx).toContain("Live feeds: none attached");
    expect(ctx).toContain("Tarski: RAW");
  });
});
