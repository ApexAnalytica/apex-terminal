import { describe, it, expect } from "vitest";
import {
  buildEiaHormuzUrl,
  mockEiaHormuzFeed,
  parseEiaHormuzResponse,
  HORMUZ_CAPACITY_MBD,
} from "@/lib/feeds/eia-hormuz";

describe("buildEiaHormuzUrl", () => {
  it("includes the api key, monthly frequency, and all six Persian Gulf country codes", () => {
    const url = buildEiaHormuzUrl("test-key");
    expect(url).toContain("api_key=test-key");
    expect(url).toContain("frequency=monthly");
    for (const c of ["SAU", "ARE", "IRN", "IRQ", "KWT", "QAT"]) {
      expect(url).toContain(c);
    }
    expect(url).toContain("sort%5B0%5D%5Bdirection%5D=desc");
  });

  it("hits api.eia.gov v2 international/data", () => {
    const url = buildEiaHormuzUrl("k");
    expect(url.startsWith("https://api.eia.gov/v2/international/data/")).toBe(true);
  });
});

describe("parseEiaHormuzResponse", () => {
  const baseRow = (over: Partial<{ period: string; countryRegionId: string; countryRegionName: string; value: number | string | null }>) => ({
    period: "2025-01",
    countryRegionId: "SAU",
    countryRegionName: "Saudi Arabia",
    productId: "53",
    productName: "Crude oil including lease condensate",
    activityName: "Production",
    value: 9000,
    unit: "MBBL/D",
    ...over,
  });

  it("sums the latest period's values across countries, scales by Hormuz transit fraction (0.85)", () => {
    const raw = {
      response: {
        data: [
          baseRow({ countryRegionId: "SAU", countryRegionName: "Saudi Arabia", value: 9000 }),
          baseRow({ countryRegionId: "ARE", countryRegionName: "UAE", value: 3000 }),
          baseRow({ countryRegionId: "IRN", countryRegionName: "Iran", value: 2000 }),
          // older period — should be ignored
          baseRow({ period: "2024-12", countryRegionId: "SAU", value: 99999 }),
        ],
      },
    };
    const feed = parseEiaHormuzResponse(raw);
    // (9 + 3 + 2) mb/d × 0.85 = 11.9
    expect(feed.value).toBeCloseTo(11.9, 2);
    expect(feed.capacity).toBe(HORMUZ_CAPACITY_MBD);
    expect(feed.unit).toBe("mb/d");
    expect(feed.breakdown).toHaveLength(3);
    expect(feed.observedAt).toContain("2025-01");
  });

  it("tolerates string-typed value fields and skips nulls", () => {
    const raw = {
      response: {
        data: [
          baseRow({ value: "9000" as unknown as number }),
          baseRow({ countryRegionId: "ARE", value: null }),
        ],
      },
    };
    const feed = parseEiaHormuzResponse(raw);
    // 9 mb/d × 0.85 = 7.65
    expect(feed.value).toBeCloseTo(7.65, 2);
    expect(feed.breakdown).toHaveLength(1);
  });

  it("throws on empty response", () => {
    expect(() => parseEiaHormuzResponse({ response: { data: [] } })).toThrow();
    expect(() => parseEiaHormuzResponse({})).toThrow();
  });
});

describe("mockEiaHormuzFeed", () => {
  it("returns a value below capacity but above the 0.9 saturation threshold", () => {
    const feed = mockEiaHormuzFeed();
    const ratio = feed.value / feed.capacity;
    expect(ratio).toBeGreaterThan(0.85);
    expect(ratio).toBeLessThan(1);
    expect(feed.source).toContain("mock");
  });

  it("breakdown sums to within rounding of the headline value (before transit-fraction scaling)", () => {
    const feed = mockEiaHormuzFeed();
    const breakdownSum = feed.breakdown.reduce((s, b) => s + b.valueMbd, 0);
    expect(breakdownSum).toBeCloseTo(feed.value / 0.85, 0); // headline = sum × 0.85
  });
});
