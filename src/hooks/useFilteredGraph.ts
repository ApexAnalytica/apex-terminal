import { useMemo } from "react";
import { useApexStore } from "@/stores/useApexStore";
import type { CausalGraph } from "@/lib/types";

/**
 * Maps DomainSelector IDs → graph node `domain` field values.
 * A selector ID can match multiple graph domains.
 */
const DOMAIN_MAP: Record<string, string[]> = {
  "financial-contagion": ["Dollar Funding"],
  "supply-chain": ["EUV Lithography"],
  "sovereign-risk": ["Geopolitical"],
  "infrastructure": ["Data Centers", "Undersea Cables"],
  "ai-systems": ["AI Compute"],
  "energy-systems": ["HVDC Power", "Energy Grid", "Rare Earth"],
  "manufacturing": ["Fertilizer"],
  "frontier-science": ["Frontier Science"],
};

/**
 * Returns graph data filtered to only the domains selected in the
 * DomainSelector. If no domains are selected, returns the full graph.
 */
export function useFilteredGraph(): CausalGraph {
  const graphData = useApexStore((s) => s.graphData);
  const selectedDomains = useApexStore((s) => s.selectedDomains);

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
