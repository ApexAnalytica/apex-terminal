/**
 * NOAA NHC provider — drives shipping / supply-chain nodes with live
 * active-tropical-cyclone counts from the National Hurricane Center.
 *
 * Each basin observation emits one "storm" LiveDataPoint per matching
 * node. Basins with 0 active storms emit nothing (so the store's
 * stale-signal cleanup clears the "storm" kind from nodes that were
 * touched in a previous, more-active poll cycle).
 */
import type { CausalNode, LiveDataPoint } from "@/lib/types";
import {
  NOAA_BASINS,
  type NoaaBasinObservation,
  type NoaaStormsFeed,
} from "@/lib/feeds/noaa-storms";
import type { FeedDispatchBatch, FeedProvider } from "./types";

function matchBasinNodes(
  obs: NoaaBasinObservation,
  nodes: ReadonlyArray<CausalNode>,
): CausalNode[] {
  const basin = NOAA_BASINS.find((b) => b.basinCode === obs.basinCode);
  if (!basin) return [];
  const seen = new Set<string>();
  const matches: CausalNode[] = [];
  for (const pattern of basin.labelPatterns) {
    const needle = pattern.toLowerCase();
    for (const node of nodes) {
      if (seen.has(node.id)) continue;
      if (!node.label.toLowerCase().includes(needle)) continue;
      seen.add(node.id);
      matches.push(node);
    }
  }
  return matches;
}

export const noaaStormsProvider: FeedProvider<NoaaStormsFeed> = {
  id: "noaa-storms",
  label: "NOAA NHC · active tropical storms",
  endpoint: "/api/feeds/noaa/storms",
  // NHC updates every ~6h during active systems; off-season is mostly
  // idle. 1h client poll keeps the store fresh within one upstream cycle.
  pollIntervalMs: 60 * 60 * 1000,
  matchPayload(payload, nodes): FeedDispatchBatch {
    const updates: Array<{ nodeId: string; point: LiveDataPoint }> = [];
    const affectedNodeIds: string[] = [];
    let liveCount = 0;

    for (const obs of payload.observations) {
      if (obs.stormCount === 0) continue;
      for (const node of matchBasinNodes(obs, nodes)) {
        if (affectedNodeIds.includes(node.id)) continue;
        const point: LiveDataPoint = {
          kind: "storm",
          value: obs.maxIntensityKt,
          capacity: obs.capacity,
          unit: obs.unit,
          observedAt: obs.observedAt,
          source: obs.source,
        };
        updates.push({ nodeId: node.id, point });
        affectedNodeIds.push(node.id);
        if (!obs.source.toLowerCase().includes("(mock")) liveCount += 1;
      }
    }

    return {
      providerId: this.id,
      signalKinds: ["storm"],
      updates,
      event:
        updates.length > 0
          ? {
              id: `noaa-storms-${payload.fetchedAt}`,
              label: "NOAA NHC · active-storm refresh",
              description: `${updates.length} node${updates.length === 1 ? "" : "s"} touched by active storms · ${liveCount} live · ${updates.length - liveCount} mock`,
              observedAt: payload.fetchedAt,
              // Severity scales with the strongest storm's intensity
              // relative to the hurricane threshold (capped at 1.0).
              severity: Math.min(
                1,
                Math.max(
                  ...payload.observations
                    .filter((o) => o.stormCount > 0)
                    .map((o) => o.maxIntensityKt / o.capacity),
                  0.2,
                ),
              ),
              affectedNodeIds,
            }
          : undefined,
    };
  },
};

export type { NoaaStormsFeed };
