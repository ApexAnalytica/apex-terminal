import { describe, it, expect } from "vitest";
import {
  buildEiaSaudiCrudeUrl,
  parseEiaSaudiCrudeResponse,
  mockEiaSaudiCrudeFeed,
  SAUDI_CRUDE_CAPACITY_MBD,
} from "@/lib/feeds/eia-saudi-crude";
import { eiaSaudiCrudeProvider } from "@/lib/feeds/providers/eia-saudi-crude";
import { makeNode } from "../fixtures/graph-fixtures";

describe("buildEiaSaudiCrudeUrl", () => {
  it("builds the EIA v2 international/data URL with SAU + crude + production filters", () => {
    const url = buildEiaSaudiCrudeUrl("test-key");
    expect(url).toContain("api.eia.gov/v2/international/data");
    expect(url).toContain("api_key=test-key");
    expect(url).toContain("facets%5BcountryRegionId%5D%5B%5D=SAU");
    expect(url).toContain("facets%5BproductId%5D%5B%5D=53"); // crude oil
    expect(url).toContain("facets%5BactivityId%5D%5B%5D=1"); // production
    expect(url).toContain("sort%5B0%5D%5Bdirection%5D=desc"); // newest first
  });
});

describe("parseEiaSaudiCrudeResponse", () => {
  it("scales kbd → mb/d and picks the first finite period", () => {
    const raw = {
      response: {
        data: [
          { period: "2025-03", value: 9100 }, // 9.1 mb/d
          { period: "2025-02", value: 9050 },
        ],
      },
    };
    const feed = parseEiaSaudiCrudeResponse(raw);
    expect(feed.value).toBeCloseTo(9.1, 2);
    expect(feed.unit).toBe("mb/d");
    expect(feed.capacity).toBe(SAUDI_CRUDE_CAPACITY_MBD);
    expect(feed.period).toBe("2025-03");
    expect(feed.observedAt.startsWith("2025-03")).toBe(true);
    expect(feed.source).toContain("period 2025-03");
  });

  it("skips null/non-finite latest period and falls back to the next valid one", () => {
    const raw = {
      response: {
        data: [
          { period: "2025-04", value: null },
          { period: "2025-03", value: 9050 },
        ],
      },
    };
    const feed = parseEiaSaudiCrudeResponse(raw);
    expect(feed.period).toBe("2025-03");
    expect(feed.value).toBeCloseTo(9.05, 2);
  });

  it("accepts numeric-string values defensively (EIA quirk)", () => {
    const raw = {
      response: {
        data: [{ period: "2025-03", value: "9100" }],
      },
    };
    const feed = parseEiaSaudiCrudeResponse(raw);
    expect(feed.value).toBeCloseTo(9.1, 2);
  });

  it("throws on empty data array", () => {
    expect(() => parseEiaSaudiCrudeResponse({ response: { data: [] } })).toThrow();
  });

  it("throws when no finite value found in the window", () => {
    expect(() =>
      parseEiaSaudiCrudeResponse({
        response: {
          data: [
            { period: "2025-04", value: null },
            { period: "2025-03", value: null },
          ],
        },
      }),
    ).toThrow();
  });
});

describe("mockEiaSaudiCrudeFeed", () => {
  it("emits a plausible mock tagged (mock — EIA_API_KEY unset)", () => {
    const feed = mockEiaSaudiCrudeFeed();
    expect(feed.source).toContain("(mock");
    expect(feed.unit).toBe("mb/d");
    expect(feed.value).toBeGreaterThan(0);
    expect(feed.value).toBeLessThanOrEqual(SAUDI_CRUDE_CAPACITY_MBD);
    expect(feed.capacity).toBe(SAUDI_CRUDE_CAPACITY_MBD);
  });
});

