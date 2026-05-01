import { describe, it, expect } from "vitest";
import {
  feedModeFromSource,
  timeAgoLabel,
  formatLiveSignal,
  shortLabelFromSource,
  summarizeLiveFeeds,
} from "@/lib/feeds/display";
import type { LiveDataPoint } from "@/lib/types";

const now = new Date().toISOString();

const point = (over: Partial<LiveDataPoint>): LiveDataPoint => ({
  kind: "throughput",
  value: 18.5,
  capacity: 21,
  unit: "mb/d",
  observedAt: now,
  source: "EIA v2 / Persian Gulf producers (period 2025-01)",
  ...over,
});

describe("feedModeFromSource", () => {
  it("classifies the EIA live source as live", () => {
    expect(feedModeFromSource("EIA v2 / Persian Gulf producers (period 2025-01)", now)).toBe("live");
  });

  it("classifies the EIA mock-without-key source as mock", () => {
    expect(feedModeFromSource("EIA v2 / Persian Gulf producers (mock — EIA_API_KEY unset)", now)).toBe("mock");
  });

  it("classifies the OFAC live source as live", () => {
    expect(feedModeFromSource("OFAC SDN — Iran: IRAN, IRAN-EO13599", now)).toBe("live");
  });

  it("classifies the OFAC mock-fallback source as mock-fallback", () => {
    expect(feedModeFromSource("OFAC SDN (mock — upstream unreachable)", now)).toBe("mock-fallback");
  });

  it("treats any (mock variant as mock unless explicitly fallback", () => {
    expect(feedModeFromSource("(mock — anything)", now)).toBe("mock");
  });
});

describe("timeAgoLabel", () => {
  it("returns 'just now' for < 60s old", () => {
    expect(timeAgoLabel(new Date(Date.now() - 30_000).toISOString())).toBe("just now");
  });

  it("returns Xm/Xh/Xd ago for minute/hour/day-scale", () => {
    expect(timeAgoLabel(new Date(Date.now() - 5 * 60_000).toISOString())).toBe("5m ago");
    expect(timeAgoLabel(new Date(Date.now() - 3 * 3600_000).toISOString())).toBe("3h ago");
    expect(timeAgoLabel(new Date(Date.now() - 2 * 86400_000).toISOString())).toBe("2d ago");
  });

  it("handles invalid input gracefully", () => {
    expect(timeAgoLabel("not-a-date")).toBe("");
  });
});

describe("shortLabelFromSource", () => {
  it("extracts the first whitespace token", () => {
    expect(shortLabelFromSource("EIA v2 / Persian Gulf producers (period 2025-01)")).toBe("EIA");
    expect(shortLabelFromSource("OFAC SDN — Iran: IRAN, IRAN-EO13599")).toBe("OFAC");
  });

  it("handles em-dash and parens as terminators", () => {
    expect(shortLabelFromSource("USGS—critical minerals")).toBe("USGS");
    expect(shortLabelFromSource("NOAA(storm tracks)")).toBe("NOAA");
  });

  it("falls back to 'feed' when source is empty", () => {
    expect(shortLabelFromSource("")).toBe("feed");
  });
});

describe("formatLiveSignal", () => {
  it("formats a throughput signal with ratio qualifier", () => {
    const f = formatLiveSignal(point({ kind: "throughput", value: 18.5, capacity: 21 }));
    expect(f.shortLabel).toBe("EIA");
    expect(f.primaryValue).toBe("18.50 mb/d");
    expect(f.qualifier).toBe("88%");
  });

  it("formats a sanctions signal with country and program count", () => {
    const f = formatLiveSignal(
      point({
        kind: "sanctions",
        value: 4,
        capacity: 1,
        unit: "programs",
        source: "OFAC SDN — Iran: IRAN, IRAN-EO13599, IRAN-EO13902, IRAN-HR",
      }),
    );
    expect(f.shortLabel).toBe("OFAC");
    expect(f.primaryValue).toBe("Iran");
    expect(f.qualifier).toBe("4 prog");
  });

  it("falls back to a generic value-unit format for unknown kinds", () => {
    const f = formatLiveSignal(
      point({
        kind: "minerals",
        value: 7,
        capacity: 10,
        unit: "producers",
        source: "USGS / critical minerals (mock)",
      }),
    );
    expect(f.shortLabel).toBe("USGS");
    expect(f.primaryValue).toBe("7 producers");
    expect(f.qualifier).toBe("70%");
  });

  it("omits qualifier for generic kind when ratio is meaningless (capacity 0)", () => {
    const f = formatLiveSignal(
      point({ kind: "presence", value: 1, capacity: 0, unit: "", source: "X / y" }),
    );
    expect(f.qualifier).toBeUndefined();
  });
});

describe("summarizeLiveFeeds", () => {
  it("counts distinct kinds by mode, deduping across nodes", () => {
    const nodes = [
      { liveData: [point({ kind: "throughput" })] },
      { liveData: [point({ kind: "throughput" })] }, // duplicate kind — should not double-count
      { liveData: [point({ kind: "sanctions", source: "OFAC SDN — Iran: IRAN" })] },
    ];
    const counts = summarizeLiveFeeds(nodes);
    expect(counts.live).toBe(2);
    expect(counts.mock).toBe(0);
  });

  it("classifies each kind by its observed mode", () => {
    const nodes = [
      { liveData: [point({ kind: "throughput", source: "EIA v2 (mock — EIA_API_KEY unset)" })] },
      { liveData: [point({ kind: "sanctions", source: "OFAC SDN (mock — upstream unreachable)" })] },
    ];
    const counts = summarizeLiveFeeds(nodes);
    expect(counts.mock).toBe(1);
    expect(counts["mock-fallback"]).toBe(1);
    expect(counts.live).toBe(0);
  });

  it("returns all-zero counts when no nodes carry liveData", () => {
    const counts = summarizeLiveFeeds([{ liveData: undefined }, {}]);
    expect(counts.live + counts.mock + counts["mock-fallback"] + counts.stale).toBe(0);
  });
});
