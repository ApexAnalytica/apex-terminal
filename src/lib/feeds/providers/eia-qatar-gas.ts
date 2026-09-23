/**
 * EIA Qatar dry-gas production provider — drives the upstream North
 * Field gas-source nodes (`qe_north_field_gas_field` and the QAFCO-domain
 * duplicate `qf_north_field_gas`) with annual dry-gas production data.
 *
 * Matching: `labelPatterns` substring-match against `node.label`. Both
 * North Field source nodes contain "north field"; the expansion *project*
 * node ("North Field Expansion (NFE + NFS)") also contains the substring
 * but represents future capacity addition, not current realized
 * production — so it is explicitly excluded, mirroring the Phase 16
 * throughput-vs-capacity facet discipline.
 */
import type { CausalNode, LiveDataPoint } from "@/lib/types";
import { type EiaQatarGasFeed } from "@/lib/feeds/eia-qatar-gas";
import type { FeedDispatchBatch, FeedProvider } from "./types";

/** Substring (case-insensitive) marking a node as receiving Qatar
 *  dry-gas production updates. North Field is the source of ~all Qatari
 *  dry gas, so national production is a direct proxy for its
 *  deliverability. */
const NORTH_FIELD_PATTERN = "north field";

function matchesNorthFieldProduction(node: CausalNode): boolean {
  const label = node.label.toLowerCase();
  // Exclude the expansion *project* node — it shares "north field" in
  // its label but represents added future capacity (NFE/NFS), not the
  // current realized production this provider emits. Without this guard
  // the production value would land on the expansion node and read as
  // "the expansion is already producing", which is wrong.
  if (label.includes("expansion")) return false;
  return label.includes(NORTH_FIELD_PATTERN);
}

export const eiaQatarGasProvider: FeedProvider<EiaQatarGasFeed> = {
  id: "eia-qatar-gas",
  label: "EIA · Qatar dry-gas production",
  endpoint: "/api/feeds/eia/qatar-gas",
  // EIA publishes this series annually; 6h client poll keeps the store
  // fresh well within one upstream cycle (the proxy caches 6h upstream).
  pollIntervalMs: 6 * 60 * 60 * 1000,
  matchPayload(payload, nodes): FeedDispatchBatch {
    const matches = nodes.filter(matchesNorthFieldProduction);
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
              id: `eia-qatar-gas-${payload.observedAt}`,
              label: "EIA · Qatar dry-gas production refresh",
              description: `${updates.length} node${updates.length === 1 ? "" : "s"} touched · ${payload.value.toFixed(1)} ${payload.unit} (${isLive ? "live" : "mock"})`,
              observedAt: payload.observedAt,
              severity: Math.min(1, payload.value / payload.capacity),
              affectedNodeIds: matches.map((n) => n.id),
            }
          : undefined,
    };
  },
};

export type { EiaQatarGasFeed };

/** Exported for unit testing the matcher in isolation. */
export const eiaQatarGasMatchesNode = (n: Pick<CausalNode, "label">) =>
  matchesNorthFieldProduction(n as CausalNode);
