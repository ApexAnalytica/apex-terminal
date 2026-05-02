/**
 * FRED provider — drives macro/financial nodes via the Federal Reserve
 * Economic Data API.
 */
import type { CausalNode, LiveDataPoint } from "@/lib/types";
import {
  FRED_SERIES,
  type FredFeed,
  type FredObservation,
} from "@/lib/feeds/fred";
import type { FeedDispatchBatch, FeedProvider } from "./types";

/** Find the first node whose label matches any of the series' labelPatterns
 *  (case-insensitive substring). */
function matchSeriesToNode(
  obs: FredObservation,
  nodes: ReadonlyArray<CausalNode>,
): CausalNode | undefined {
  const config = FRED_SERIES.find((s) => s.id === obs.seriesId);
  if (!config) return undefined;
  for (const pattern of config.labelPatterns) {
    const needle = pattern.toLowerCase();
    const match = nodes.find((n) => n.label.toLowerCase().includes(needle));
    if (match) return match;
  }
  return undefined;
}

export const fredProvider: FeedProvider<FredFeed> = {
  id: "fred",
  label: "FRED · macro indicators",
  endpoint: "/api/feeds/fred/series",
  pollIntervalMs: 30 * 60 * 1000, // 30 min — proxy caches 6h upstream
  matchPayload(payload, nodes): FeedDispatchBatch {
    const updates: Array<{ nodeId: string; point: LiveDataPoint }> = [];
    const affectedNodeIds: string[] = [];
    let liveCount = 0;

    for (const obs of payload.observations) {
      const node = matchSeriesToNode(obs, nodes);
      if (!node) continue;
      const point: LiveDataPoint = {
        kind: "indicator",
        value: obs.value,
        capacity: obs.capacity,
        unit: obs.unit,
        observedAt: obs.observedAt,
        source: obs.source,
        // Pass the parsed historical observations through so the sparkline
        // can draw a curve on the first tick.
        history: obs.history,
      };
      updates.push({ nodeId: node.id, point });
      affectedNodeIds.push(node.id);
      if (!obs.source.toLowerCase().includes("(mock")) liveCount += 1;
    }

    return {
      providerId: this.id,
      signalKinds: ["indicator"],
      updates,
      event:
        updates.length > 0
          ? {
              id: `fred-${payload.fetchedAt}`,
              label: "FRED · macro indicators refresh",
              description: `${updates.length} series matched · ${liveCount} live · ${updates.length - liveCount} mock`,
              observedAt: payload.fetchedAt,
              severity: 0.3, // low — informational, not a violation
              affectedNodeIds,
            }
          : undefined,
    };
  },
};

export type { FredFeed };
