import { describe, it, expect } from "vitest";
import {
  FRED_SERIES,
  buildFredSeriesUrl,
  mockFredFeed,
  parseFredSeriesResponse,
} from "@/lib/feeds/fred";
import { fredProvider } from "@/lib/feeds/providers/fred";
import { makeNode } from "../fixtures/graph-fixtures";

describe("buildFredSeriesUrl", () => {
  it("builds a properly-encoded FRED v1 URL", () => {
    const url = buildFredSeriesUrl("DFF", "test-key");
    expect(url).toContain("api.stlouisfed.org/fred/series/observations");
    expect(url).toContain("series_id=DFF");
    expect(url).toContain("api_key=test-key");
    expect(url).toContain("file_type=json");
    expect(url).toContain("limit=24");
    expect(url).toContain("sort_order=desc");
  });

  it("includes the units parameter for percent-change transforms", () => {
    const url = buildFredSeriesUrl("CPIAUCSL", "k", "pc1");
    expect(url).toContain("units=pc1");
  });
});

describe("parseFredSeriesResponse", () => {
  const config = FRED_SERIES.find((s) => s.id === "DFF")!;

  it("parses the latest observation into a numeric value with ISO observedAt", () => {
    const raw = { observations: [{ date: "2025-04-15", value: "5.33" }] };
    const obs = parseFredSeriesResponse(raw, config);
    expect(obs).not.toBeNull();
    expect(obs!.value).toBe(5.33);
    expect(obs!.unit).toBe("%");
    expect(obs!.capacity).toBe(6);
    expect(obs!.observedAt.startsWith("2025-04-15")).toBe(true);
    expect(obs!.source).toBe("FRED · DFF (period 2025-04-15)");
    // Single observation → no history
    expect(obs!.history).toBeUndefined();
  });

  it("hydrates a history array from a multi-observation response (chronological order)", () => {
    // FRED returns sort_order=desc, so newest first
    const raw = {
      observations: [
        { date: "2025-04-15", value: "5.33" },
        { date: "2025-03-15", value: "5.30" },
        { date: "2025-02-15", value: "5.27" },
      ],
    };
    const obs = parseFredSeriesResponse(raw, config);
    expect(obs!.value).toBe(5.33); // latest is current
    expect(obs!.history).toHaveLength(2);
    // History is chronological (oldest first)
    expect(obs!.history![0].value).toBe(5.27);
    expect(obs!.history![0].observedAt.startsWith("2025-02-15")).toBe(true);
    expect(obs!.history![1].value).toBe(5.30);
    expect(obs!.history![1].observedAt.startsWith("2025-03-15")).toBe(true);
  });

  it("skips '.' missing-value sentinels in the history range", () => {
    const raw = {
      observations: [
        { date: "2025-04-15", value: "5.33" },
        { date: "2025-03-15", value: "." },
        { date: "2025-02-15", value: "5.27" },
      ],
    };
    const obs = parseFredSeriesResponse(raw, config);
    expect(obs!.history).toHaveLength(1);
    expect(obs!.history![0].value).toBe(5.27);
  });

  it("returns null for missing-value sentinel '.'", () => {
    expect(parseFredSeriesResponse({ observations: [{ date: "2025-04-15", value: "." }] }, config)).toBeNull();
  });

  it("returns null when the response has no observations", () => {
    expect(parseFredSeriesResponse({ observations: [] }, config)).toBeNull();
    expect(parseFredSeriesResponse({}, config)).toBeNull();
  });

  it("returns null for non-finite values", () => {
    expect(parseFredSeriesResponse({ observations: [{ date: "2025-04-15", value: "NaN" }] }, config)).toBeNull();
  });
});

