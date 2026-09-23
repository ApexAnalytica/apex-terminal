/**
 * NOAA NHC active tropical-cyclone feed — drives shipping / supply-chain
 * nodes vulnerable to tropical-storm disruption in the Atlantic, Eastern
 * Pacific, and Central Pacific basins.
 *
 * Source: https://www.nhc.noaa.gov/CurrentStorms.json
 * Free, no key required. NHC publishes updates every ~6h during active
 * tropical systems and the JSON returns an empty `activeStorms` array
 * outside hurricane season (Atlantic: June–November; Pacific: May–
 * November). Server proxy holds a 1h cache.
 *
 * Each basin in `NOAA_BASINS` aggregates active storms to a single
 * observation (count + max-intensity-knots), with `labelPatterns` matched
 * case-insensitively against `node.label`. The hurricane threshold
 * (64 kt sustained winds) is used as the capacity so cards render the
 * ratio as "this basin's strongest storm relative to hurricane strength."
 */

export interface NoaaBasinConfig {
  /** NHC two-letter basin prefix in storm id (AL / EP / CP). */
  basinCode: string;
  /** Human-readable basin label. */
  basinName: string;
  /** Substrings matched (case-insensitive) against node.label. */
  labelPatterns: string[];
}

export const NOAA_BASINS: NoaaBasinConfig[] = [
  {
    basinCode: "AL",
    basinName: "Atlantic",
    labelPatterns: ["shipping cost", "atlantic", "gulf coast", "caribbean"],
  },
  {
    basinCode: "EP",
    basinName: "Eastern Pacific",
    labelPatterns: ["eastern pacific", "central america"],
  },
  {
    basinCode: "CP",
    basinName: "Central Pacific",
    labelPatterns: ["central pacific", "hawaii"],
  },
];

/** Hurricane minimum sustained wind (Saffir-Simpson Cat 1 floor), knots. */
export const HURRICANE_THRESHOLD_KT = 64;

export interface NoaaStorm {
  id: string;
  basinCode: string;
  name: string;
  classification: string;
  intensityKt: number;
}

export interface NoaaBasinObservation {
  basinCode: string;
  basinName: string;
  stormCount: number;
  maxIntensityKt: number;
  topStorm: {
    name: string;
    classification: string;
    intensityKt: number;
  } | null;
  unit: string;
  capacity: number;
  observedAt: string;
  source: string;
}

export interface NoaaStormsFeed {
  observations: NoaaBasinObservation[];
  fetchedAt: string;
}

interface NhcRawStorm {
  id?: string;
  binNumber?: string;
  name?: string;
  classification?: string;
  intensity?: string | number;
}

interface NhcResponse {
  activeStorms?: NhcRawStorm[];
}

export function buildNoaaStormsUrl(): string {
  return "https://www.nhc.noaa.gov/CurrentStorms.json";
}

/** Parse the raw NHC `CurrentStorms.json` payload into per-basin
 *  aggregate observations. Unknown / malformed storm rows are skipped. */
export function parseNoaaStormsResponse(raw: unknown): NoaaStormsFeed {
  const env = raw as NhcResponse;
  const stormsRaw = env?.activeStorms ?? [];
  const storms: NoaaStorm[] = [];
  for (const s of stormsRaw) {
    if (!s.id || !s.name || !s.classification) continue;
    const basinCode = s.id.slice(0, 2).toUpperCase();
    const intensity =
      typeof s.intensity === "number"
        ? s.intensity
        : parseFloat(s.intensity ?? "");
    if (!Number.isFinite(intensity)) continue;
    storms.push({
      id: s.id,
      basinCode,
      name: s.name,
      classification: s.classification,
      intensityKt: intensity,
    });
  }

  const fetchedAt = new Date().toISOString();
  const observations: NoaaBasinObservation[] = NOAA_BASINS.map((basin) => {
    const basinStorms = storms.filter((s) => s.basinCode === basin.basinCode);
    const topStorm =
      basinStorms.length > 0
        ? basinStorms.reduce((a, b) => (a.intensityKt >= b.intensityKt ? a : b))
        : null;
    return {
      basinCode: basin.basinCode,
      basinName: basin.basinName,
      stormCount: basinStorms.length,
      maxIntensityKt: topStorm?.intensityKt ?? 0,
      topStorm: topStorm
        ? {
            name: topStorm.name,
            classification: topStorm.classification,
            intensityKt: topStorm.intensityKt,
          }
        : null,
      unit: "kt",
      capacity: HURRICANE_THRESHOLD_KT,
      observedAt: fetchedAt,
      source: topStorm
        ? `NOAA NHC · ${basin.basinName} · ${basinStorms.length} active (top: ${topStorm.classification} ${topStorm.name} @ ${topStorm.intensityKt}kt)`
        : `NOAA NHC · ${basin.basinName} · 0 active`,
    };
  });

  return { observations, fetchedAt };
}

/** Deterministic mock — used when upstream is unreachable. Plausible
 *  off-season state (Atlantic quiet, single EP system, CP quiet) so the
 *  cards exercise both the "no storm" and "active storm" rendering paths
 *  in dev mode without inventing a fake hurricane scare. */
export function mockNoaaStormsFeed(): NoaaStormsFeed {
  const observedAt = new Date().toISOString();
  return {
    fetchedAt: observedAt,
    observations: [
      {
        basinCode: "AL",
        basinName: "Atlantic",
        stormCount: 0,
        maxIntensityKt: 0,
        topStorm: null,
        unit: "kt",
        capacity: HURRICANE_THRESHOLD_KT,
        observedAt,
        source: "NOAA NHC · Atlantic · 0 active (mock — upstream unreachable)",
      },
      {
        basinCode: "EP",
        basinName: "Eastern Pacific",
        stormCount: 1,
        maxIntensityKt: 45,
        topStorm: { name: "ALDO", classification: "TS", intensityKt: 45 },
        unit: "kt",
        capacity: HURRICANE_THRESHOLD_KT,
        observedAt,
        source:
          "NOAA NHC · Eastern Pacific · 1 active (mock — upstream unreachable)",
      },
      {
        basinCode: "CP",
        basinName: "Central Pacific",
        stormCount: 0,
        maxIntensityKt: 0,
        topStorm: null,
        unit: "kt",
        capacity: HURRICANE_THRESHOLD_KT,
        observedAt,
        source:
          "NOAA NHC · Central Pacific · 0 active (mock — upstream unreachable)",
      },
    ],
  };
}
