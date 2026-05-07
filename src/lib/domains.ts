// Domain catalog — metadata only. NO graph-data imports here so this
// module stays light enough to be safe to pull into the critical-path
// bundle. Static importers (HeaderBar, copilot-context, etc.) only
// need the catalog, not the underlying graphs.
//
// If you need to *build* a CausalGraph from selected domain ids, use
// `buildGraphFromDomains` from `@/lib/build-domain-graph` — that one
// imports the heavy graph-data modules and is meant for code paths
// that already need them (DomainSelector, copilot-actions, etc.).

export interface DomainCard {
  id: string;
  label: string;
  icon: string;
  color: string;
  colorVar: string;
  description: string;
  hasData: boolean;
  dataset: "main" | "athena" | "t1d" | "vx880"; // which graph to load
}

export interface DomainGroup {
  label: string;
  color: string;
  domains: DomainCard[];
}

export type Persona =
  | "scientist"
  | "financial"
  | "macro"
  | "geopolitical"
  | "cross";

export const PERSONAS: { id: Persona; label: string; desc: string }[] = [
  { id: "financial", label: "FINANCIAL", desc: "Markets · Credit · Sovereign" },
  { id: "macro", label: "MACRO", desc: "Growth · Inflation · Policy" },
  { id: "geopolitical", label: "GEOPOLITICAL", desc: "Energy · Infra · Defense" },
  { id: "scientist", label: "SCIENTIST", desc: "Life Sciences" },
  { id: "cross", label: "CROSS-DOMAIN", desc: "All domains · multi-select" },
];

// Each persona shows a subset of domain groups (by group label).
// CROSS shows everything and is the only persona allowed to multi-select
// across different datasets.
export const PERSONA_GROUPS: Record<Persona, Set<string>> = {
  financial: new Set(["FINANCIAL & SOVEREIGN", "MENA ENERGY & COMMODITIES"]),
  macro: new Set(["MACRO IMPACT", "FINANCIAL & SOVEREIGN"]),
  geopolitical: new Set([
    "MENA ENERGY & COMMODITIES",
    "INFRASTRUCTURE & DEFENSE",
    "FINANCIAL & SOVEREIGN",
  ]),
  scientist: new Set(["LIFE SCIENCES", "FRONTIER"]),
  cross: new Set([
    "MENA ENERGY & COMMODITIES",
    "FINANCIAL & SOVEREIGN",
    "INFRASTRUCTURE & DEFENSE",
    "MACRO IMPACT",
    "LIFE SCIENCES",
    "FRONTIER",
  ]),
};

export const DOMAIN_GROUPS: DomainGroup[] = [
  {
    label: "MENA ENERGY & COMMODITIES",
    color: "#ff1744",
    domains: [
      {
        id: "energy-systems",
        label: "Energy Systems",
        icon: "\u{26A1}",
        color: "#ff1744",
        colorVar: "var(--accent-red)",
        description: "Saudi Aramco crude/gas infrastructure, QatarEnergy LNG export chains",
        hasData: true,
        dataset: "main",
      },
      {
        id: "manufacturing",
        label: "Fertilizer & Agrochemical",
        icon: "\u{1F3ED}",
        color: "#448aff",
        colorVar: "var(--accent-blue)",
        description: "QAFCO urea/ammonia complex, Ma'aden phosphate supply chains, food price transmission",
        hasData: true,
        dataset: "main",
      },
      {
        id: "supply-chain",
        label: "Supply Chain Shock Risk",
        icon: "\u{1F517}",
        color: "#00e5ff",
        colorVar: "var(--accent-cyan)",
        description: "MENA food security, Bunge/Almarai supply chains, wheat price transmission",
        hasData: true,
        dataset: "main",
      },
    ],
  },
  {
    label: "FINANCIAL & SOVEREIGN",
    color: "#ffab00",
    domains: [
      {
        id: "financial-contagion",
        label: "Financial Contagion Risk",
        icon: "\u{1F3E6}",
        color: "#ff6d00",
        colorVar: "var(--accent-orange)",
        description: "Systemic banking failures, credit default cascades, liquidity traps",
        hasData: true,
        dataset: "main",
      },
      {
        id: "sovereign-risk",
        label: "Emerging Market Sovereign Risk",
        icon: "\u{1F30D}",
        color: "#ffab00",
        colorVar: "var(--accent-amber)",
        description: "Currency crises, debt restructuring, capital flight contagion",
        hasData: true,
        dataset: "main",
      },
    ],
  },
  {
    label: "INFRASTRUCTURE & DEFENSE",
    color: "#7c4dff",
    domains: [
      {
        id: "infrastructure",
        label: "Infrastructure Resilience",
        icon: "\u{1F3D7}",
        color: "#7c4dff",
        colorVar: "var(--accent-purple)",
        description: "Undersea cable systems, Red Sea exposure, Telecom Egypt/Orange Marine",
        hasData: true,
        dataset: "main",
      },
      {
        id: "defense-isr",
        label: "Defense & ISR",
        icon: "\u{1F6E1}️",
        color: "#00e676",
        colorVar: "var(--accent-green)",
        description: "Drone swarms, SATCOM, ISR fusion, chip embargo, secure compute, kill chain",
        hasData: true,
        dataset: "athena",
      },
    ],
  },
  {
    label: "MACRO IMPACT",
    color: "#40c4ff",
    domains: [
      {
        id: "macro-labor",
        label: "Labor, Growth & Housing",
        icon: "\u{1F4CA}",
        color: "#40c4ff",
        colorVar: "var(--accent-cyan)",
        description: "Nonfarm payrolls, unemployment, wages, JOLTS, GDP, retail sales, industrial production, ISM PMI, housing",
        hasData: true,
        dataset: "main",
      },
      {
        id: "macro-inflation",
        label: "Inflation & Policy",
        icon: "\u{1F4B9}",
        color: "#ff80ab",
        colorVar: "var(--accent-pink)",
        description: "CPI/PPI/PCE inflation, breakeven expectations, Fed funds rate, SOFR, Fed policy transmission",
        hasData: true,
        dataset: "main",
      },
    ],
  },
  {
    label: "LIFE SCIENCES",
    color: "#40c4ff",
    domains: [
      {
        id: "t1d-beta-cell",
        label: "T1D β-Cell Restoration",
        icon: "\u{1F9EC}",
        color: "#40c4ff",
        colorVar: "var(--accent-blue)",
        description: "Autoimmune → β-cell loss → glycemic collapse → complications; teplizumab / stem-cell intervention paths",
        hasData: true,
        dataset: "t1d",
      },
      {
        id: "t1d-vx880",
        label: "T1D Stem-Cell Transplant (VX-880)",
        icon: "\u{1F489}",
        color: "#40c4ff",
        colorVar: "var(--accent-blue)",
        description: "Vertex VX-880 trial topology: HLA/autoantibody risk → dose + immunosuppression → engraftment → graft β-mass → MMTT / insulin-independence / severe-hypo endpoints",
        hasData: true,
        dataset: "vx880",
      },
    ],
  },
  {
    label: "FRONTIER",
    color: "#e040fb",
    domains: [
      {
        id: "frontier-science",
        label: "Frontier Science",
        icon: "⚛️",
        color: "#e040fb",
        colorVar: "var(--accent-magenta)",
        description: "Post-Standard Model physics, neutrino frontier, quantum gravity, dark sector detection",
        // 6 placeholder nodes shipped in graph-data.ts with
        // dataStatus: "blank-needs-data" — UI shows the "DATA NEEDED"
        // badge per node. Activation pattern (drop physics data + wire
        // NODE_TIMESERIES_MAP entries) is documented inline in
        // graph-data.ts above the fs_* node block.
        hasData: true,
        dataset: "main",
      },
    ],
  },
];