describe("mockFredFeed", () => {
  it("emits one observation per registered series, all tagged (mock)", () => {
    const feed = mockFredFeed();
    expect(feed.observations).toHaveLength(FRED_SERIES.length);
    for (const obs of feed.observations) {
      expect(obs.source).toContain("(mock");
    }
  });

  it("transform-aware routing keys are unique", () => {
    // Two FRED entries can intentionally share an `id` when they pull
    // the same series with different `units` transforms (e.g. PAYEMS
    // as level + chg, CES0500000003 as Y/Y + M/M). The proxy and
    // provider both key off `{id}_{units?}` to keep them distinct.
    const keys = FRED_SERIES.map((s) => (s.units ? `${s.id}_${s.units}` : s.id));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("includes the Phase 4 expansion series (Labor Force, EmRatio, GDP QoQ, PPI, Forward Inflation, Wheat)", () => {
    const ids = new Set(FRED_SERIES.map((s) => s.id));
    expect(ids.has("CIVPART")).toBe(true);
    expect(ids.has("EMRATIO")).toBe(true);
    expect(ids.has("A191RL1Q225SBEA")).toBe(true);
    expect(ids.has("PPIACO")).toBe(true);
    expect(ids.has("T5YIFR")).toBe(true);
    expect(ids.has("PWHEAMTUSDM")).toBe(true);
  });

  it("includes the Phase 7 Sovereign Default proxy (HY OAS)", () => {
    const sovDef = FRED_SERIES.find((s) => s.id === "BAMLH0A0HYM2");
    expect(sovDef).toBeDefined();
    expect(sovDef!.labelPatterns).toContain("sovereign default");
    expect(sovDef!.unit).toBe("%");
  });

  it("includes the Phase 9 CPI / PCE / wage / sentiment expansion (13 series)", () => {
    const ids = new Set(FRED_SERIES.map((s) => s.id));
    for (const id of [
      "PCEPILFE",
      "PCESV",
      "PCEND",
      "CPIHOSSL",
      "CUSR0000SAS",
      "CUSR0000SACL1E",
      "CPIENGSL",
      "CPIUFDSL",
      "CUUR0000SETA02",
      "CES0500000003",
      "ECIALLCIV",
      "TCU",
      "MICH",
    ]) {
      expect(ids.has(id), `expected FRED_SERIES to include ${id}`).toBe(true);
    }
  });

  it("includes the Henry Hub natural-gas spot-price series (MHHNGSP) for the gas-feedstock node", () => {
    const henry = FRED_SERIES.find((s) => s.id === "MHHNGSP");
    expect(henry).toBeDefined();
    expect(henry!.labelPatterns).toContain("natural gas feedstock");
    expect(henry!.unit).toBe("$/MMBtu");
    expect(henry!.capacity).toBe(5); // stress-regime threshold (USD per MMBtu)
  });

  it("includes the US refinery utilization series (WPULEUS3) for refinery-throughput nodes", () => {
    const refUtil = FRED_SERIES.find((s) => s.id === "WPULEUS3");
    expect(refUtil).toBeDefined();
    expect(refUtil!.labelPatterns).toContain("refinery utilization");
    expect(refUtil!.unit).toBe("%");
    expect(refUtil!.capacity).toBe(90); // 90% = elevated regime; >95 = saturation
  });
});

describe("fredProvider.matchPayload", () => {
  it("attaches an indicator signal to nodes whose label matches a series pattern", () => {
    const nodes = [
      makeNode({ id: "n1", label: "Fed Funds Effective Rate" }),
      makeNode({ id: "n2", label: "Unemployment Rate (U3)" }),
      makeNode({ id: "n3", label: "Unrelated Asset" }),
    ];
    const feed = mockFredFeed();
    const batch = fredProvider.matchPayload(feed, nodes);

    expect(batch.providerId).toBe("fred");
    expect(batch.signalKinds).toEqual(["indicator"]);
    const matchedIds = batch.updates.map((u) => u.nodeId).sort();
    expect(matchedIds).toEqual(["n1", "n2"]);

    const dffPoint = batch.updates.find((u) => u.nodeId === "n1")!.point;
    expect(dffPoint.kind).toBe("indicator");
    expect(dffPoint.value).toBe(5.25);
    expect(dffPoint.unit).toBe("%");
    expect(dffPoint.capacity).toBe(6);
  });

  it("emits an empty batch with no event when no nodes match", () => {
    const feed = mockFredFeed();
    const batch = fredProvider.matchPayload(feed, [makeNode({ id: "x", label: "Generic Asset" })]);
    expect(batch.updates).toHaveLength(0);
    expect(batch.event).toBeUndefined();
    expect(batch.signalKinds).toEqual(["indicator"]);
  });

  it("event description distinguishes live vs mock observations", () => {
    const nodes = [makeNode({ id: "n1", label: "Fed Funds Effective Rate" })];
    const liveFeed = {
      fetchedAt: new Date().toISOString(),
      observations: [
        {
          seriesId: "DFF",
          label: "Federal Funds Effective Rate",
          value: 5.33,
          unit: "%",
          capacity: 6,
          observedAt: "2025-04-15T00:00:00.000Z",
          source: "FRED · DFF (period 2025-04-15)", // no (mock
        },
      ],
    };
    const batch = fredProvider.matchPayload(liveFeed, nodes);
    expect(batch.event?.description).toContain("1 live");
    expect(batch.event?.description).toContain("0 mock");
  });
});
