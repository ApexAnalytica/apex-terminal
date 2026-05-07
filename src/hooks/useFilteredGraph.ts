import { useMemo } from "react";
import { useApexStore } from "@/stores/useApexStore";
import { useTemporalGraph } from "./useTemporalGraph";
import type { CausalGraph } from "@/lib/types";
import { DOMAIN_MAP } from "@/lib/domains";

// DOMAIN_MAP now lives next to DOMAIN_CARDS / DOMAIN_GROUPS in
// `@/lib/domains`. Re-exported here so existing callers (DAGOverlay,
// dataset tests, etc.) don't break.
export { DOMAIN_MAP };

/**
 * Returns graph data filtered to only the domains selected in the
 * DomainSelector. Uses temporal graph data when timeline is scrubbed
 * (non-live), so edges/nodes reflect their historical state.
 */
export function useFilteredGraph(): CausalGraph {
  const baseGraphData = useApexStore((s) => s.graphData);
  const selectedDomains = useApexStore((s) => s.selectedDomains);
  const visibleCategories = useApexStore((s) => s.visibleCategories);
  const visibleDiscoverySources = useApexStore((s) => s.visibleDiscoverySources);
  const { graph: temporalGraph, isTemporalActive } = useTemporalGraph();

  // Use temporal graph when available and scrubbed; fall back to base
  const graphData = isTemporalActive ? temporalGraph : baseGraphData;

  return useMemo(() => {
    let nodes = graphData.nodes;
    let edges = graphData.edges;

    // Filter by domain
    if (selectedDomains.length > 0) {
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
          const hasCrossEdge = edges.some((e) => {
            const srcNode = nodes.find((n) => n.id === e.source);
            const tgtNode = nodes.find((n) => n.id === e.target);
            if (!srcNode || !tgtNode) return false;
            return (
              (srcNode.domain === cd && allowedDomains.has(tgtNode.domain)) ||
              (tgtNode.domain === cd && allowedDomains.has(srcNode.domain))
            );
          });
          if (hasCrossEdge) allowedDomains.add(cd);
        }
      }

      nodes = nodes.filter((n) => allowedDomains.has(n.domain));
    }

    // Filter by node category (empty set = show all)
    if (visibleCategories.size > 0) {
      nodes = nodes.filter((n) => visibleCategories.has(n.category));
    }

    // Filter by discovery source (empty set = show all)
    if (visibleDiscoverySources.size > 0) {
      nodes = nodes.filter((n) => visibleDiscoverySources.has(n.discoverySource));
    }

    // Rebuild edges to match remaining nodes
    const nodeIds = new Set(nodes.map((n) => n.id));
    edges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

    return {
      nodes,
      edges,
      metadata: {
        ...graphData.metadata,
        totalNodes: nodes.length,
        totalEdges: edges.length,
        density:
          nodes.length > 1
            ? edges.length / (nodes.length * (nodes.length - 1))
            : 0,
      },
    };
  }, [graphData, selectedDomains, visibleCategories, visibleDiscoverySources]);
}
