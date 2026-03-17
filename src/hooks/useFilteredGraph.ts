import { useMemo } from "react";
import { useApexStore } from "@/stores/useApexStore";
import { useTemporalGraph } from "./useTemporalGraph";
import type { CausalGraph } from "@/lib/types";

/**
 * Maps DomainSelector IDs → graph node `domain` field values.
 * A selector ID can match multiple graph domains.
 */
const DOMAIN_MAP: Record<string, string[]> = {
  "energy-systems": ["Saudi Aramco Energy", "QatarEnergy LNG"],
  "manufacturing": ["QAFCO Fertilizer", "Ma'aden Phosphate"],
  "financial-contagion": ["Financial Contagion", "BlackRock FX", "PIMCO EMD"],
  "sovereign-risk": ["Sovereign Risk", "Penn World Table"],
};

/**
 * Returns graph data filtered to only the domains selected in the
 * DomainSelector. Uses temporal graph data when timeline is scrubbed
 * (non-live), so edges/nodes reflect their historical state.
 */
export function useFilteredGraph(): CausalGraph {
  const baseGraphData = useApexStore((s) => s.graphData);
  const selectedDomains = useApexStore((s) => s.selectedDomains);
  const { graph: temporalGraph, isTemporalActive } = useTemporalGraph();

  // Use temporal graph when available and scrubbed; fall back to base
  const graphData = isTemporalActive ? temporalGraph : baseGraphData;

  return useMemo(() => {
    // No filter active — show everything
    if (selectedDomains.length === 0) return graphData;

    // Build set of allowed graph domain names
    const allowedDomains = new Set<string>();
    for (const selId of selectedDomains) {
      const mapped = DOMAIN_MAP[selId];
      if (mapped) mapped.forEach((d) => allowedDomains.add(d));
    }

    // Always include cross-domain connectors (Geopolitical, Energy Grid)
    // if any of their upstream/downstream domains are selected
    const crossDomainNodes = ["Geopolitical", "Energy Grid"];
    for (const cd of crossDomainNodes) {
      if (!allowedDomains.has(cd)) {
        // Check if any selected domain has edges to/from this domain
        const hasCrossEdge = graphData.edges.some((e) => {
          const srcNode = graphData.nodes.find((n) => n.id === e.source);
          const tgtNode = graphData.nodes.find((n) => n.id === e.target);
          if (!srcNode || !tgtNode) return false;
          return (
            (srcNode.domain === cd && allowedDomains.has(tgtNode.domain)) ||
            (tgtNode.domain === cd && allowedDomains.has(srcNode.domain))
          );
        });
        if (hasCrossEdge) allowedDomains.add(cd);
      }
    }

    const filteredNodes = graphData.nodes.filter((n) =>
      allowedDomains.has(n.domain)
    );
    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = graphData.edges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
    );

    return {
      nodes: filteredNodes,
      edges: filteredEdges,
      metadata: {
        ...graphData.metadata,
        totalNodes: filteredNodes.length,
        totalEdges: filteredEdges.length,
        density:
          filteredNodes.length > 1
            ? filteredEdges.length /
              (filteredNodes.length * (filteredNodes.length - 1))
            : 0,
      },
    };
  }, [graphData, selectedDomains]);
}
