import { describe, it, expect } from "vitest";
import {
  collectEmFxRatios,
  collectMenaFxRatios,
  deriveCapitalRatios,
} from "@/lib/feeds/derivations";
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

describe("collectMenaFxRatios", () => {
  it("collects EGY + ARG depreciation ratios via the WB-pulled FX nodes", () => {
    const nodes = [
      // EGY/PA.NUS.FCRF wires to a node with "Exchange Rate Pressure Index" in
      // its label (per WB_SERIES). value 45 / capacity 50 = 0.9
      makeNode({
        id: "egy",
        label: "Exchange Rate Pressure Index",
        liveData: [{ ...liveIndicator(45, 50, "World Bank · EGY/PA.NUS.FCRF"), unit: "EGP/$" }],
      }),
      // ARG/PA.NUS.FCRF wires to a node with "Argentina FX" in its label.
      // value 915 / capacity 1500 = 0.61
      makeNode({
        id: "arg",
        label: "Argentina FX",
        liveData: [{ ...liveIndicator(915, 1500, "World Bank · ARG/PA.NUS.FCRF"), unit: "ARS/$" }],
      }),
      makeNode({ id: "neutral", label: "Some other node", liveData: [liveIndicator(1, 1)] }),
    ];
    const ratios = collectMenaFxRatios(nodes);
    expect(ratios).toHaveLength(2);
    const egy = ratios.find((r) => r.nodeLabel.includes("Exchange Rate"))!;
    expect(egy.ratio).toBeCloseTo(0.9, 2);
    const arg = ratios.find((r) => r.nodeLabel.includes("Argentina"))!;
    expect(arg.ratio).toBeCloseTo(0.61, 2);
  });
});

describe("deriveCapitalRatios", () => {
  it("computes K/Y + MPK from Capital Stock + Real GDP nodes", () => {
    // Brazil capital formation 364 B$ in $B unit, GDP 2.03 T$ in $T unit
    // K/Y = 364 / 2030 = 0.179
    // MPK = 0.3 / 0.179 = 1.676
    const nodes = [
      makeNode({
        id: "br_cap",
        label: "Brazil Capital Stock",
        liveData: [{ ...liveIndicator(364, 500, "World Bank · BRA/NE.GDI.TOTL.KD"), unit: "$B" }],
      }),
      makeNode({
        id: "br_gdp",
        label: "Brazil Real GDP",
        liveData: [{ ...liveIndicator(2.03, 4, "World Bank · BRA/NY.GDP.MKTP.KD"), unit: "$T" }],
      }),
    ];
    const r = deriveCapitalRatios(nodes, "brazil");
    expect(r).not.toBeNull();
    expect(r!.kRatio).toBeCloseTo(0.179, 2);
    expect(r!.mpk).toBeCloseTo(1.676, 2);
  });

  it("returns null when either primitive is missing", () => {
    const nodes = [
      makeNode({ id: "br_cap", label: "Brazil Capital Stock" }),
    ];
    expect(deriveCapitalRatios(nodes, "brazil")).toBeNull();
  });

  it("returns null when values are non-positive (avoids divide-by-zero)", () => {
    const nodes = [
      makeNode({
        id: "br_cap",
        label: "Brazil Capital Stock",
        liveData: [{ ...liveIndicator(0, 500, "World Bank · BRA/NE.GDI.TOTL.KD"), unit: "$B" }],
      }),
      makeNode({
        id: "br_gdp",
        label: "Brazil Real GDP",
        liveData: [{ ...liveIndicator(2.03, 4, "World Bank · BRA/NY.GDP.MKTP.KD"), unit: "$T" }],
      }),
    ];
    expect(deriveCapitalRatios(nodes, "brazil")).toBeNull();
  });
});

