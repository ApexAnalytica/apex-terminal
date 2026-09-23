import { describe, it, expect } from "vitest";
import { runTarskiValidation } from "@/lib/tarski-data";
import { makeNode, makeEdge, makeGraph } from "./fixtures/graph-fixtures";
import type { LiveDataPoint } from "@/lib/types";

// ─── T1D axiom validators — TA-01, TA-02, TR-02 ───────────────────────
//
// The T1D axiom library has been declared end-to-end (names, formulas,
// descriptions, profile gates) but no validators were wired. These
// tests pin the first three:
//
//   TA-01: Glycemic Viability — glucose ∈ [40, 600] mg/dL
//   TA-02: Insulin Non-Negativity — any insulin* kind ≥ 0
//   TR-02: CGM Time-in-Range — TIR>=70% AND TBR<54<=1% over ≥14 readings
//
// All three read live signals from node.liveData[] using the canonical
// kinds (cgm_glucose_mgdl, insulin_*). Profile-gating is delegated to
// the existing profileAllows() filter at the top of runTarskiValidation.

const glucosePoint = (
  value: number,
  history?: { value: number; observedAt: string }[],
): LiveDataPoint => ({
  kind: "cgm_glucose_mgdl",
  value,
  capacity: 600,
  unit: "mg/dL",
  observedAt: "2026-05-30T00:00:00.000Z",
  source: "CGM test feed",
  history,
});

const insulinPoint = (kind: string, value: number): LiveDataPoint => ({
  kind,
  value,
  capacity: 100,
  unit: "U",
  observedAt: "2026-05-30T00:00:00.000Z",
  source: "Insulin pump test feed",
});

