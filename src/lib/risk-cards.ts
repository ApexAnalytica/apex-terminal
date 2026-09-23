import type { CausalGraph, CausalShock, RiskPropagationCard } from "./types";

// Pure function — takes a graph + shocks and returns the top-6 risk cards
// sorted by shock-amplified omega score. Lives in its own tiny file so
// `RiskPropagationFlow` (on the critical-path bundle) doesn't transitively
// pull the 3000-line `graph-data.ts` dataset just to call this helper.
export function buildRiskCards(
  graph: CausalGraph,
  shocks: CausalShock[],
): RiskPropagationCard[] {
  const totalSeverity = shocks.reduce((sum, s) => sum + s.severity, 0);
  const shockMultiplier = Math.min(1, totalSeverity);

  return graph.nodes
    .map((node) => ({
      nodeId: node.id,
      label: node.label,
      category: node.category,
      omegaScore: parseFloat(
        (node.omegaFragility.composite * (1 + shockMultiplier * 0.05)).toFixed(1),
      ),
      domain: node.domain,
      globalConcentration: node.globalConcentration,
    }))
    .sort((a, b) => b.omegaScore - a.omegaScore)
    .slice(0, 6);
}
