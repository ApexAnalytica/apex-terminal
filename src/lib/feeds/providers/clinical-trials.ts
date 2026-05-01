/**
 * ClinicalTrials.gov provider — second T1D-side live feed. Drives drug /
 * therapy nodes (Teplizumab, VX-880) with live trial counts.
 */
import type { CausalNode, LiveDataPoint } from "@/lib/types";
import {
  CLINICAL_TRIALS_QUERIES,
  type ClinicalTrialsFeed,
  type ClinicalTrialsObservation,
} from "@/lib/feeds/clinical-trials";
import type { FeedDispatchBatch, FeedProvider } from "./types";

function matchQueryToNode(
  obs: ClinicalTrialsObservation,
  nodes: ReadonlyArray<CausalNode>,
): CausalNode | undefined {
  const config = CLINICAL_TRIALS_QUERIES.find((q) => q.id === obs.queryId);
  if (!config) return undefined;
  for (const pattern of config.labelPatterns) {
    const needle = pattern.toLowerCase();
    const match = nodes.find((n) => n.label.toLowerCase().includes(needle));
    if (match) return match;
  }
  return undefined;
}

export const clinicalTrialsProvider: FeedProvider<ClinicalTrialsFeed> = {
  id: "clinical-trials",
  label: "ClinicalTrials.gov · trial counts",
  endpoint: "/api/feeds/clinical-trials/studies",
  pollIntervalMs: 12 * 60 * 60 * 1000, // 12h — trials don't appear minute-by-minute
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
              id: `clinical-trials-${payload.fetchedAt}`,
              label: "ClinicalTrials.gov · trial-count refresh",
              description: `${updates.length} substance${updates.length === 1 ? "" : "s"} matched · ${liveCount} live · ${updates.length - liveCount} mock`,
              observedAt: payload.fetchedAt,
              severity: 0.2,
              affectedNodeIds,
            }
          : undefined,
    };
  },
};

export type { ClinicalTrialsFeed };
