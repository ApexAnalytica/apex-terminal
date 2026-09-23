import { describe, it, expect } from "vitest";
import { runTarskiValidation } from "@/lib/tarski-data";
import { makeNode, makeEdge, makeGraph } from "./fixtures/graph-fixtures";
import type { LiveDataPoint } from "@/lib/types";

// ─── A-02 Flow Conservation — live capacity-saturation branch ─────────
//
// A-02 has two branches that fire independently and both contribute
// flags:
//
//   (1) Structural — outbound edge-weight sum > 1.5 × inbound sum,
//       with ≥ 3 outbound edges. Always evaluated.
//
//   (2) Live capacity saturation — when a node carries a "production"
//       or "throughput" live signal where value / capacity ≥ 0.9,
//       physical capacity is exhausted and declared outbound flow
//       can't be sustained under added demand. Evaluated when live
//       data is attached.
//
// These tests pin the live-saturation branch.

const productionPoint = (
  value: number,
  capacity = 12,
): LiveDataPoint => ({
  kind: "production",
  value,
  capacity,
  unit: "mb/d",
  observedAt: "2025-01-01T00:00:00.000Z",
  source: "EIA test fixture",
});

const throughputPoint = (
  value: number,
  capacity = 21,
): LiveDataPoint => ({
  kind: "throughput",
  value,
  capacity,
  unit: "mb/d",
  observedAt: "2025-01-01T00:00:00.000Z",
  source: "EIA test fixture",
});

// Two-edge graph where the "producer" node is the candidate. Low edge
// weights keep the structural branch inactive so the test cleanly
// isolates the live-saturation branch.
function buildProducerGraph(producerPatch: Partial<{ liveData: LiveDataPoint[] }>) {
  return makeGraph(
    [
      makeNode({ id: "upstream", label: "Upstream" }),
      makeNode({ id: "producer", label: "Saudi Crude", ...producerPatch }),
      makeNode({ id: "buyer1", label: "Refinery A" }),
      makeNode({ id: "buyer2", label: "Refinery B" }),
    ],
    [
      makeEdge({ id: "e0", source: "upstream", target: "producer", weight: 0.6 }),
      makeEdge({ id: "e1", source: "producer", target: "buyer1", weight: 0.4 }),
      makeEdge({ id: "e2", source: "producer", target: "buyer2", weight: 0.3 }),
    ],
  );
}

describe("A-02 Flow Conservation — live capacity-saturation branch", () => {
  it("does NOT flag when production ratio is below 0.9", () => {
    // 9/12 = 0.75 — below threshold.
    const graph = buildProducerGraph({ liveData: [productionPoint(9, 12)] });
    const report = runTarskiValidation(graph, new Set(["A-02"]));
    expect(report.restrictedNodeIds.has("producer")).toBe(false);
  });

  it("flags when production ratio reaches 0.9", () => {
    // 11/12 = 0.917 — above threshold.
    const graph = buildProducerGraph({ liveData: [productionPoint(11, 12)] });
    const report = runTarskiValidation(graph, new Set(["A-02"]));
    expect(report.restrictedNodeIds.has("producer")).toBe(true);
    const trace = report.proofTraces.find((t) =>
      t.violatedAxioms.includes("A-02"),
    );
    expect(trace).toBeDefined();
    expect(trace!.detail).toContain("saturation");
    expect(trace!.detail).toContain("EIA test fixture");
  });

  it("flags on throughput signal as well as production", () => {
    // 20/21 ≈ 0.95
    const graph = buildProducerGraph({ liveData: [throughputPoint(20, 21)] });
    const report = runTarskiValidation(graph, new Set(["A-02"]));
    expect(report.restrictedNodeIds.has("producer")).toBe(true);
  });

  it("flags the highest-weight outbound edge", () => {
    const graph = buildProducerGraph({ liveData: [productionPoint(11, 12)] });
    const report = runTarskiValidation(graph, new Set(["A-02"]));
    // e1 has weight 0.4, e2 has weight 0.3 — highest is e1.
    expect(report.inconsistentEdgeIds.has("e1")).toBe(true);
    expect(report.inconsistentEdgeIds.has("e2")).toBe(false);
  });

  it("structural branch still fires independently of liveData", () => {
    // No live signal — structural branch alone with totalOut > 1.5 × totalIn.
    const graph = makeGraph(
      [
        makeNode({ id: "n0" }),
        makeNode({ id: "src" }),
        makeNode({ id: "t1" }),
        makeNode({ id: "t2" }),
        makeNode({ id: "t3" }),
      ],
      [
        makeEdge({ id: "in0", source: "n0", target: "src", weight: 0.3 }),
        makeEdge({ id: "o1", source: "src", target: "t1", weight: 0.6 }),
        makeEdge({ id: "o2", source: "src", target: "t2", weight: 0.5 }),
        makeEdge({ id: "o3", source: "src", target: "t3", weight: 0.4 }),
      ],
    );
    const report = runTarskiValidation(graph, new Set(["A-02"]));
    expect(report.restrictedNodeIds.has("src")).toBe(true);
    const trace = report.proofTraces.find((t) =>
      t.violatedAxioms.includes("A-02"),
    );
    expect(trace).toBeDefined();
    expect(trace!.detail).toContain("structural");
  });

  it("both branches fire together — combined detail on one trace", () => {
    // Structural-imbalanced graph AND live saturation present. Because
    // the per-edge trace de-dup step at the end of runTarskiValidation
    // merges by edgeId, A-02 emits one combined trace per node with
    // both detail parts joined.
    const graph = makeGraph(
      [
        makeNode({ id: "n0" }),
        makeNode({
          id: "src",
          liveData: [productionPoint(11, 12)],
        }),
        makeNode({ id: "t1" }),
        makeNode({ id: "t2" }),
        makeNode({ id: "t3" }),
      ],
      [
        makeEdge({ id: "in0", source: "n0", target: "src", weight: 0.3 }),
        makeEdge({ id: "o1", source: "src", target: "t1", weight: 0.6 }),
        makeEdge({ id: "o2", source: "src", target: "t2", weight: 0.5 }),
        makeEdge({ id: "o3", source: "src", target: "t3", weight: 0.4 }),
      ],
    );
    const report = runTarskiValidation(graph, new Set(["A-02"]));
    const a02Traces = report.proofTraces.filter((t) =>
      t.violatedAxioms.includes("A-02"),
    );
    expect(a02Traces.length).toBe(1);
    expect(a02Traces[0].detail).toContain("structural");
    expect(a02Traces[0].detail).toContain("saturation");
  });

  it("handles zero capacity gracefully (no flag, no crash)", () => {
    const bad: LiveDataPoint = {
      kind: "production",
      value: 5,
      capacity: 0,
      unit: "mb/d",
      observedAt: "2025-01-01T00:00:00.000Z",
      source: "bad fixture",
    };
    const graph = buildProducerGraph({ liveData: [bad] });
    const report = runTarskiValidation(graph, new Set(["A-02"]));
    expect(report.restrictedNodeIds.has("producer")).toBe(false);
  });
});
