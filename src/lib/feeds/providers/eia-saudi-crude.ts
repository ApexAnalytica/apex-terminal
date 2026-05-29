/**
 * EIA Saudi crude production provider — drives upstream Saudi producer
 * nodes (Abqaiq Plants and other Saudi Aramco-domain nodes) with
 * monthly crude-oil production data.
 *
 * Matching: `labelPatterns` substring-match against `node.label`, so
 * adding more Saudi production nodes to coverage is one labelPattern
 * addition.
 */
import type { CausalNode, LiveDataPoint } from "@/lib/types";
import {
  type EiaSaudiCrudeFeed,
} from "@/lib/feeds/eia-saudi-crude";
import type { FeedDispatchBatch, FeedProvider } from "./types";

/** Substrings (case-insensitive) that mark a node as receiving Saudi
 *  crude-production updates. Conservative — Abqaiq is the main
 *  processing facility for ~half of Saudi production; Juaymah is the
 *  export terminal. Both are reasonable proxies for "Saudi crude
 *  throughput" today and any future "Saudi Crude Production"
 *  dedicated node will match. */
const SAUDI_PRODUCTION_PATTERNS = [
  "saudi crude production",
  "abqaiq",
  "juaymah crude",
];

function matchesSaudiProduction(node: CausalNode): boolean {
  const label = node.label.toLowerCase();
  // Phase 16 facet exclusions — sibling si_abqaiq_capacity +
  // si_abqaiq_war_risk_premium facets share "abqaiq" in their labels
  // but represent different variables than the throughput signal this
  // provider emits. Without this exclusion, a single Saudi-production
  // value would land on capacity (wrong: capacity is static, not the
  // observed throughput) and on the war-risk facet (wrong: that
  // represents disruption probability, not realized flow).
  //
  // Legacy `sa_abqaiq_plants` node was removed in Phase 16 cleanup PR;
  // canonical replacement `si_abqaiq_throughput` (label "Abqaiq —
  // Throughput") matches via the "abqaiq" substring pattern.
  if (
    label.includes("abqaiq") &&
    (label.includes("capacity") || label.includes("war-risk") || label.includes("war risk"))
  ) {
    return false;
  }
  return SAUDI_PRODUCTION_PATTERNS.some((p) => label.includes(p));
}

export const eiaSaudiCrudeProvider: FeedProvider<EiaSaudiCrudeFeed> = {
  id: "eia-saudi-crude",
  label: "EIA · Saudi crude production",
  endpoint: "/api/feeds/eia/saudi-crude",
  // EIA refreshes monthly with a ~2-month lag; 6h client poll keeps
  // the store fresh well within one upstream cycle.
  pollIntervalMs: 6 * 60 * 60 * 1000,
  matchPayload(payload, nodes): FeedDispatchBatch {
    const matches = nodes.filter(matchesSaudiProduction);
    const isLive = !payload.source.toLowerCase().includes("(mock");
    const updates: Array<{ nodeId: string; point: LiveDataPoint }> = matches.map(
      (n) => ({
        nodeId: n.id,
        point: {
          kind: "production",
          value: payload.value,
          capacity: payload.capacity,
          unit: payload.unit,
          observedAt: payload.observedAt,
          source: payload.source,
        },
      }),
    );

    return {
      providerId: this.id,
      signalKinds: ["production"],
      updates,
      event:
        updates.length > 0
          ? {
              id: `eia-saudi-crude-${payload.observedAt}`,
              label: "EIA · Saudi crude production refresh",
              description: `${updates.length} node${updates.length === 1 ? "" : "s"} touched · ${payload.value.toFixed(2)} ${payload.unit} (${isLive ? "live" : "mock"})`,
              observedAt: payload.observedAt,
              severity: Math.min(1, payload.value / payload.capacity),
              affectedNodeIds: matches.map((n) => n.id),
            }
          : undefined,
    };
  },
};

export type { EiaSaudiCrudeFeed };
