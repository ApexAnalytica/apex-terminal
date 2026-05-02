/**
 * World Bank provider — drives country-level macro nodes (Brazil, China,
 * global aggregates) via the keyless WB Open Data API.
 */
import type { CausalNode, LiveDataPoint } from "@/lib/types";
import {
  WB_SERIES,
  type WorldBankFeed,
  type WbObservation,
} from "@/lib/feeds/world-bank";
import type { FeedDispatchBatch, FeedProvider } from "./types";

function matchSeriesToNode(
  obs: WbObservation,
  nodes: ReadonlyArray<CausalNode>,
): CausalNode | undefined {
  const config = WB_SERIES.find(
    (s) => s.country === obs.country && s.indicator === obs.indicator,
  );
  if (!config) return undefined;
  for (const pattern of config.labelPatterns) {
    const needle = pattern.toLowerCase();
    const match = nodes.find((n) => n.label.toLowerCase().includes(needle));
    if (match) return match;
  }
  return undefined;
}

export const worldBankProvider: FeedProvider<WorldBankFeed> = {
  id: "world-bank",
  label: "World Bank · country indicators",
  endpoint: "/api/feeds/world-bank/series",
  pollIntervalMs: 60 * 60 * 1000, // 1h — WB updates annually for most series
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
              id: `world-bank-${payload.fetchedAt}`,
              label: "World Bank · country indicators refresh",
              description: `${updates.length} series matched · ${liveCount} live · ${updates.length - liveCount} mock`,
              observedAt: payload.fetchedAt,
              severity: 0.2,
              affectedNodeIds,
            }
          : undefined,
    };
  },
};

export type { WorldBankFeed };
