// Domain-card ID → raw node.domain strings. Lives in its own file (~30
// LOC) so `useFilteredGraph` (used by every critical-path component:
// RiskPropagationFlow, StructuralMetrics, NodeInspector, CausalDAG2D/3D/
// Map/Relief, etc.) doesn't transitively pull the 333-LOC `domains.ts`
// — which carries DOMAIN_GROUPS (~170 LOC of full domain-card metadata),
// PERSONAS / PERSONA_GROUPS, and the DOMAIN_TO_CARD reverse-lookup —
// just to filter node sets by selected domain group.
//
// `domains.ts` re-imports this map so DOMAIN_TO_CARD stays in sync.
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
  // AI Safety / IDS — continual-learning intrusion detection substrate
  // from Ghauri 2025 D.Eng. dissertation. 17 nodes (3 datasets, 9 attack
  // classes, 5 IDS components) all carry domain "AI Safety / IDS".
  "ai-safety-ids": ["AI Safety / IDS"],
};
