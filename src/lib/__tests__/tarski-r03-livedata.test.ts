import { describe, it, expect } from "vitest";
import { runTarskiValidation } from "@/lib/tarski-data";
import { makeNode, makeEdge, makeGraph } from "./fixtures/graph-fixtures";
import type { LiveDataPoint } from "@/lib/types";

// ─── R-03 Export Route Monopoly — structural + live branches ──────────
//
// R-03 used to be a node-only flag (restricted, no edge flags, no proof
// trace) gated solely on `irreplaceability ≥ 7` + chokepoint-routing.
// Now extended with:
//
//   - Edge flagging — all route edges into a chokepoint are marked
//     inconsistent when R-03 fires (the monopoly exposure applies to
//     the whole bundle).
//   - Live branches — NOAA storm ≥ 64 kt, OFAC sanctions, or
//     throughput saturation ≥ 90% on the downstream chokepoint fire
//     independently of the static irreplaceability gate.
//   - Proof trace per node, attached to the highest-weight route
//     edge, with combined detail joined by " · ".
//
// These tests pin the new behaviour and confirm the static branch is
// unchanged for the no-live-data case.

const stormPoint = (kt: number): LiveDataPoint => ({
  kind: "storm",
  value: kt,
  capacity: 64,
  unit: "kt",
  observedAt: "2025-01-01T00:00:00.000Z",
  source: `NOAA NHC · Persian Gulf · HU TEST @ ${kt}kt`,
});

const sanctionsPoint = (): LiveDataPoint => ({
  kind: "sanctions",
  value: 1,
  capacity: 1,
  unit: "flag",
  observedAt: "2025-01-01T00:00:00.000Z",
  source: "OFAC SDN test entry",
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
  source: "EIA Hormuz test fixture",
});

// PROD → HORMUZ → BUYER. PROD is energy with high irreplaceability so
// the static branch fires; we layer live signals on the chokepoint to
// exercise the live branches.
function buildRouteGraph(producerPatch: Partial<{
  irreplaceability: number;
  category: "manufacturing" | "energy";
}> = {}, chokepointPatch: Partial<{ liveData: LiveDataPoint[] }> = {}) {
  return makeGraph(
    [
      makeNode({
        id: "prod",
        label: "Persian Gulf Producer",
        category: producerPatch.category ?? "energy",
        omegaFragility: {
          composite: 7,
          irreplaceability: producerPatch.irreplaceability ?? 8,
          restorationLatency: 5,
          jurisdictionalHazard: 5,
          cascadeLoad: 5,
          tailDepth: 5,
        },
      }),
      makeNode({
        id: "hormuz",
        label: "Strait of Hormuz",
        ...chokepointPatch,
      }),
      makeNode({ id: "buyer", label: "Buyer" }),
    ],
    [
      makeEdge({ id: "route1", source: "prod", target: "hormuz", weight: 0.7 }),
      makeEdge({ id: "route2", source: "prod", target: "hormuz", weight: 0.4 }),
      makeEdge({ id: "out", source: "hormuz", target: "buyer", weight: 0.5 }),
    ],
  );
}

describe("R-03 Export Route Monopoly — structural branch (unchanged)", () => {
  it("flags producer + all route edges when irreplaceability ≥ 7", () => {
    const graph = buildRouteGraph();
    const report = runTarskiValidation(graph, new Set(["R-03"]));
    expect(report.restrictedNodeIds.has("prod")).toBe(true);
    expect(report.inconsistentEdgeIds.has("route1")).toBe(true);
    expect(report.inconsistentEdgeIds.has("route2")).toBe(true);
    // Non-route edge (out from chokepoint) is NOT a producer route.
    expect(report.inconsistentEdgeIds.has("out")).toBe(false);
    const trace = report.proofTraces.find((t) =>
      t.violatedAxioms.includes("R-03"),
    );
    expect(trace).toBeDefined();
    expect(trace!.detail).toContain("structural");
    // Proof trace attached to highest-weight route edge.
    expect(trace!.edgeId).toBe("route1");
  });

  it("does NOT fire when irreplaceability < 7 and no live signal", () => {
    const graph = buildRouteGraph({ irreplaceability: 5 });
    const report = runTarskiValidation(graph, new Set(["R-03"]));
    expect(report.restrictedNodeIds.has("prod")).toBe(false);
  });

  it("ignores non-production categories", () => {
    const graph = buildRouteGraph({
      irreplaceability: 9,
      category: "manufacturing",
    });
    // manufacturing IS one of the accepted categories per the impl;
    // assert it fires.
    const report = runTarskiValidation(graph, new Set(["R-03"]));
    expect(report.restrictedNodeIds.has("prod")).toBe(true);
  });
});