function buildHistory(values: number[]): {
  value: number;
  observedAt: string;
}[] {
  return values.map((v, i) => ({
    value: v,
    observedAt: `2026-05-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
  }));
}

describe("TA-01 Glycemic Viability Bounds", () => {
  it("flags a node with glucose < 40 mg/dL (severe hypo)", () => {
    const a = makeNode({
      id: "patient-a",
      label: "Patient A",
      liveData: [glucosePoint(35)],
    });
    const b = makeNode({ id: "patient-b" });
    const graph = makeGraph(
      [a, b],
      [makeEdge({ id: "e1", source: "patient-a", target: "patient-b" })],
    );
    const report = runTarskiValidation(graph, new Set(["TA-01"]), "t1d");
    expect(report.restrictedNodeIds).toContain("patient-a");
    expect(report.inconsistentEdgeIds).toContain("e1");
    const trace = report.proofTraces.find((t) => t.edgeId === "e1");
    expect(trace?.violatedAxioms).toContain("TA-01");
    expect(trace?.detail).toContain("hypo");
    expect(trace?.detail).toContain("35");
  });

  it("flags a node with glucose > 600 mg/dL (severe hyper)", () => {
    const a = makeNode({
      id: "patient-a",
      liveData: [glucosePoint(750)],
    });
    const b = makeNode({ id: "patient-b" });
    const graph = makeGraph(
      [a, b],
      [makeEdge({ id: "e1", source: "patient-a", target: "patient-b" })],
    );
    const report = runTarskiValidation(graph, new Set(["TA-01"]), "t1d");
    expect(report.restrictedNodeIds).toContain("patient-a");
    const trace = report.proofTraces.find((t) => t.edgeId === "e1");
    expect(trace?.detail).toContain("hyper");
  });

  it("does NOT flag a node with glucose inside [40, 600]", () => {
    const a = makeNode({
      id: "patient-a",
      liveData: [glucosePoint(120)],
    });
    const b = makeNode({ id: "patient-b" });
    const graph = makeGraph(
      [a, b],
      [makeEdge({ id: "e1", source: "patient-a", target: "patient-b" })],
    );
    const report = runTarskiValidation(graph, new Set(["TA-01"]), "t1d");
    expect(report.restrictedNodeIds).not.toContain("patient-a");
    expect(report.inconsistentEdgeIds).not.toContain("e1");
  });

  it("is profile-gated: does NOT fire on geopolitical session", () => {
    const a = makeNode({
      id: "patient-a",
      liveData: [glucosePoint(35)], // would fire under t1d
    });
    const b = makeNode({ id: "patient-b" });
    const graph = makeGraph(
      [a, b],
      [makeEdge({ id: "e1", source: "patient-a", target: "patient-b" })],
    );
    // Geopolitical profile filters TA-01 out of the enabled set.
    const report = runTarskiValidation(graph, new Set(["TA-01"]), "geopolitical");
    expect(report.restrictedNodeIds).not.toContain("patient-a");
  });

  it("does nothing when the node carries no glucose signal", () => {
    const a = makeNode({ id: "patient-a" });
    const b = makeNode({ id: "patient-b" });
    const graph = makeGraph(
      [a, b],
      [makeEdge({ id: "e1", source: "patient-a", target: "patient-b" })],
    );
    const report = runTarskiValidation(graph, new Set(["TA-01"]), "t1d");
    expect(report.restrictedNodeIds).not.toContain("patient-a");
  });
});

describe("TA-02 Insulin Non-Negativity", () => {
  it("flags REJECTED on negative insulin_fast_units", () => {
    const a = makeNode({
      id: "patient-a",
      liveData: [insulinPoint("insulin_fast_units", -2.5)],
    });
    const b = makeNode({ id: "patient-b" });
    const graph = makeGraph(
      [a, b],
      [makeEdge({ id: "e1", source: "patient-a", target: "patient-b" })],
    );
    const report = runTarskiValidation(graph, new Set(["TA-02"]), "t1d");
    expect(report.restrictedNodeIds).toContain("patient-a");
    const trace = report.proofTraces.find((t) => t.edgeId === "e1");
    expect(trace?.violatedAxioms).toContain("TA-02");
    expect(trace?.verdict).toBe("REJECTED");
    expect(trace?.detail).toContain("insulin_fast_units");
    expect(trace?.detail).toContain("-2.50");
  });

  it("catches any insulin* kind (insulin_slow_units, insulin_units)", () => {
    const a = makeNode({
      id: "patient-a",
      liveData: [insulinPoint("insulin_slow_units", -0.5)],
    });
    const b = makeNode({ id: "patient-b" });
    const graph = makeGraph(
      [a, b],
      [makeEdge({ id: "e1", source: "patient-a", target: "patient-b" })],
    );
    const report = runTarskiValidation(graph, new Set(["TA-02"]), "t1d");
    expect(report.restrictedNodeIds).toContain("patient-a");
  });

  it("does NOT fire for insulin ≥ 0", () => {
    const a = makeNode({
      id: "patient-a",
      liveData: [
        insulinPoint("insulin_fast_units", 0),
        insulinPoint("insulin_slow_units", 1.5),
      ],
    });
    const b = makeNode({ id: "patient-b" });
    const graph = makeGraph(
      [a, b],
      [makeEdge({ id: "e1", source: "patient-a", target: "patient-b" })],
    );
    const report = runTarskiValidation(graph, new Set(["TA-02"]), "t1d");
    expect(report.restrictedNodeIds).not.toContain("patient-a");
  });
});

describe("TR-02 CGM Time-in-Range Consensus", () => {
  it("flags a node with TIR < 70% over the consensus window", () => {
    // 20 readings: 10 below range, 5 in-range, 5 above → TIR = 25%
    const history = buildHistory([
      50, 55, 60, 50, 65, 55, 60, 50, 65, 55,
      100, 120, 140, 160, 170, // in-range
      200, 220, 250, 200, 240, // above
    ]);
    const a = makeNode({
      id: "patient-a",
      liveData: [glucosePoint(220, history)],
    });
    const b = makeNode({ id: "patient-b" });
    const graph = makeGraph(
      [a, b],
      [makeEdge({ id: "e1", source: "patient-a", target: "patient-b" })],
    );
    const report = runTarskiValidation(graph, new Set(["TR-02"]), "t1d");
    expect(report.restrictedNodeIds).toContain("patient-a");
    const trace = report.proofTraces.find((t) => t.edgeId === "e1");
    expect(trace?.violatedAxioms).toContain("TR-02");
    expect(trace?.detail).toContain("TIR");
    expect(trace?.detail).toMatch(/< 70%/);
  });

  it("flags TBR<54 > 1% even when TIR passes", () => {
    // 20 readings: 16 in-range (80% TIR), 3 below 54 → TBR<54 = 15%
    const history = buildHistory([
      100, 110, 120, 130, 140, 150, 160, 170, 100, 110,
      120, 130, 140, 150, 160, 170, // 16 in-range
      45, 40, 50, // below 54
      120, // padding to round out the window with one more in-range
    ]);
    const a = makeNode({
      id: "patient-a",
      liveData: [glucosePoint(120, history)],
    });
    const b = makeNode({ id: "patient-b" });
    const graph = makeGraph(
      [a, b],
      [makeEdge({ id: "e1", source: "patient-a", target: "patient-b" })],
    );
    const report = runTarskiValidation(graph, new Set(["TR-02"]), "t1d");
    expect(report.restrictedNodeIds).toContain("patient-a");
    const trace = report.proofTraces.find((t) => t.edgeId === "e1");
    expect(trace?.detail).toContain("TBR<54");
  });

  it("does NOT flag when both TIR ≥ 70% and TBR<54 ≤ 1%", () => {
    // 14 readings all in-range
    const history = buildHistory(Array(14).fill(120));
    const a = makeNode({
      id: "patient-a",
      liveData: [glucosePoint(120, history.slice(0, 13))], // current + 13 history = 14 total
    });
    const b = makeNode({ id: "patient-b" });
    const graph = makeGraph(
      [a, b],
      [makeEdge({ id: "e1", source: "patient-a", target: "patient-b" })],
    );
    const report = runTarskiValidation(graph, new Set(["TR-02"]), "t1d");
    expect(report.restrictedNodeIds).not.toContain("patient-a");
  });

  it("does nothing on a window smaller than 14 readings (insufficient data)", () => {
    const history = buildHistory([50, 55, 60]); // way too few, all hypo
    const a = makeNode({
      id: "patient-a",
      liveData: [glucosePoint(50, history)],
    });
    const b = makeNode({ id: "patient-b" });
    const graph = makeGraph(
      [a, b],
      [makeEdge({ id: "e1", source: "patient-a", target: "patient-b" })],
    );
    const report = runTarskiValidation(graph, new Set(["TR-02"]), "t1d");
    expect(report.restrictedNodeIds).not.toContain("patient-a");
  });
});
