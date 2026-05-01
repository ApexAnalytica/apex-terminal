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
    expect(url).toContain("limit=1");
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

  it("seriesIds are unique", () => {
    const ids = FRED_SERIES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
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
