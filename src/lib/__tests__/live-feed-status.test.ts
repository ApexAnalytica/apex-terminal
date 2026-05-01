import { describe, it, expect } from "vitest";
import { feedModeFromSource, timeAgoLabel } from "@/components/LiveFeedStatus";

describe("feedModeFromSource", () => {
  const now = new Date().toISOString();

  it("classifies the EIA live source as live", () => {
    expect(feedModeFromSource("EIA v2 / Persian Gulf producers (period 2025-01)", now)).toBe("live");
  });

  it("classifies the EIA mock-without-key source as mock", () => {
    expect(feedModeFromSource("EIA v2 / Persian Gulf producers (mock — EIA_API_KEY unset)", now)).toBe("mock");
  });

  it("classifies the OFAC live source as live", () => {
    expect(feedModeFromSource("OFAC SDN — Iran: IRAN, IRAN-EO13599", now)).toBe("live");
  });

  it("classifies the OFAC mock-fallback (upstream unreachable) as mock-fallback", () => {
    expect(feedModeFromSource("OFAC SDN (mock — upstream unreachable)", now)).toBe("mock-fallback");
  });

  it("treats any (mock variant as mock unless explicitly fallback", () => {
    expect(feedModeFromSource("(mock — anything)", now)).toBe("mock");
  });
});

describe("timeAgoLabel", () => {
  it("returns 'just now' for < 60s old timestamps", () => {
    expect(timeAgoLabel(new Date(Date.now() - 30_000).toISOString())).toBe("just now");
  });

  it("returns Xm ago for minute-scale timestamps", () => {
    expect(timeAgoLabel(new Date(Date.now() - 5 * 60_000).toISOString())).toBe("5m ago");
  });

  it("returns Xh ago for hour-scale timestamps", () => {
    expect(timeAgoLabel(new Date(Date.now() - 3 * 3600_000).toISOString())).toBe("3h ago");
  });

  it("returns Xd ago for day-scale timestamps", () => {
    expect(timeAgoLabel(new Date(Date.now() - 2 * 86400_000).toISOString())).toBe("2d ago");
  });

  it("handles invalid input gracefully", () => {
    expect(timeAgoLabel("not-a-date")).toBe("");
  });
});
