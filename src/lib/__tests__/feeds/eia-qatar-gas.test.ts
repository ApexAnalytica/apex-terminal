import { describe, it, expect } from "vitest";
import {
  buildEiaQatarGasUrl,
  parseEiaQatarGasResponse,
  mockEiaQatarGasFeed,
  QATAR_GAS_CAPACITY_BCM,
} from "@/lib/feeds/eia-qatar-gas";
import { eiaQatarGasProvider } from "@/lib/feeds/providers/eia-qatar-gas";
import { makeNode } from "../fixtures/graph-fixtures";

describe("buildEiaQatarGasUrl", () => {
  it("builds the EIA v2 international/data URL with QAT + dry-gas + production + annual filters", () => {
    const url = buildEiaQatarGasUrl("test-key");
    expect(url).toContain("api.eia.gov/v2/international/data");
    expect(url).toContain("api_key=test-key");
    expect(url).toContain("frequency=annual");
    expect(url).toContain("facets%5BcountryRegionId%5D%5B%5D=QAT");
    expect(url).toContain("facets%5BproductId%5D%5B%5D=26"); // dry natural gas
    expect(url).toContain("facets%5BactivityId%5D%5B%5D=1"); // production
    expect(url).toContain("sort%5B0%5D%5Bdirection%5D=desc"); // newest first
  });
});

describe("parseEiaQatarGasResponse", () => {
  it("prefers the BCM row and picks the latest finite period", () => {
    const raw = {
      response: {
        data: [
          { period: "2024", value: "6001.9", unit: "BCF" },
          { period: "2024", value: "169.95", unit: "BCM" },
          { period: "2023", value: "6032.3", unit: "BCF" },
          { period: "2023", value: "170.8", unit: "BCM" },
        ],
      },
    };
    const feed = parseEiaQatarGasResponse(raw);
    expect(feed.value).toBeCloseTo(169.95, 2);
    expect(feed.unit).toBe("BCM/yr");
    expect(feed.capacity).toBe(QATAR_GAS_CAPACITY_BCM);
    expect(feed.period).toBe("2024");
    expect(feed.observedAt.startsWith("2024-01-01")).toBe(true);
    expect(feed.source).toContain("period 2024");
  });

  it("falls back to a BCF row scaled to BCM when no BCM row is present", () => {
    const raw = {
      response: {
        data: [{ period: "2024", value: "6001.9", unit: "BCF" }],
      },
    };
    const feed = parseEiaQatarGasResponse(raw);
    // 6001.9 BCF * 0.0283168 ≈ 169.95 BCM
    expect(feed.value).toBeCloseTo(169.95, 1);
    expect(feed.unit).toBe("BCM/yr");
  });

  it("skips a null latest period and falls back to the next valid one", () => {
    const raw = {
      response: {
        data: [
          { period: "2025", value: null, unit: "BCM" },
          { period: "2024", value: "169.95", unit: "BCM" },
        ],
      },
    };
    const feed = parseEiaQatarGasResponse(raw);
    expect(feed.period).toBe("2024");
    expect(feed.value).toBeCloseTo(169.95, 2);
  });

  it("accepts numeric (non-string) values defensively", () => {
    const raw = {
      response: { data: [{ period: "2024", value: 169.95, unit: "BCM" }] },
    };
    const feed = parseEiaQatarGasResponse(raw);
    expect(feed.value).toBeCloseTo(169.95, 2);
  });

  it("throws on empty data array", () => {
    expect(() => parseEiaQatarGasResponse({ response: { data: [] } })).toThrow();
  });

  it("throws when no finite BCM/BCF value found in the window", () => {
    expect(() =>
      parseEiaQatarGasResponse({
        response: {
          data: [
            { period: "2024", value: null, unit: "BCM" },
            { period: "2024", value: "NA", unit: "BCF" },
          ],
        },
      }),
    ).toThrow();
  });
});

describe("mockEiaQatarGasFeed", () => {
  it("emits a plausible mock tagged (mock — EIA_API_KEY unset)", () => {
    const feed = mockEiaQatarGasFeed();
    expect(feed.source).toContain("(mock");
    expect(feed.unit).toBe("BCM/yr");
    expect(feed.value).toBeGreaterThan(0);
    expect(feed.value).toBeLessThanOrEqual(QATAR_GAS_CAPACITY_BCM);
    expect(feed.capacity).toBe(QATAR_GAS_CAPACITY_BCM);
  });
});

describe("eiaQatarGasProvider.matchPayload", () => {
  it("attaches a production signal to both North Field source nodes", () => {
    const nodes = [
      makeNode({ id: "qe_nf", label: "North Field (gas field)" }),
      makeNode({ id: "qf_nf", label: "Qatar North Field natural gas resource" }),
      makeNode({ id: "neutral", label: "Generic LNG Train" }),
    ];
    const feed = mockEiaQatarGasFeed();
    const batch = eiaQatarGasProvider.matchPayload(feed, nodes);

    expect(batch.providerId).toBe("eia-qatar-gas");
    expect(batch.signalKinds).toEqual(["production"]);
    const matched = batch.updates.map((u) => u.nodeId).sort();
    expect(matched).toContain("qe_nf");
    expect(matched).toContain("qf_nf");
    expect(matched).not.toContain("neutral");
  });

  it("excludes the North Field Expansion (NFE + NFS) project node", () => {
    // The expansion node shares "north field" in its label but
    // represents added future capacity, not current realized production.
    const nodes = [
      makeNode({ id: "source", label: "North Field (gas field)" }),
      makeNode({ id: "expansion", label: "North Field Expansion (NFE + NFS)" }),
    ];
    const feed = mockEiaQatarGasFeed();
    const batch = eiaQatarGasProvider.matchPayload(feed, nodes);
    const matched = batch.updates.map((u) => u.nodeId).sort();
    expect(matched).toContain("source");
    expect(matched).not.toContain("expansion");
  });

  it("emits no event when no nodes match", () => {
    const feed = mockEiaQatarGasFeed();
    const batch = eiaQatarGasProvider.matchPayload(feed, [
      makeNode({ id: "x", label: "Unrelated Asset" }),
    ]);
    expect(batch.updates).toHaveLength(0);
    expect(batch.event).toBeUndefined();
  });

  it("severity scales with production-vs-capacity ratio (capped at 1.0)", () => {
    const nodes = [makeNode({ id: "qe_nf", label: "North Field (gas field)" })];
    const feed = { ...mockEiaQatarGasFeed(), value: 200 };
    const batch = eiaQatarGasProvider.matchPayload(feed, nodes);
    expect(batch.event).toBeDefined();
    expect(batch.event!.severity).toBeCloseTo(200 / QATAR_GAS_CAPACITY_BCM, 5);
  });
});
