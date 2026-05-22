import { describe, it, expect } from "vitest";
import {
  WB_SERIES,
  buildWbSeriesUrl,
  mockWorldBankFeed,
  parseWbSeriesResponse,
} from "@/lib/feeds/world-bank";
import { worldBankProvider } from "@/lib/feeds/providers/world-bank";
import { makeNode } from "../fixtures/graph-fixtures";

describe("buildWbSeriesUrl", () => {
  it("builds the expected WB v2 URL", () => {
    const url = buildWbSeriesUrl("CHN", "NY.GDP.MKTP.KD");
    expect(url).toContain("api.worldbank.org/v2/country/CHN/indicator/NY.GDP.MKTP.KD");
    expect(url).toContain("format=json");
    expect(url).toContain("per_page=20");
  });
});

describe("parseWbSeriesResponse", () => {
  const config = WB_SERIES.find(
    (s) => s.country === "CHN" && s.indicator === "NY.GDP.MKTP.KD",
  )!;

  it("parses the [pagination, observations] tuple shape", () => {
    const raw = [
      { page: 1, pages: 1 },
      [{ date: "2024", value: 17795130000000 }],
    ];
    const obs = parseWbSeriesResponse(raw, config);
    expect(obs).not.toBeNull();
    expect(obs!.value).toBeCloseTo(17.8, 1);
    expect(obs!.unit).toBe("$T");
    expect(obs!.observedAt.startsWith("2024")).toBe(true);
    expect(obs!.source).toBe("World Bank · CHN/NY.GDP.MKTP.KD (period 2024)");
  });

  it("skips null observations and picks the first non-null", () => {
    const raw = [
      {},
      [
        { date: "2024", value: null },
        { date: "2023", value: 17000000000000 },
      ],
    ];
    const obs = parseWbSeriesResponse(raw, config);
    expect(obs!.observedAt.startsWith("2023")).toBe(true);
    expect(obs!.value).toBeCloseTo(17, 0);
  });

  it("hydrates a history array from a multi-year response (chronological order)", () => {
    const raw = [
      {},
      [
        { date: "2024", value: 17800000000000 },
        { date: "2023", value: 17500000000000 },
        { date: "2022", value: 17000000000000 },
      ],
    ];
    const obs = parseWbSeriesResponse(raw, config);
    expect(obs!.value).toBeCloseTo(17.8, 1);
    expect(obs!.history).toHaveLength(2);
    // Chronological: oldest first
    expect(obs!.history![0].observedAt.startsWith("2022")).toBe(true);
    expect(obs!.history![0].value).toBeCloseTo(17, 0);
    expect(obs!.history![1].observedAt.startsWith("2023")).toBe(true);
  });

  it("returns null when the tuple shape is wrong", () => {
    expect(parseWbSeriesResponse({ observations: [] }, config)).toBeNull();
    expect(parseWbSeriesResponse([], config)).toBeNull();
    expect(parseWbSeriesResponse(null, config)).toBeNull();
  });

  it("returns null when no observation has a value", () => {
    expect(parseWbSeriesResponse([{}, [{ date: "2024", value: null }]], config)).toBeNull();
  });
});

