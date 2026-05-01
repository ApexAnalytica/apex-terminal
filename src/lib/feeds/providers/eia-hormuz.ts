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

const isChokepoint = (label: string): boolean => {
  const l = label.toLowerCase();
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
      if (!isChokepoint(n.label)) continue;
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
export const eiaHormuzMatchesNode = (n: Pick<CausalNode, "label">) => isChokepoint(n.label);
