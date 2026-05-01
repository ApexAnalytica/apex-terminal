import { describe, it, expect } from "vitest";
import { formatLiveSignal } from "@/lib/feeds/display";
import type { LiveDataPoint } from "@/lib/types";

const indicator = (over: Partial<LiveDataPoint>): LiveDataPoint => ({
  kind: "indicator",
  value: 5.25,
  capacity: 6,
  unit: "%",
  observedAt: new Date().toISOString(),
  source: "FRED · DFF (period 2025-04-15)",
  ...over,
});

describe("indicator kind formatter", () => {
  it("formats a percentage with no space before the unit", () => {
    const f = formatLiveSignal(indicator({ value: 5.25, unit: "%" }));
    expect(f.shortLabel).toBe("FRED");
    expect(f.primaryValue).toBe("5.25%");
    expect(f.qualifier).toBe("88%"); // 5.25 / 6 = 0.875
  });

  it("formats integer counts with K suffix tight", () => {
    const f = formatLiveSignal(indicator({ value: 8540, unit: "K", capacity: 12000 }));
    expect(f.primaryValue).toBe("8540K");
    expect(f.qualifier).toBe("71%");
  });

  it("formats unitless index values cleanly", () => {
    const f = formatLiveSignal(indicator({ value: 102.4, unit: "", capacity: 110 }));
    expect(f.primaryValue).toBe("102.40");
    expect(f.qualifier).toBe("93%");
  });

  it("omits qualifier when ratio exceeds 200% (overshoot is its own signal)", () => {
    const f = formatLiveSignal(indicator({ value: 25, unit: "%", capacity: 5 }));
    expect(f.primaryValue).toBe("25%");
    expect(f.qualifier).toBeUndefined();
  });

  it("omits qualifier when capacity is 0 (unbounded indicator like total payrolls)", () => {
    const f = formatLiveSignal(indicator({ value: 158420, unit: "K", capacity: 0 }));
    expect(f.primaryValue).toBe("158420K");
    expect(f.qualifier).toBeUndefined();
  });

  it("preserves space for verbose units like 'mb/d'", () => {
    const f = formatLiveSignal(indicator({ value: 18.5, unit: "mb/d", capacity: 21 }));
    expect(f.primaryValue).toBe("18.50 mb/d");
  });
});