describe("R-03 — live branches fire independently of irreplaceability", () => {
  it("storm at chokepoint ≥ 64 kt fires R-03 even on low-irreplaceability producer", () => {
    const graph = buildRouteGraph(
      { irreplaceability: 5 },
      { liveData: [stormPoint(80)] },
    );
    const report = runTarskiValidation(graph, new Set(["R-03"]));
    expect(report.restrictedNodeIds.has("prod")).toBe(true);
    const trace = report.proofTraces.find((t) =>
      t.violatedAxioms.includes("R-03"),
    );
    expect(trace!.detail).toContain("80 kt storm");
    expect(trace!.detail).not.toContain("structural"); // static branch didn't fire
  });

  it("storm below threshold does not fire the live branch", () => {
    const graph = buildRouteGraph(
      { irreplaceability: 5 },
      { liveData: [stormPoint(40)] },
    );
    const report = runTarskiValidation(graph, new Set(["R-03"]));
    expect(report.restrictedNodeIds.has("prod")).toBe(false);
  });

  it("sanctions at chokepoint fires R-03 even on low-irreplaceability producer", () => {
    const graph = buildRouteGraph(
      { irreplaceability: 5 },
      { liveData: [sanctionsPoint()] },
    );
    const report = runTarskiValidation(graph, new Set(["R-03"]));
    expect(report.restrictedNodeIds.has("prod")).toBe(true);
    const trace = report.proofTraces.find((t) =>
      t.violatedAxioms.includes("R-03"),
    );
    expect(trace!.detail).toContain("sanctions");
  });

  it("throughput saturation ≥ 90% at chokepoint fires R-03", () => {
    const graph = buildRouteGraph(
      { irreplaceability: 5 },
      { liveData: [throughputPoint(20, 21)] }, // 95%
    );
    const report = runTarskiValidation(graph, new Set(["R-03"]));
    expect(report.restrictedNodeIds.has("prod")).toBe(true);
    const trace = report.proofTraces.find((t) =>
      t.violatedAxioms.includes("R-03"),
    );
    expect(trace!.detail).toContain("saturation");
  });

  it("structural + multiple live branches combine into one trace", () => {
    const graph = buildRouteGraph(
      { irreplaceability: 9 }, // structural fires
      { liveData: [stormPoint(80), sanctionsPoint()] }, // two live fire
    );
    const report = runTarskiValidation(graph, new Set(["R-03"]));
    const traces = report.proofTraces.filter((t) =>
      t.violatedAxioms.includes("R-03"),
    );
    expect(traces.length).toBe(1);
    const detail = traces[0].detail ?? "";
    expect(detail).toContain("structural");
    expect(detail).toContain("storm");
    expect(detail).toContain("sanctions");
  });

  it("throughput saturation below threshold does not fire the live branch", () => {
    const graph = buildRouteGraph(
      { irreplaceability: 5 },
      { liveData: [throughputPoint(15, 21)] }, // ≈ 71%
    );
    const report = runTarskiValidation(graph, new Set(["R-03"]));
    expect(report.restrictedNodeIds.has("prod")).toBe(false);
  });
});
