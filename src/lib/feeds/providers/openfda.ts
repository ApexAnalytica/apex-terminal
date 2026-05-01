/**
 * OpenFDA provider — first T1D-side live feed. Drives drug nodes
 * (Teplizumab, insulin glargine) with live adverse-event report counts
 * from the FDA Adverse Event Reporting System (FAERS).
 */
import type { CausalNode, LiveDataPoint } from "@/lib/types";
import {
  OPENFDA_QUERIES,
  type OpenFdaFeed,
  type OpenFdaObservation,
} from "@/lib/feeds/openfda";
import type { FeedDispatchBatch, FeedProvider } from "./types";

function matchQueryToNode(
  obs: OpenFdaObservation,
  nodes: ReadonlyArray<CausalNode>,
): CausalNode | undefined {
  const config = OPENFDA_QUERIES.find((q) => q.id === obs.queryId);
  if (!config) return undefined;
  for (const pattern of config.labelPatterns) {
    const needle = pattern.toLowerCase();
    const match = nodes.find((n) => n.label.toLowerCase().includes(needle));
    if (match) return match;
  }
  return undefined;
}

export const openFdaProvider: FeedProvider<OpenFdaFeed> = {
  id: "openfda",
  label: "OpenFDA · adverse events",
  endpoint: "/api/feeds/openfda/events",
  pollIntervalMs: 6 * 60 * 60 * 1000, // 6h — FAERS publishes quarterly
  matchPayload(payload, nodes): FeedDispatchBatch {
    const updates: Array<{ nodeId: string; point: LiveDataPoint }> = [];
    const affectedNodeIds: string[] = [];
    let liveCount = 0;

    for (const obs of payload.observations) {
      const node = matchQueryToNode(obs, nodes);
      if (!node) continue;
      const point: LiveDataPoint = {
        kind: "indicator",
        value: obs.value,
        capacity: obs.capacity,
        unit: obs.unit,
        observedAt: obs.observedAt,
        source: obs.source,
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
              id: `openfda-${payload.fetchedAt}`,
              label: "OpenFDA · adverse-event refresh",
              description: `${updates.length} drug${updates.length === 1 ? "" : "s"} matched · ${liveCount} live · ${updates.length - liveCount} mock`,
              observedAt: payload.fetchedAt,
              severity: 0.2,
              affectedNodeIds,
            }
          : undefined,
    };
  },
};

export type { OpenFdaFeed };
