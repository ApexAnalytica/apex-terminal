import { describe, expect, it } from "vitest";
import { getNodeCoordinates } from "../geo-coordinates";

// Helpers — assertions tolerate the small per-node jitter the resolver
// adds (±2° for country, ±0.6° for city / US-hub, ±6° for domain).
const inBox = (
  coord: [number, number],
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): boolean =>
  Math.abs(coord[0] - cx) <= rx && Math.abs(coord[1] - cy) <= ry;

describe("getNodeCoordinates — exact match", () => {
  it("returns pinned coords for known node ids", () => {
    expect(getNodeCoordinates("sa_abqaiq_plants", "", "Saudi Aramco Energy"))
      .toEqual([49.66, 25.94]);
    expect(getNodeCoordinates("vx880_dose", "", "T1D VX-880"))
      .toEqual([-71.04, 42.35]);
    expect(getNodeCoordinates("fs_neutrino_mass_hierarchy", "", "Frontier Science"))
      .toEqual([-88.27, 41.83]);
  });
});

describe("getNodeCoordinates — city scan", () => {
  it("pins to the city when globalConcentration mentions one", () => {
    const c = getNodeCoordinates(
      "unknown_id_1",
      "Headquartered in Boston, exports global",
      "AnyDomain",
    );
    // Boston ≈ [-71.06, 42.36], ±0.6° jitter
    expect(inBox(c, -71.06, 42.36, 0.6, 0.6)).toBe(true);
  });

  it("returns deterministic coords for the same node id", () => {
    const a = getNodeCoordinates("xx", "based in Singapore", "Domain");
    const b = getNodeCoordinates("xx", "based in Singapore", "Domain");
    expect(a).toEqual(b);
  });
});

describe("getNodeCoordinates — US-hub spread", () => {
  it("spreads US-tagged nodes across multiple hubs, not a single point", () => {
    const ids = [
      "us_a", "us_b", "us_c", "us_d", "us_e",
      "us_f", "us_g", "us_h", "us_i", "us_j",
    ];
    const points = ids.map((id) =>
      getNodeCoordinates(id, "100% United States", "AnyDomain"),
    );
    // Distinct hub buckets: at least 3 different longitudes across 10 ids
    const distinctLngs = new Set(points.map((p) => Math.round(p[0])));
    expect(distinctLngs.size).toBeGreaterThanOrEqual(3);
    // None land near the old Kansas centroid (-95.7, 37.1)
    for (const p of points) {
      const onKansas = Math.abs(p[0] - -95.7) < 2 && Math.abs(p[1] - 37.1) < 2;
      expect(onKansas).toBe(false);
    }
  });

  it("handles the 'USA' / 'US' aliases too", () => {
    const a = getNodeCoordinates("alias_a", "100% USA", "AnyDomain");
    const b = getNodeCoordinates("alias_b", "60% US / 40% global", "AnyDomain");
    // Both resolve through the US-hub path → small jitter, valid US lng
    expect(a[0]).toBeLessThan(-65); // US-only longitude band
    expect(b[0]).toBeLessThan(-65);
  });
});

describe("getNodeCoordinates — country regex", () => {
  it("matches the '100% Country' form", () => {
    const c = getNodeCoordinates("china_unknown", "100% China", "AnyDomain");
    // China centroid ≈ [104.2, 35.9], ±4° jitter
    expect(inBox(c, 104.2, 35.9, 4, 4)).toBe(true);
  });

  it("matches plural-percent strings like '60% Brazil / 40% global'", () => {
    const c = getNodeCoordinates(
      "br_unknown",
      "60% Brazil / 40% global",
      "AnyDomain",
    );
    // Brazil centroid ≈ [-51.9, -14.2]
    expect(inBox(c, -51.9, -14.2, 4, 4)).toBe(true);
  });

  it("falls back to country mention without a percent", () => {
    const c = getNodeCoordinates(
      "jp_unknown",
      "Sourced from Japan and South Korea",
      "AnyDomain",
    );
    // Should match Japan (first occurrence) — centroid ≈ [138.3, 36.2]
    expect(c[0]).toBeGreaterThan(120);
    expect(c[1]).toBeGreaterThan(20);
  });
});

describe("getNodeCoordinates — domain centroid fallback", () => {
  it("uses domain centroid for unknown id + unparseable concentration", () => {
    const c = getNodeCoordinates(
      "unknown_id_2",
      "Diversified, no country signal",
      "AI Safety / IDS",
    );
    // UNB Fredericton centroid for AI Safety
    expect(inBox(c, -66.64, 45.95, 6, 6)).toBe(true);
  });
});
