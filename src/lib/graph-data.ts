import {
  CausalGraph,
  CausalNode,
  CausalEdge,
  CausalShock,
  RiskPropagationCard,
  GraphMetadata,
} from "./types";

// ─── Main Graph Nodes ────────────────────────────────────────────
const NODES: CausalNode[] = [
  {
    id: "semi_yield",
    label: "Semiconductor Yield Loss",
    shortLabel: "SYL",
    category: "manufacturing",
    riskScore: 1.0,
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },
  {
    id: "ai_compute",
    label: "AI Compute Constraint",
    shortLabel: "ACC",
    category: "infrastructure",
    riskScore: 0.85,
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },
  {
    id: "industrial_output",
    label: "Industrial Output Shock",
    shortLabel: "IOS",
    category: "economic",
    riskScore: 0.72,
    discoverySource: "PCMCI+",
    isConfounded: false,
    isRestricted: false,
  },
  {
    id: "credit_contraction",
    label: "Global Credit Contraction",
    shortLabel: "GCC",
    category: "finance",
    riskScore: 0.68,
    discoverySource: "PCMCI+",
    isConfounded: false,
    isRestricted: false,
  },
  {
    id: "dc_power",
    label: "Data Center Power Load",
    shortLabel: "DPL",
    category: "energy",
    riskScore: 0.61,
    discoverySource: "DCD",
    isConfounded: true,
    isRestricted: false,
  },
  {
    id: "banking_liquidity",
    label: "Modern Banking Liquidity",
    shortLabel: "MBL",
    category: "finance",
    riskScore: 0.55,
    discoverySource: "FCI",
    isConfounded: true,
    isRestricted: false,
  },
  {
    id: "rare_earth",
    label: "Rare Earth Supply",
    shortLabel: "RES",
    category: "manufacturing",
    riskScore: 0.48,
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },
  {
    id: "grid_stability",
    label: "Grid Stability Index",
    shortLabel: "GSI",
    category: "energy",
    riskScore: 0.42,
    discoverySource: "PCMCI+",
    isConfounded: false,
    isRestricted: true,
  },
  {
    id: "trade_policy",
    label: "Trade Policy Shock",
    shortLabel: "TPS",
    category: "geopolitical",
    riskScore: 0.38,
    discoverySource: "FCI",
    isConfounded: false,
    isRestricted: false,
  },
  {
    id: "cooling_capacity",
    label: "Cooling Capacity Limit",
    shortLabel: "CCL",
    category: "infrastructure",
    riskScore: 0.34,
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },
];

// ─── Main Graph Edges ────────────────────────────────────────────
const EDGES: CausalEdge[] = [
  { id: "e1", source: "semi_yield", target: "ai_compute", weight: 0.92, lag: 0, type: "directed", confidence: 0.95, isInconsistent: false },
  { id: "e2", source: "semi_yield", target: "industrial_output", weight: 0.78, lag: 1, type: "directed", confidence: 0.88, isInconsistent: false },
  { id: "e3", source: "ai_compute", target: "credit_contraction", weight: 0.71, lag: 1, type: "directed", confidence: 0.82, isInconsistent: false },
  { id: "e4", source: "ai_compute", target: "dc_power", weight: 0.85, lag: 0, type: "directed", confidence: 0.91, isInconsistent: false },
  { id: "e5", source: "industrial_output", target: "credit_contraction", weight: 0.65, lag: 2, type: "temporal", confidence: 0.79, isInconsistent: false },
  { id: "e6", source: "dc_power", target: "grid_stability", weight: 0.73, lag: 0, type: "directed", confidence: 0.86, isInconsistent: false },
  { id: "e7", source: "dc_power", target: "cooling_capacity", weight: 0.67, lag: 0, type: "directed", confidence: 0.84, isInconsistent: false },
  { id: "e8", source: "credit_contraction", target: "banking_liquidity", weight: 0.81, lag: 1, type: "directed", confidence: 0.77, isInconsistent: false },
  { id: "e9", source: "trade_policy", target: "rare_earth", weight: 0.69, lag: 2, type: "temporal", confidence: 0.73, isInconsistent: false },
  { id: "e10", source: "rare_earth", target: "semi_yield", weight: 0.74, lag: 1, type: "directed", confidence: 0.80, isInconsistent: false },
  { id: "e11", source: "grid_stability", target: "dc_power", weight: 0.45, lag: 0, type: "confounded", confidence: 0.62, isInconsistent: true },
  { id: "e12", source: "banking_liquidity", target: "credit_contraction", weight: 0.38, lag: 1, type: "confounded", confidence: 0.58, isInconsistent: true },
  { id: "e13", source: "trade_policy", target: "semi_yield", weight: 0.56, lag: 3, type: "temporal", confidence: 0.71, isInconsistent: false },
  { id: "e14", source: "cooling_capacity", target: "ai_compute", weight: 0.52, lag: 0, type: "directed", confidence: 0.75, isInconsistent: false },
];