describe("mockWorldBankFeed", () => {
  it("emits one observation per WB_SERIES entry, all tagged (mock)", () => {
    const feed = mockWorldBankFeed();
    expect(feed.observations).toHaveLength(WB_SERIES.length);
    for (const obs of feed.observations) {
      expect(obs.source).toContain("(mock");
    }
  });

  it("(country, indicator) tuples are unique", () => {
    const seen = new Set<string>();
    for (const s of WB_SERIES) {
      const key = `${s.country}/${s.indicator}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("includes the Phase 8 MENA Import Dependency entry (MEA region)", () => {
    const mena = WB_SERIES.find(
      (s) => s.country === "MEA" && s.indicator === "NE.IMP.GNFS.ZS",
    );
    expect(mena).toBeDefined();
    expect(mena!.labelPatterns).toContain("mena import dependency");
    expect(mena!.unit).toBe("%");
  });

  // Regression: WGI Rule of Law entries (CHN/RL.EST + BRA/RL.EST) were
  // removed 2026-05-22 after WB retired the entire WGI dataset from their
  // v2 API ("The indicator was not found. It may have been deleted or
  // archived." returned for all 6 WGI codes). The `kind` discriminator on
  // WbSeriesConfig is retained for future re-wiring if a non-WB
  // governance source ever lands.
  it("does NOT include the deprecated WGI Rule of Law series", () => {
    const cnRol = WB_SERIES.find(
      (s) => s.country === "CHN" && s.indicator === "RL.EST",
    );
    const brRol = WB_SERIES.find(
      (s) => s.country === "BRA" && s.indicator === "RL.EST",
    );
    expect(cnRol).toBeUndefined();
    expect(brRol).toBeUndefined();
  });
});

describe("worldBankProvider.matchPayload", () => {
  it("attaches an indicator signal to nodes whose label matches", () => {
    const nodes = [
      makeNode({ id: "c_gdp", label: "China Real GDP" }),
      makeNode({ id: "b_gdp", label: "Brazil Real GDP" }),
      makeNode({ id: "neutral", label: "Some Neutral Asset" }),
    ];
    const feed = mockWorldBankFeed();
    const batch = worldBankProvider.matchPayload(feed, nodes);

    expect(batch.providerId).toBe("world-bank");
    expect(batch.signalKinds).toContain("indicator");
    const matchedIds = batch.updates.map((u) => u.nodeId).sort();
    expect(matchedIds).toContain("c_gdp");
    expect(matchedIds).toContain("b_gdp");
    expect(matchedIds).not.toContain("neutral");
  });

  it("emits no event when no nodes match", () => {
    const feed = mockWorldBankFeed();
    const batch = worldBankProvider.matchPayload(feed, [makeNode({ id: "x", label: "Generic" })]);
    expect(batch.updates).toHaveLength(0);
    expect(batch.event).toBeUndefined();
  });

  it("fans one observation out to every label-pattern match", () => {
    // Regression: before the matcher fix, `nodes.find(...)` returned the
    // first label-pattern match and silently dropped subsequent ones.
    // The 4 fertilizer-market nodes (qf_/mn_ India + Brazil) need
    // one (country, indicator) observation to drive multiple downstream
    // nodes — this asserts the fan-out works.
    const nodes = [
      makeNode({ id: "qf_india_fertilizer_market", label: "India fertilizer import market" }),
      makeNode({ id: "mn_india_fertilizer_market", label: "India fertilizer market" }),
      makeNode({ id: "qf_brazil_fertilizer_market", label: "Brazil fertilizer import market" }),
      makeNode({ id: "mn_brazil_fertilizer_market", label: "Brazil fertilizer market" }),
      makeNode({ id: "qf_australia_fertilizer_market", label: "Australia fertilizer customer market" }),
      makeNode({ id: "qf_usa_fertilizer_market", label: "United States fertilizer customer market" }),
    ];
    const feed = mockWorldBankFeed();
    const batch = worldBankProvider.matchPayload(feed, nodes);
    const matchedIds = batch.updates.map((u) => u.nodeId).sort();

    // The single IND/AG.CON.FERT.ZS observation should hit BOTH India nodes.
    expect(matchedIds).toContain("qf_india_fertilizer_market");
    expect(matchedIds).toContain("mn_india_fertilizer_market");
    // Same for the single BRA/AG.CON.FERT.ZS observation.
    expect(matchedIds).toContain("qf_brazil_fertilizer_market");
    expect(matchedIds).toContain("mn_brazil_fertilizer_market");
    // Australia / USA labels (with "customer market") must NOT collide.
    expect(matchedIds).not.toContain("qf_australia_fertilizer_market");
    expect(matchedIds).not.toContain("qf_usa_fertilizer_market");
  });
});
