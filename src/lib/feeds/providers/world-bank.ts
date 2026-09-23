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

function findSeriesConfig(obs: WbObservation) {
  return WB_SERIES.find(
    (s) => s.country === obs.country && s.indicator === obs.indicator,
  );
}

/**
 * Resolve every node whose label matches the WB series' label patterns.
 *
 * Returns 0..N nodes — fan-out is required because a single (country,
 * indicator) tuple can legitimately drive multiple graph nodes. Concrete
 * case: WB `IND / AG.CON.FERT.ZS` (India fertilizer consumption) is the
 * canonical free signal for *both* `qf_india_fertilizer_market` (QAFCO
 * export market) and `mn_india_fertilizer_market` (Ma'aden export market)
 * — same upstream signal, two downstream nodes. Same story for Brazil.
 *
 * Previously this returned a single node via `nodes.find(...)`, silently
 * dropping every subsequent match. The bug was masked while every wired
 * series only had one downstream node, and surfaced when the fertilizer
 * batch came along.
 */
function matchSeriesToNodes(
  obs: WbObservation,
  nodes: ReadonlyArray<CausalNode>,
): CausalNode[] {
  const config = findSeriesConfig(obs);
  if (!config) return [];
  const matched = new Set<CausalNode>();
  for (const pattern of config.labelPatterns) {
    const needle = pattern.toLowerCase();
    for (const node of nodes) {
      if (node.label.toLowerCase().includes(needle)) {
        matched.add(node);
      }
    }
  }
  return [...matched];
}

export const worldBankProvider: FeedProvider<WorldBankFeed> = {
  id: "world-bank",
  label: "World Bank · country indicators",
  endpoint: "/api/feeds/world-bank/series",
  pollIntervalMs: 60 * 60 * 1000, // 1h — WB updates annually for most series
  matchPayload(payload, nodes): FeedDispatchBatch {
    const updates: Array<{ nodeId: string; point: LiveDataPoint }> = [];
    const affectedNodeIds: string[] = [];
    const kindSet = new Set<string>();
    let liveCount = 0;

    for (const obs of payload.observations) {
      const matchedNodes = matchSeriesToNodes(obs, nodes);
      if (matchedNodes.length === 0) continue;
      const config = findSeriesConfig(obs);
      const kind = config?.kind ?? "indicator";
      const point: LiveDataPoint = {
        kind,
        value: obs.value,
        capacity: obs.capacity,
        unit: obs.unit,
        observedAt: obs.observedAt,
        source: obs.source,
        history: obs.history,
      };
      const isLive = !obs.source.toLowerCase().includes("(mock");
      for (const node of matchedNodes) {
        updates.push({ nodeId: node.id, point });
        affectedNodeIds.push(node.id);
        kindSet.add(kind);
        if (isLive) liveCount += 1;
      }
    }

    return {
      providerId: this.id,
      signalKinds: kindSet.size > 0 ? [...kindSet].sort() : ["indicator"],
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
