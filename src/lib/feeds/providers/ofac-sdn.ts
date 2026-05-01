/**
 * Treasury OFAC Specially Designated Nationals provider — drives R-01
 * (Jurisdictional Concentration) and R-02 (Force Majeure Exposure).
 *
 * The fetch / parse / mock implementations live in `../ofac-sdn.ts` and
 * are imported by the API route. This file owns the registry-side concerns:
 * polling cadence, jurisdiction inference from node fields, dispatch-event
 * shape for the TimeDial.
 */
import type { CausalNode, LiveDataPoint } from "@/lib/types";
import type { OfacSdnFeed } from "@/lib/feeds/ofac-sdn";
import type { FeedDispatchBatch, FeedProvider } from "./types";

const CODE_BY_KEYWORD: Record<string, string> = {
  iran: "IR",
  russia: "RU",
  russian: "RU",
  "north korea": "KP",
  dprk: "KP",
  syria: "SY",
  cuba: "CU",
  venezuela: "VE",
  belarus: "BY",
  myanmar: "MM",
  burma: "MM",
  zimbabwe: "ZW",
  sudan: "SD",
  lebanon: "LB",
  somalia: "SO",
};

/**
 * Heuristic match: scan a node's label / domain / globalConcentration /
 * physicalConstraint strings for a sanctioned-country keyword, return the
 * first match whose jurisdiction has any active programs in the payload.
 */
export function ofacMatchesNode(
  node: Pick<CausalNode, "label" | "domain" | "globalConcentration" | "physicalConstraint">,
  jurisdictions: OfacSdnFeed["jurisdictions"],
): string | null {
  const haystack = `${node.label} ${node.domain} ${node.globalConcentration} ${node.physicalConstraint ?? ""}`.toLowerCase();
  for (const [keyword, code] of Object.entries(CODE_BY_KEYWORD)) {
    if (haystack.includes(keyword) && jurisdictions[code]?.entryCount) return code;
  }
  return null;
}

export const ofacSdnProvider: FeedProvider<OfacSdnFeed> = {
  id: "ofac-sdn",
  label: "OFAC · SDN sanctions",
  endpoint: "/api/feeds/ofac/sdn",
  pollIntervalMs: 30 * 60 * 1000, // 30 min — proxy caches 24h upstream
  matchPayload(payload, nodes): FeedDispatchBatch {
    const updates: Array<{ nodeId: string; point: LiveDataPoint }> = [];
    const affectedNodeIds: string[] = [];
    for (const n of nodes) {
      const code = ofacMatchesNode(n, payload.jurisdictions);
      if (!code) continue;
      const j = payload.jurisdictions[code];
      const point: LiveDataPoint = {
        kind: "sanctions",
        value: j.programs.length,
        capacity: 1,
        unit: "programs",
        observedAt: payload.fetchedAt,
        source: `${payload.source} — ${j.country}: ${j.programs.join(", ")}`,
      };
      updates.push({ nodeId: n.id, point });
      affectedNodeIds.push(n.id);
    }
    const totalPrograms = Object.values(payload.jurisdictions).reduce(
      (sum, j) => sum + j.programs.length,
      0,
    );
    return {
      providerId: this.id,
      signalKinds: ["sanctions"],
      updates,
      event:
        updates.length > 0
          ? {
              id: `ofac-sdn-${payload.fetchedAt}`,
              label: "OFAC · SDN refresh",
              description: `${affectedNodeIds.length} node${
                affectedNodeIds.length === 1 ? "" : "s"
              } matched · ${totalPrograms} active programs across ${Object.keys(payload.jurisdictions).length} jurisdictions — ${payload.source}`,
              observedAt: payload.fetchedAt,
              severity: Math.min(1, affectedNodeIds.length / 5),
              affectedNodeIds,
            }
          : undefined,
    };
  },
};

export type { OfacSdnFeed };