// Flat list for export (used by HeaderBar etc.)
export const DOMAIN_CARDS = DOMAIN_GROUPS.flatMap((g) => g.domains);

/**
 * Maps DomainSelector IDs → graph-node `domain` field values.
 * A selector ID can match multiple node-domain strings.
 *
 * Lives next to DOMAIN_CARDS / DOMAIN_GROUPS because it's the third leg
 * of the catalog: card definition (DOMAIN_CARDS), group structure
 * (DOMAIN_GROUPS), and the projection from card.id onto the raw
 * `n.domain` strings present in the loaded graph data. Earlier this
 * lived inside `hooks/useFilteredGraph.ts`, which forced anyone wanting
 * to colour-resolve a node by domain to import a hook module just for
 * a static map.
 *
 * `useFilteredGraph` re-exports this so existing callers keep working.
 */
export const DOMAIN_MAP: Record<string, string[]> = {
  "energy-systems": ["Saudi Aramco Energy", "QatarEnergy LNG"],
  "manufacturing": ["QAFCO Fertilizer", "Ma'aden Phosphate"],
  "financial-contagion": ["Financial Contagion"],
  "sovereign-risk": ["Sovereign Risk"],
  "supply-chain": ["Supply Chain Food Security"],
  "infrastructure": ["Undersea Cable Infrastructure"],
  "macro-labor": ["Macro Impact: Labor, Growth & Housing"],
  "macro-inflation": ["Macro Impact: Inflation & Policy"],
  "defense-isr": [
    "Drone Swarms",
    "SATCOM",
    "ISR Fusion",
    "Chip Embargo",
    "Secure Compute",
    "Kill Chain",
  ],
  "frontier-science": ["Frontier Science"],
  "t1d-beta-cell": [
    "T1D Autoimmune",
    "T1D β-cell Biology",
    "T1D Metabolic",
    "T1D Intervention",
    "T1D Complications",
  ],
  "t1d-vx880": ["T1D VX-880"],
};

/**
 * Reverse lookup: raw `n.domain` string → the DomainCard whose mapped
 * raw-domain set contains it. Built once at module load. O(1) lookup.
 *
 * Used by the canvas color resolver below so every node renders with
 * its card.color — matching the bottom-left domain panel's card-rolled
 * row colour. Earlier the canvas used `getCategoryColor(node.category)`
 * (per-category palette) which had no relationship to the card colour
 * shown in the panel; clicking a card row could highlight orbs that
 * rendered in a totally different colour.
 */
const DOMAIN_TO_CARD: Map<string, DomainCard> = (() => {
  const m = new Map<string, DomainCard>();
  const cardById = new Map(DOMAIN_CARDS.map((c) => [c.id, c]));
  for (const [cardId, rawDomains] of Object.entries(DOMAIN_MAP)) {
    const card = cardById.get(cardId);
    if (!card) continue;
    for (const raw of rawDomains) m.set(raw, card);
  }
  return m;
})();

/**
 * Returns the card color for a raw `n.domain` string, or undefined if
 * the domain doesn't belong to any catalog card (cross-domain
 * connectors like "Geopolitical" / "Energy Grid" fall through).
 *
 * Consumers: 2D / 3D / Map node renderers and the bottom-left domain
 * panel use this so colours stay consistent across surfaces.
 */
export function getDomainCardColor(rawDomain: string): string | undefined {
  return DOMAIN_TO_CARD.get(rawDomain)?.color;
}