describe("derivationsProvider.matchPayload — Phase 14 composites", () => {
  it("emits K/L Ratio + MPK for Brazil and China when primitives are live", () => {
    const nodes = [
      makeNode({
        id: "tr",
        label: "Turkey FX Stress",
        liveData: [liveIndicator(31.5, 35, "FRED · DEXTUUS")],
      }),
      makeNode({
        id: "br_cap",
        label: "Brazil Capital Stock",
        liveData: [{ ...liveIndicator(364, 500, "World Bank · BRA/NE.GDI.TOTL.KD"), unit: "$B" }],
      }),
      makeNode({
        id: "br_gdp",
        label: "Brazil Real GDP",
        liveData: [{ ...liveIndicator(2.03, 4, "World Bank · BRA/NY.GDP.MKTP.KD"), unit: "$T" }],
      }),
      makeNode({
        id: "cn_cap",
        label: "China Capital Stock",
        liveData: [{ ...liveIndicator(7.24, 10, "World Bank · CHN/NE.GDI.TOTL.KD"), unit: "$T" }],
      }),
      makeNode({
        id: "cn_gdp",
        label: "China Real GDP",
        liveData: [{ ...liveIndicator(18.5, 25, "World Bank · CHN/NY.GDP.MKTP.KD"), unit: "$T" }],
      }),
      makeNode({ id: "br_kl", label: "Brazil K/L Ratio" }),
      makeNode({ id: "cn_kl", label: "China K/L Ratio" }),
      makeNode({ id: "br_mpk", label: "Brazil MPK" }),
      makeNode({ id: "cn_mpk", label: "China MPK" }),
    ];
    const batch = derivationsProvider.matchPayload({ trigger: "now" }, nodes);
    const klBr = batch.updates.find((u) => u.nodeId === "br_kl")!.point;
    expect(klBr.value).toBeCloseTo(0.179, 2);
    expect(klBr.unit).toBe("K/Y");
    const klCn = batch.updates.find((u) => u.nodeId === "cn_kl")!.point;
    expect(klCn.value).toBeCloseTo(0.391, 2);
    const mpkBr = batch.updates.find((u) => u.nodeId === "br_mpk")!.point;
    expect(mpkBr.value).toBeCloseTo(1.676, 2);
    const mpkCn = batch.updates.find((u) => u.nodeId === "cn_mpk")!.point;
    expect(mpkCn.value).toBeCloseTo(0.768, 2);
  });

  it("emits MENA Currency Depreciation when EGY + ARG FX primitives are present", () => {
    const nodes = [
      makeNode({
        id: "egy",
        label: "Exchange Rate Pressure Index",
        liveData: [{ ...liveIndicator(45, 50, "World Bank · EGY/PA.NUS.FCRF"), unit: "EGP/$" }],
      }),
      makeNode({
        id: "arg",
        label: "Argentina FX",
        liveData: [{ ...liveIndicator(915, 1500, "World Bank · ARG/PA.NUS.FCRF"), unit: "ARS/$" }],
      }),
      makeNode({ id: "mena", label: "MENA Currency Depreciation" }),
    ];
    const batch = derivationsProvider.matchPayload({ trigger: "now" }, nodes);
    const mena = batch.updates.find((u) => u.nodeId === "mena")!.point;
    // Mean of 0.9 and 0.61 = 0.755 → 75.5%
    expect(mena.value).toBeCloseTo(75.5, 1);
    expect(mena.source).toContain("mean MENA FX depreciation");
  });

  it("emits NY Fed Consumer Inflation Expectations as proxy from UMich", () => {
    const nodes = [
      makeNode({
        id: "umich",
        label: "UMich Consumer Inflation Expectations",
        liveData: [{ ...liveIndicator(3.5, 5, "FRED · MICH"), unit: "%" }],
      }),
      makeNode({ id: "nyfed", label: "NY Fed Consumer Inflation Expectations" }),
    ];
    const batch = derivationsProvider.matchPayload({ trigger: "now" }, nodes);
    const nyfed = batch.updates.find((u) => u.nodeId === "nyfed")!.point;
    expect(nyfed.value).toBe(3.5);
    expect(nyfed.source).toContain("UMich Consumer Inflation Expectations (proxy");
    expect(nyfed.source).toContain("r≈0.85");
  });

  it("emits CB Policy Rate Regime as pass-through from live Fed Funds Target Range", () => {
    const nodes = [
      makeNode({
        id: "fed_target",
        label: "Fed Funds Target Range",
        liveData: [{ ...liveIndicator(5.5, 6, "FRED · DFEDTARU"), unit: "%" }],
      }),
      makeNode({ id: "cb_policy", label: "CB Policy Rate Regime" }),
    ];
    const batch = derivationsProvider.matchPayload({ trigger: "now" }, nodes);
    const cb = batch.updates.find((u) => u.nodeId === "cb_policy")!.point;
    expect(cb.value).toBe(5.5);
    expect(cb.unit).toBe("%");
    expect(cb.source).toContain("US Fed Funds Target Range (global anchor for EM CB policy)");
  });

  it("does not emit K/L or MPK when capital + GDP primitives are missing", () => {
    const nodes = [
      makeNode({ id: "br_kl", label: "Brazil K/L Ratio" }),
      makeNode({ id: "cn_mpk", label: "China MPK" }),
    ];
    const batch = derivationsProvider.matchPayload({ trigger: "now" }, nodes);
    expect(batch.updates.find((u) => u.nodeId === "br_kl")).toBeUndefined();
    expect(batch.updates.find((u) => u.nodeId === "cn_mpk")).toBeUndefined();
  });
});
