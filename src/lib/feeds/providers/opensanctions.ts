/**
 * OpenSanctions consolidated-sanctions provider — broadens R-01
 * (Jurisdictional Concentration) and R-02 (Force Majeure Exposure) beyond
 * the US-only OFAC SDN feed with globally-consolidated watchlist coverage.
 *
 * The fetch / build / mock implementations live in `../opensanctions.ts`
 * and are imported by the API route. This file owns the registry-side
 * concerns: polling cadence, jurisdiction inference from node fields, and
 * the dispatch-event shape for the TimeDial.
 *
 * Emits a distinct `kind: "watchlist"` (not OFAC's "sanctions") so an
 * overlapping node — Iran, Russia — can carry both the US-program count
 * and the consolidated global-target count without the two providers
 * clobbering each other's signal.
 */
import type { CausalNode, LiveDataPoint } from "@/lib/types";
import type { OpenSanctionsFeed } from "@/lib/feeds/opensanctions";
import type { FeedDispatchBatch, FeedProvider } from "./types";

/**
 * Keyword → ISO-2 map for matching graph nodes to jurisdictions. Broader
 * than the OFAC map (which is scoped to US-program jurisdictions): includes
 * the MENA-energy and major-economy jurisdictions that appear in the
 * geopolitical graph, since OpenSanctions covers far more countries than
 * the US SDN list does. A node only lights up if its matched jurisdiction
 * actually carries targets in the payload, so extra keys are harmless.
 */
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
  china: "CN",
  chinese: "CN",
  pakistan: "PK",
  ukraine: "UA",
  turkey: "TR",
  "türkiye": "TR",
  "united arab emirates": "AE",
  uae: "AE",
  iraq: "IQ",
  kuwait: "KW",
  "saudi arabia": "SA",
  saudi: "SA",
  qatar: "QA",
  lebanon: "LB",
  yemen: "YE",
  libya: "LY",
  sudan: "SD",
};

/**
 * Heuristic match: scan a node's label / domain / globalConcentration /
 * physicalConstraint strings for a jurisdiction keyword, return the first
 * match whose jurisdiction has any sanctioned targets in the payload.
 */
export function openSanctionsMatchesNode(
  node: Pick<CausalNode, "label" | "domain" | "globalConcentration" | "physicalConstraint">,
  jurisdictions: OpenSanctionsFeed["jurisdictions"],
): string | null {
  const haystack = `${node.label} ${node.domain} ${node.globalConcentration} ${node.physicalConstraint ?? ""}`.toLowerCase();
  for (const [keyword, code] of Object.entries(CODE_BY_KEYWORD)) {
    if (haystack.includes(keyword) && jurisdictions[code]?.targetCount) return code;
  }
  return null;
}

export const openSanctionsProvider: FeedProvider<OpenSanctionsFeed> = {
  id: "opensanctions",
  label: "OpenSanctions · consolidated watchlist",
  endpoint: "/api/feeds/opensanctions/targets",
  pollIntervalMs: 30 * 60 * 1000, // 30 min — proxy caches 24h upstream
  matchPayload(payload, nodes): FeedDispatchBatch {
    const updates: Array<{ nodeId: string; point: LiveDataPoint }> = [];
    const affectedNodeIds: string[] = [];
    for (const n of nodes) {
      const code = openSanctionsMatchesNode(n, payload.jurisdictions);
      if (!code) continue;
      const j = payload.jurisdictions[code];
      const point: LiveDataPoint = {
        kind: "watchlist",
        value: j.targetCount,
        // capacity = dataset-wide total → ratio is this jurisdiction's share
        // of all globally-consolidated sanctioned targets.
        capacity: payload.totalTargets,
        unit: "targets",
        observedAt: payload.observedAt,
        // source format parsed by the `watchlist` display formatter:
        //   "<provider> — <Country>: <n> sanctioned targets"
        source: `${payload.source} — ${j.country}: ${j.targetCount} sanctioned targets`,
      };
      updates.push({ nodeId: n.id, point });
      affectedNodeIds.push(n.id);
    }
    return {
      providerId: this.id,
      signalKinds: ["watchlist"],
      updates,
      event:
        updates.length > 0
          ? {
              id: `opensanctions-${payload.datasetVersion}`,
              label: "OpenSanctions · consolidated refresh",
              description: `${affectedNodeIds.length} node${
                affectedNodeIds.length === 1 ? "" : "s"
              } matched · ${payload.totalTargets.toLocaleString()} sanctioned targets across ${Object.keys(payload.jurisdictions).length} jurisdictions — ${payload.source}`,
              observedAt: payload.observedAt,
              severity: Math.min(1, affectedNodeIds.length / 5),
              affectedNodeIds,
            }
          : undefined,
    };
  },
};

export type { OpenSanctionsFeed };