const METADATA: GraphMetadata = {
  density: 0.31,
  constraintType: "DCD / NOTEARS + PCMCI+ temporal + FCI latent",
  verificationStatus: "INCONSISTENCIES_FOUND",
  totalNodes: NODES.length,
  totalEdges: EDGES.length,
  inconsistentEdges: EDGES.filter((e) => e.isInconsistent).length,
  restrictedNodes: NODES.filter((n) => n.isRestricted).length,
};

export const MAIN_GRAPH: CausalGraph = {
  nodes: NODES,
  edges: EDGES,
  metadata: METADATA,
};

// ─── DCD Sub-Graph (for Trinity Panel) ───────────────────────────
export const DCD_NODES: CausalNode[] = NODES.filter(
  (n) => n.discoverySource === "DCD" || n.discoverySource === "merged"
);
export const DCD_EDGES: CausalEdge[] = EDGES.filter(
  (e) =>
    e.type === "directed" &&
    DCD_NODES.some((n) => n.id === e.source) &&
    DCD_NODES.some((n) => n.id === e.target)
);

// ─── PCMCI+ Sub-Graph (temporal) ─────────────────────────────────
export const PCMCI_NODES: CausalNode[] = [
  NODES.find((n) => n.id === "semi_yield")!,
  NODES.find((n) => n.id === "industrial_output")!,
  NODES.find((n) => n.id === "credit_contraction")!,
  NODES.find((n) => n.id === "grid_stability")!,
  NODES.find((n) => n.id === "trade_policy")!,
];
export const PCMCI_EDGES: CausalEdge[] = EDGES.filter(
  (e) =>
    e.lag > 0 &&
    PCMCI_NODES.some((n) => n.id === e.source) &&
    PCMCI_NODES.some((n) => n.id === e.target)
);

// ─── FCI Sub-Graph (latent confounding) ──────────────────────────
export const FCI_NODES: CausalNode[] = NODES.filter(
  (n) => n.isConfounded || n.discoverySource === "FCI"
);
export const FCI_EDGES: CausalEdge[] = EDGES.filter(
  (e) =>
    e.type === "confounded" ||
    (FCI_NODES.some((n) => n.id === e.source) &&
      FCI_NODES.some((n) => n.id === e.target))
);

// ─── Risk Cards Builder ──────────────────────────────────────────
export function buildRiskCards(
  graph: CausalGraph,
  shocks: CausalShock[]
): RiskPropagationCard[] {
  const totalSeverity = shocks.reduce((sum, s) => sum + s.severity, 0);
  const shockMultiplier = Math.min(1, totalSeverity);

  return graph.nodes
    .map((node) => ({
      nodeId: node.id,
      label: node.label,
      category: node.category,
      riskPercent: Math.round(
        node.riskScore * 100 * (1 + shockMultiplier * 0.2)
      ),
    }))
    .sort((a, b) => b.riskPercent - a.riskPercent)
    .slice(0, 6);
}

// ─── Category Colors ─────────────────────────────────────────────
export function getCategoryColor(category: string): string {
  switch (category) {
    case "manufacturing": return "#00e5ff";
    case "infrastructure": return "#7c4dff";
    case "economic": return "#ffab00";
    case "finance": return "#ff6d00";
    case "energy": return "#00e676";
    case "geopolitical": return "#ff1744";
    default: return "#5a5e72";
  }
}

export function getCategoryLabel(category: string): string {
  return category.toUpperCase();
}