describe("eiaSaudiCrudeProvider.matchPayload", () => {
  it("attaches a production signal to Abqaiq / Juaymah / Ras Tanura terminal / 'Saudi crude production' nodes", () => {
    const nodes = [
      makeNode({ id: "abqaiq", label: "Abqaiq Plants" }),
      makeNode({ id: "juaymah", label: "Juaymah Crude Terminal" }),
      makeNode({ id: "ras_tanura", label: "Ras Tanura Terminal" }),
      makeNode({ id: "future", label: "Saudi Crude Production (raw upstream)" }),
      makeNode({ id: "neutral", label: "Generic Refinery" }),
    ];
    const feed = mockEiaSaudiCrudeFeed();
    const batch = eiaSaudiCrudeProvider.matchPayload(feed, nodes);

    expect(batch.providerId).toBe("eia-saudi-crude");
    expect(batch.signalKinds).toEqual(["production"]);
    const matched = batch.updates.map((u) => u.nodeId).sort();
    expect(matched).toContain("abqaiq");
    expect(matched).toContain("juaymah");
    expect(matched).toContain("ras_tanura");
    expect(matched).toContain("future");
    expect(matched).not.toContain("neutral");
  });

  it("matches the Ras Tanura crude export terminal but NOT the co-located refinery", () => {
    // "ras tanura terminal" is a specific substring: the export terminal
    // is a crude-throughput proxy (paired with Juaymah), the refinery is
    // a downstream consumer and must not receive the production signal.
    const nodes = [
      makeNode({ id: "terminal", label: "Ras Tanura Terminal" }),
      makeNode({ id: "refinery", label: "Ras Tanura Refinery" }),
    ];
    const feed = mockEiaSaudiCrudeFeed();
    const batch = eiaSaudiCrudeProvider.matchPayload(feed, nodes);
    const matched = batch.updates.map((u) => u.nodeId).sort();
    expect(matched).toContain("terminal");
    expect(matched).not.toContain("refinery");
  });

  it("emits no event when no nodes match", () => {
    const feed = mockEiaSaudiCrudeFeed();
    const batch = eiaSaudiCrudeProvider.matchPayload(feed, [
      makeNode({ id: "x", label: "Unrelated Asset" }),
    ]);
    expect(batch.updates).toHaveLength(0);
    expect(batch.event).toBeUndefined();
  });

  it("excludes Phase 16 capacity + war-risk Abqaiq facets (regression)", () => {
    // After PR #456 (Phase 16 Abqaiq facets), the graph has three nodes
    // whose labels all contain "abqaiq" but represent different
    // variables. Only the throughput facet should receive the EIA
    // production signal — capacity is static + war-risk is a separate
    // disruption-probability dimension. (Legacy `sa_abqaiq_plants`
    // removed in the cleanup PR; canonical replacement is the
    // throughput facet.)
    const nodes = [
      makeNode({ id: "throughput", label: "Abqaiq — Throughput" }),
      makeNode({ id: "capacity", label: "Abqaiq — Capacity" }),
      makeNode({ id: "warrisk", label: "Abqaiq — War-Risk Premium" }),
    ];
    const feed = mockEiaSaudiCrudeFeed();
    const batch = eiaSaudiCrudeProvider.matchPayload(feed, nodes);
    const matched = batch.updates.map((u) => u.nodeId).sort();
    expect(matched).toContain("throughput");
    expect(matched).not.toContain("capacity");
    expect(matched).not.toContain("warrisk");
  });

  it("severity scales with production-vs-capacity ratio (capped at 1.0)", () => {
    const nodes = [makeNode({ id: "abqaiq", label: "Abqaiq Plants" })];
    // Synthesise a stress-regime feed: 11.5 mb/d / 12 capacity ≈ 96%.
    const feed = { ...mockEiaSaudiCrudeFeed(), value: 11.5 };
    const batch = eiaSaudiCrudeProvider.matchPayload(feed, nodes);
    expect(batch.event).toBeDefined();
    expect(batch.event!.severity).toBeCloseTo(11.5 / SAUDI_CRUDE_CAPACITY_MBD, 5);
  });
});
