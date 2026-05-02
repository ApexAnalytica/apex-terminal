import { describe, it, expect } from "vitest";
import { collectEmFxRatios } from "@/lib/feeds/derivations";
import { derivationsProvider } from "@/lib/feeds/providers/derivations";
import { makeNode } from "../fixtures/graph-fixtures";
import type { LiveDataPoint } from "@/lib/types";

const liveIndicator = (value: number, capacity: number, source = "FRED · DEXTUUS"): LiveDataPoint => ({
  kind: "indicator",
  value,
  capacity,
  unit: "TRY/$",
  observedAt: "2025-01-15T00:00:00.000Z",
  source,
});

describe("collectEmFxRatios", () => {
  it("collects value/capacity ratios from EM FX nodes", () => {
    const nodes = [
      makeNode({ id: "tr", label: "Turkey FX Stress", liveData: [liveIndicator(31.5, 35, "FRED · DEXTUUS")] }),
      makeNode({ id: "za", label: "South Africa FX Stress", liveData: [liveIndicator(18.5, 22, "FRED · DEXSFUS")] }),
      makeNode({ id: "br", label: "Brazil FX Stress", liveData: [liveIndicator(5.05, 6, "FRED · DEXBZUS")] }),
      makeNode({ id: "neutral", label: "Some other node", liveData: [liveIndicator(1, 1)] }),
    ];
    const ratios = collectEmFxRatios(nodes);
    expect(ratios).toHaveLength(3);
    expect(ratios.map((r) => r.nodeLabel).sort()).toEqual([
      "Brazil FX Stress",
      "South Africa FX Stress",
      "Turkey FX Stress",
    ]);
    // 31.5/35 = 0.9
    const tr = ratios.find((r) => r.nodeLabel.includes("Turkey"))!;
    expect(tr.ratio).toBeCloseTo(0.9, 2);
  });

  it("flags mock-tagged sources", () => {
    const nodes = [
      makeNode({
        id: "tr",
        label: "Turkey FX Stress",
        liveData: [liveIndicator(31.5, 35, "FRED · DEXTUUS (mock — FRED_API_KEY unset)")],
      }),
    ];
    const ratios = collectEmFxRatios(nodes);
    expect(ratios[0].mockTagged).toBe(true);
  });

  it("skips nodes without live indicator data", () => {
    const nodes = [
      makeNode({ id: "tr", label: "Turkey FX Stress" }),
    ];
    expect(collectEmFxRatios(nodes)).toHaveLength(0);
  });

  it("skips entries with capacity <= 0 (avoids divide-by-zero)", () => {
    const nodes = [
      makeNode({
        id: "tr",
        label: "Turkey FX Stress",
        liveData: [liveIndicator(31.5, 0)],
      }),
    ];
    expect(collectEmFxRatios(nodes)).toHaveLength(0);
  });
});

describe("derivationsProvider.matchPayload", () => {
  it("emits Currency Contagion (mean) and Exchange Rate Pressure (max) from EM FX primitives", () => {
    const nodes = [
      makeNode({ id: "tr", label: "Turkey FX Stress", liveData: [liveIndicator(31.5, 35, "FRED · DEXTUUS")] }), // 0.9
      makeNode({ id: "za", label: "South Africa FX Stress", liveData: [liveIndicator(11, 22, "FRED · DEXSFUS")] }), // 0.5
      makeNode({ id: "br", label: "Brazil FX Stress", liveData: [liveIndicator(3, 6, "FRED · DEXBZUS")] }), // 0.5
      makeNode({ id: "cc", label: "Currency Contagion Channel" }),
      makeNode({ id: "erp", label: "Exchange Rate Pressure Index" }),
    ];
    const batch = derivationsProvider.matchPayload({ trigger: "now" }, nodes);

    expect(batch.providerId).toBe("derivations");
    expect(batch.signalKinds).toEqual(["indicator"]);
    expect(batch.updates).toHaveLength(2);

    const cc = batch.updates.find((u) => u.nodeId === "cc")!.point;
    // mean of (0.9, 0.5, 0.5) = 0.633 → 63.3%
    expect(cc.value).toBeCloseTo(63.3, 1);
    expect(cc.unit).toBe("%");

    const erp = batch.updates.find((u) => u.nodeId === "erp")!.point;
    // max of (0.9, 0.5, 0.5) = 0.9 → 90.0%
    expect(erp.value).toBeCloseTo(90.0, 1);

    expect(cc.source).toContain("Derived");
    expect(cc.source).toContain("mean EM FX stress");
  });

  it("emits empty batch when no primitives have ticked yet", () => {
    const nodes = [
      makeNode({ id: "cc", label: "Currency Contagion Channel" }),
      makeNode({ id: "erp", label: "Exchange Rate Pressure Index" }),
    ];
    const batch = derivationsProvider.matchPayload({ trigger: "now" }, nodes);
    expect(batch.updates).toHaveLength(0);
    expect(batch.event).toBeUndefined();
  });

  it("skips composite nodes that aren't in the graph", () => {
    const nodes = [
      makeNode({ id: "tr", label: "Turkey FX Stress", liveData: [liveIndicator(31.5, 35, "FRED · DEXTUUS")] }),
      // No Currency Contagion or Exchange Rate Pressure node present
    ];
    const batch = derivationsProvider.matchPayload({ trigger: "now" }, nodes);
    expect(batch.updates).toHaveLength(0);
  });

  it("flags the source string when all primitives are mock", () => {
    const nodes = [
      makeNode({
        id: "tr",
        label: "Turkey FX Stress",
        liveData: [liveIndicator(31.5, 35, "FRED · DEXTUUS (mock — FRED_API_KEY unset)")],
      }),
      makeNode({ id: "cc", label: "Currency Contagion Channel" }),
    ];
    const batch = derivationsProvider.matchPayload({ trigger: "now" }, nodes);
    expect(batch.updates[0].point.source).toContain("mock — primitives are mocked");
  });
});
