import { describe, it, expect } from "vitest";
import {
  OPENSANCTIONS_INDEX_URL,
  buildOpenSanctionsFeed,
  mockOpenSanctionsFeed,
  normalizeCountryCode,
  type OpenSanctionsStatistics,
} from "@/lib/feeds/opensanctions";
import { openSanctionsProvider, openSanctionsMatchesNode } from "@/lib/feeds/providers/opensanctions";
import { formatLiveSignal } from "@/lib/feeds/display";
import type { CausalNode } from "@/lib/types";

describe("OPENSANCTIONS_INDEX_URL", () => {
  it("points at the keyless consolidated-sanctions dataset index", () => {
    expect(OPENSANCTIONS_INDEX_URL).toContain("data.opensanctions.org");
    expect(OPENSANCTIONS_INDEX_URL).toContain("/sanctions/");
    expect(OPENSANCTIONS_INDEX_URL.endsWith("index.json")).toBe(true);
  });
});

describe("normalizeCountryCode", () => {
  it("uppercases clean two-letter ISO codes", () => {
    expect(normalizeCountryCode("ru")).toBe("RU");
    expect(normalizeCountryCode("  ir ")).toBe("IR");
  });

  it("rejects non-ISO2 tokens (historical / unattributed buckets)", () => {
    expect(normalizeCountryCode("suhh")).toBeNull(); // USSR historical
    expect(normalizeCountryCode("")).toBeNull();
    expect(normalizeCountryCode("123")).toBeNull();
    expect(normalizeCountryCode(undefined)).toBeNull();
  });
});

describe("buildOpenSanctionsFeed", () => {
  const stats: OpenSanctionsStatistics = {
    target_count: 30000,
    targets: {
      total: 30000,
      countries: [
        { code: "ru", count: 21333, label: "Russia" },
        { code: "ir", count: 2697, label: "Iran" },
        { code: "suhh", count: 99, label: "Soviet Union" }, // non-ISO2 → dropped
        { code: "", count: 5, label: "" }, // unattributed → dropped
      ],
    },
  };

  it("builds a per-jurisdiction map keyed by uppercase ISO-2", () => {
    const feed = buildOpenSanctionsFeed(stats, {
      datasetVersion: "20260531014701-oel",
      observedAt: "2026-05-31T00:58:02",
    });
    expect(feed.jurisdictions.RU.targetCount).toBe(21333);
    expect(feed.jurisdictions.RU.country).toBe("Russia");
    expect(feed.jurisdictions.IR.targetCount).toBe(2697);
    // non-ISO2 / empty buckets are filtered out
    expect(Object.keys(feed.jurisdictions).sort()).toEqual(["IR", "RU"]);
  });

  it("carries the dataset-wide total and a non-mock, versioned source", () => {
    const feed = buildOpenSanctionsFeed(stats, {
      datasetVersion: "20260531014701-oel",
      observedAt: "2026-05-31T00:58:02",
    });
    expect(feed.totalTargets).toBe(30000);
    expect(feed.datasetVersion).toBe("20260531014701-oel");
    expect(feed.observedAt).toBe("2026-05-31T00:58:02");
    expect(feed.source).toContain("OpenSanctions");
    expect(feed.source.toLowerCase()).not.toContain("(mock");
  });

  it("falls back to summing jurisdictions when no top-level total present", () => {
    const feed = buildOpenSanctionsFeed(
      { targets: { countries: [{ code: "ru", count: 10, label: "Russia" }, { code: "ir", count: 5, label: "Iran" }] } },
      { datasetVersion: "v", observedAt: "2026-01-01" },
    );
    expect(feed.totalTargets).toBe(15);
  });

  it("handles missing / malformed statistics without crashing", () => {
    const feed = buildOpenSanctionsFeed({}, { datasetVersion: "v", observedAt: "2026-01-01" });
    expect(feed.jurisdictions).toEqual({});
    expect(feed.totalTargets).toBe(0);
  });
});

describe("mockOpenSanctionsFeed", () => {
  it("includes major sanctioned jurisdictions and is tagged (mock)", () => {
    const feed = mockOpenSanctionsFeed();
    expect(feed.jurisdictions.RU).toBeDefined();
    expect(feed.jurisdictions.IR).toBeDefined();
    expect(feed.jurisdictions.CN).toBeDefined();
    expect(feed.totalTargets).toBeGreaterThan(0);
    expect(feed.source).toContain("mock");
  });
});

describe("openSanctionsMatchesNode", () => {
  const jurisdictions = mockOpenSanctionsFeed().jurisdictions;

  it("matches a node whose fields mention a sanctioned jurisdiction with targets", () => {
    const node = { label: "Iran crude exports", domain: "energy", globalConcentration: "", physicalConstraint: "" };
    expect(openSanctionsMatchesNode(node, jurisdictions)).toBe("IR");
  });

  it("matches broader jurisdictions than OFAC (e.g. China)", () => {
    const node = { label: "China rare-earth refining", domain: "materials", globalConcentration: "", physicalConstraint: "" };
    expect(openSanctionsMatchesNode(node, jurisdictions)).toBe("CN");
  });

  it("returns null when no jurisdiction keyword is present", () => {
    const node = { label: "US Treasury yield", domain: "rates", globalConcentration: "", physicalConstraint: "" };
    expect(openSanctionsMatchesNode(node, jurisdictions)).toBeNull();
  });

  it("returns null when the matched jurisdiction has no targets in the payload", () => {
    const node = { label: "Cuba tourism", domain: "macro", globalConcentration: "", physicalConstraint: "" };
    // mock feed has no CU entry
    expect(openSanctionsMatchesNode(node, jurisdictions)).toBeNull();
  });
});

describe("openSanctionsProvider.matchPayload", () => {
  const payload = mockOpenSanctionsFeed();
  const nodes = [
    { id: "n1", label: "Iran crude exports", domain: "energy", globalConcentration: "", physicalConstraint: "" },
    { id: "n2", label: "US 10y real rate", domain: "rates", globalConcentration: "", physicalConstraint: "" },
  ] as unknown as CausalNode[];

  it("emits a distinct `watchlist` signal (not OFAC `sanctions`) only for matched nodes", () => {
    const batch = openSanctionsProvider.matchPayload(payload, nodes);
    expect(batch.providerId).toBe("opensanctions");
    expect(batch.signalKinds).toEqual(["watchlist"]);
    expect(batch.updates).toHaveLength(1);
    const point = batch.updates[0].point;
    expect(batch.updates[0].nodeId).toBe("n1");
    expect(point.kind).toBe("watchlist");
    expect(point.value).toBe(payload.jurisdictions.IR.targetCount);
    expect(point.capacity).toBe(payload.totalTargets);
    expect(point.observedAt).toBe(payload.observedAt);
  });

  it("produces a source string the `watchlist` display formatter can parse", () => {
    const batch = openSanctionsProvider.matchPayload(payload, nodes);
    const point = batch.updates[0].point;
    const formatted = formatLiveSignal(point);
    expect(formatted.shortLabel).toBe("OpenSanctions");
    expect(formatted.primaryValue).toBe("Iran");
    expect(formatted.qualifier).toContain("listed");
  });

  it("omits the dial event when nothing matches", () => {
    const noMatch = [{ id: "x", label: "nothing here", domain: "", globalConcentration: "", physicalConstraint: "" }] as unknown as CausalNode[];
    const batch = openSanctionsProvider.matchPayload(payload, noMatch);
    expect(batch.updates).toHaveLength(0);
    expect(batch.event).toBeUndefined();
  });
});
