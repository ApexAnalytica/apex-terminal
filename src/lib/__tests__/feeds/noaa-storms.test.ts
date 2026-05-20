import { describe, it, expect } from "vitest";
import {
  NOAA_BASINS,
  HURRICANE_THRESHOLD_KT,
  buildNoaaStormsUrl,
  parseNoaaStormsResponse,
  mockNoaaStormsFeed,
} from "@/lib/feeds/noaa-storms";
import { noaaStormsProvider } from "@/lib/feeds/providers/noaa-storms";
import { makeNode } from "../fixtures/graph-fixtures";

describe("buildNoaaStormsUrl", () => {
  it("returns the NHC CurrentStorms.json endpoint", () => {
    expect(buildNoaaStormsUrl()).toBe("https://www.nhc.noaa.gov/CurrentStorms.json");
  });
});

describe("parseNoaaStormsResponse", () => {
  it("aggregates active storms by basin", () => {
    const raw = {
      activeStorms: [
        { id: "AL062023", name: "HAROLD", classification: "HU", intensity: "85" },
        { id: "AL072023", name: "IDALIA", classification: "TS", intensity: "55" },
        { id: "EP032023", name: "DORA", classification: "HU", intensity: "120" },
      ],
    };
    const feed = parseNoaaStormsResponse(raw);
    const al = feed.observations.find((o) => o.basinCode === "AL")!;
    const ep = feed.observations.find((o) => o.basinCode === "EP")!;
    const cp = feed.observations.find((o) => o.basinCode === "CP")!;
    expect(al.stormCount).toBe(2);
    expect(al.maxIntensityKt).toBe(85);
    expect(al.topStorm!.name).toBe("HAROLD");
    expect(ep.stormCount).toBe(1);
    expect(ep.maxIntensityKt).toBe(120);
    expect(cp.stormCount).toBe(0);
    expect(cp.topStorm).toBeNull();
  });

  it("emits 0-active observations for every basin when no storms are active", () => {
    const feed = parseNoaaStormsResponse({ activeStorms: [] });
    expect(feed.observations).toHaveLength(NOAA_BASINS.length);
    for (const obs of feed.observations) {
      expect(obs.stormCount).toBe(0);
      expect(obs.topStorm).toBeNull();
      expect(obs.source).toContain("0 active");
    }
  });

  it("uses capacity = HURRICANE_THRESHOLD_KT for every observation", () => {
    const feed = parseNoaaStormsResponse({ activeStorms: [] });
    for (const obs of feed.observations) {
      expect(obs.capacity).toBe(HURRICANE_THRESHOLD_KT);
      expect(obs.unit).toBe("kt");
    }
  });

  it("skips storms with missing or non-finite intensity", () => {
    const raw = {
      activeStorms: [
        { id: "AL01", name: "ALPHA", classification: "TS", intensity: "n/a" },
        { id: "AL02", name: "BETA", classification: "HU", intensity: "60" },
        { id: "AL03", classification: "TS", intensity: "30" }, // missing name
      ],
    };
    const feed = parseNoaaStormsResponse(raw);
    const al = feed.observations.find((o) => o.basinCode === "AL")!;
    expect(al.stormCount).toBe(1);
    expect(al.topStorm!.name).toBe("BETA");
  });

  it("returns an empty-per-basin feed when input is malformed", () => {
    expect(parseNoaaStormsResponse(null).observations).toHaveLength(NOAA_BASINS.length);
    expect(parseNoaaStormsResponse({}).observations).toHaveLength(NOAA_BASINS.length);
  });

  it("accepts numeric intensity values too (defensive against schema drift)", () => {
    const raw = {
      activeStorms: [
        { id: "AL01", name: "GAMMA", classification: "HU", intensity: 90 },
      ],
    };
    const feed = parseNoaaStormsResponse(raw);
    const al = feed.observations.find((o) => o.basinCode === "AL")!;
    expect(al.maxIntensityKt).toBe(90);
  });
});

describe("mockNoaaStormsFeed", () => {
  it("emits one observation per NOAA_BASINS entry, all tagged (mock)", () => {
    const feed = mockNoaaStormsFeed();
    expect(feed.observations).toHaveLength(NOAA_BASINS.length);
    for (const obs of feed.observations) {
      expect(obs.source).toContain("(mock");
    }
  });
});

describe("noaaStormsProvider.matchPayload", () => {
  it("attaches a storm signal to nodes whose label matches an active basin", () => {
    const nodes = [
      makeNode({ id: "sci", label: "Shipping Cost Index" }),
      makeNode({ id: "neutral", label: "Random Asset" }),
    ];
    const feed = parseNoaaStormsResponse({
      activeStorms: [
        { id: "AL01", name: "HAROLD", classification: "HU", intensity: "75" },
      ],
    });
    const batch = noaaStormsProvider.matchPayload(feed, nodes);
    expect(batch.providerId).toBe("noaa-storms");
    expect(batch.signalKinds).toEqual(["storm"]);
    const matched = batch.updates.find((u) => u.nodeId === "sci");
    expect(matched).toBeDefined();
    expect(matched!.point.kind).toBe("storm");
    expect(matched!.point.value).toBe(75);
    expect(matched!.point.capacity).toBe(HURRICANE_THRESHOLD_KT);
    expect(batch.updates.find((u) => u.nodeId === "neutral")).toBeUndefined();
  });

  it("emits no updates when no basin has active storms", () => {
    const nodes = [makeNode({ id: "sci", label: "Shipping Cost Index" })];
    const feed = parseNoaaStormsResponse({ activeStorms: [] });
    const batch = noaaStormsProvider.matchPayload(feed, nodes);
    expect(batch.updates).toHaveLength(0);
    expect(batch.event).toBeUndefined();
  });

  it("emits no updates when active basins have no matching nodes", () => {
    const nodes = [makeNode({ id: "x", label: "Unrelated" })];
    const feed = parseNoaaStormsResponse({
      activeStorms: [{ id: "EP01", name: "DORA", classification: "HU", intensity: "100" }],
    });
    const batch = noaaStormsProvider.matchPayload(feed, nodes);
    expect(batch.updates).toHaveLength(0);
  });

  it("severity scales with the strongest storm's intensity / capacity ratio", () => {
    const nodes = [makeNode({ id: "sci", label: "Shipping Cost Index" })];
    const major = parseNoaaStormsResponse({
      activeStorms: [{ id: "AL01", name: "BIG", classification: "HU", intensity: "128" }], // 2× threshold
    });
    const batch = noaaStormsProvider.matchPayload(major, nodes);
    expect(batch.event).toBeDefined();
    expect(batch.event!.severity).toBe(1); // capped at 1.0
  });
});
