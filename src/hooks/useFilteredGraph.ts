import { useMemo } from "react";
import { useApexStore } from "@/stores/useApexStore";
import { useTemporalGraph } from "./useTemporalGraph";
import type { CausalGraph } from "@/lib/types";
// DOMAIN_MAP lives in its own lightweight file so this hook (used by
// every critical-path component with a filtered-graph view) doesn't
// drag the full 333-LOC `domains.ts` catalog into the eager bundle.
import { DOMAIN_MAP } from "@/lib/domain-map";

// Re-exported so existing callers (DAGOverlay, dataset tests, etc.)
// don't break.
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

      // Cross-domain connector inclusion used to do `nodes.find()` twice
      // for every edge inside a 2-iteration outer loop, i.e. O(C·E·N) per
      // call. With ~350 nodes / ~350 edges and 13+ consumers calling this
      // hook on first render, that landed several million ops squarely on
      // the LAUNCH WORKSPACE frame. Build an id→domain map once and the
      // whole block drops to O(N + C·E).
      const domainById = new Map<string, string>();
      for (const n of nodes) domainById.set(n.id, n.domain);

      const crossDomainNodes = ["Geopolitical", "Energy Grid"];
      for (const cd of crossDomainNodes) {
        if (!allowedDomains.has(cd)) {
          const hasCrossEdge = edges.some((e) => {
            const srcDomain = domainById.get(e.source);
            const tgtDomain = domainById.get(e.target);
            if (!srcDomain || !tgtDomain) return false;
            return (
              (srcDomain === cd && allowedDomains.has(tgtDomain)) ||
              (tgtDomain === cd && allowedDomains.has(srcDomain))
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
