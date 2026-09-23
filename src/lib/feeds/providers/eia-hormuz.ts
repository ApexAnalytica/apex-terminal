/**
 * EIA Persian Gulf crude production provider — drives A-04 (Strait of
 * Hormuz Chokepoint Throughput Ceiling).
 *
 * The fetch / parse / mock implementations live in `../eia-hormuz.ts`
 * and are imported here so the API route can keep using them without
 * pulling in client-only types. This file owns only the registry-side
 * concerns: how often to poll, which nodes match, and how to build the
 * dispatch event for the TimeDial.
 */
import type { CausalNode } from "@/lib/types";
import type { EiaHormuzFeed } from "@/lib/feeds/eia-hormuz";
import type { FeedDispatchBatch, FeedProvider } from "./types";

// Match throughput-semantic chokepoint nodes — the canonical facet
// `si_hormuz_throughput` (label "Strait of Hormuz — Throughput") and
// any future chokepoint-throughput nodes (label containing
// "chokepoint"). Negatively excludes the sibling capacity / war-risk
// facets which share "Strait of Hormuz" in their labels but represent
// different variables.
//
// Phase 16 history: PR #440 (additive) introduced the canonical facets
// alongside legacy per-domain copies (qf_/mn_strait_of_hormuz). PR #3
// (cleanup, this branch) removed the legacy copies — so the matcher
// no longer needs to handle the bare "Strait of Hormuz" legacy label.
// The negative-exclusion guard still protects against the capacity +
// war-risk facets accidentally receiving throughput data.
const isThroughputNode = (label: string): boolean => {
  const l = label.toLowerCase();
  // Phase 16 facet exclusions — these sibling nodes share "strait of
  // hormuz" in their label but represent capacity / risk variables,
  // not flow.
  if (l.includes("capacity") || l.includes("war-risk") || l.includes("war risk")) {
    return false;
  }
  return l.includes("strait of hormuz") || l.includes("chokepoint");
};

export const eiaHormuzProvider: FeedProvider<EiaHormuzFeed> = {
  id: "eia-hormuz",
  label: "EIA · Hormuz throughput",
  endpoint: "/api/feeds/eia/hormuz",
  pollIntervalMs: 5 * 60 * 1000, // 5 min — proxy itself caches 6h upstream
  matchPayload(payload, nodes): FeedDispatchBatch {
    const updates: Array<{ nodeId: string; point: import("@/lib/types").LiveDataPoint }> = [];
    const affectedNodeIds: string[] = [];
    for (const n of nodes) {
      if (!isThroughputNode(n.label)) continue;
      updates.push({ nodeId: n.id, point: payload });
      affectedNodeIds.push(n.id);
    }
    return {
      providerId: this.id,
      signalKinds: ["throughput"],
      updates,
      event:
        updates.length > 0
          ? {
              id: `eia-hormuz-${payload.observedAt}`,
              label: "EIA · Hormuz throughput refresh",
              description: `${payload.value.toFixed(2)} ${payload.unit} (${(
                (payload.value / payload.capacity) *
                100
              ).toFixed(0)}% of ${payload.capacity} ${payload.unit} capacity) — ${payload.source}`,
              observedAt: payload.observedAt,
              severity: Math.min(1, payload.value / payload.capacity),
              affectedNodeIds,
            }
          : undefined,
    };
  },
};

// Re-export for convenience so callers only need one import.
export type { EiaHormuzFeed };
/** Exported for unit testing the matcher in isolation. */
export const eiaHormuzMatchesNode = (n: Pick<CausalNode, "label">) => isThroughputNode(n.label);
