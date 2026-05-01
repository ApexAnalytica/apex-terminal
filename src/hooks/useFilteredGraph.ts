import { useMemo } from "react";
import { useApexStore } from "@/stores/useApexStore";
import { useTemporalGraph } from "./useTemporalGraph";
import type { CausalGraph } from "@/lib/types";

/**
 * Maps DomainSelector IDs → graph node `domain` field values.
 * A selector ID can match multiple graph domains.
 *
 * Exported so tests can assert that every DomainSelector card id with
 * `hasData: true` has a corresponding entry whose values actually match
 * real node domains in the loaded dataset. Missing entries cause the
 * 3D canvas to render empty even though the dataset is loaded.
 */
export const DOMAIN_MAP: Record<string, string[]> = {
  "energy-systems": ["Saudi Aramco Energy", "QatarEnergy LNG"],
  "manufacturing": ["QAFCO Fertilizer", "Ma'aden Phosphate"],
  "financial-contagion": ["Financial Contagion"],
  "sovereign-risk": ["Sovereign Risk"],
  "supply-chain": ["Supply Chain Food Security"],
  "infrastructure": ["Undersea Cable Infrastructure"],
  // Macro Impact domains
  "macro-labor": ["Macro Impact: Labor, Growth & Housing"],
  "macro-inflation": ["Macro Impact: Inflation & Policy"],
  // Athena ISR domains
  "defense-isr": ["Drone Swarms", "SATCOM", "ISR Fusion", "Chip Embargo", "Secure Compute", "Kill Chain"],
  // Life sciences
  "t1d-beta-cell": [
    "T1D Autoimmune",
    "T1D \u03B2-cell Biology",
    "T1D Metabolic",
    "T1D Intervention",
    "T1D Complications",
  ],
  // VX-880 stem-cell islet transplant subgraph — every node in
  // t1d-vx880-graph-data.ts carries domain "T1D VX-880".
  "t1d-vx880": ["T1D VX-880"],
};

/**
 * Returns graph data filtered to only the domains selected in the
 * DomainSelector. Uses temporal graph data when timeline is scrubbed
 * (non-live), so edges/nodes reflect their historical state.
 */
export function useFilteredGraph(): CausalGraph {
  const baseGraphData = useApexStore((s) => s.graphData);
  const selectedDomains = useApexStore((s) => s.selectedDomains);
  const visibleCategories = useApexStore((s) => s.visibleCategories);
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

      // Auto-include any domain that bridges to a selected domain via at least
      // one edge — keeps cross-domain cascade paths intact instead of pruning
      // bridge nodes and making the cascade signal appear to teleport. The
      // previous hardcoded list (Geopolitical, Energy Grid) only covered
      // main-graph bridges and silently broke paths through new datasets
      // (Athena ISR, T1D, VX-880).
      const nodeDomainById = new Map(nodes.map((n) => [n.id, n.domain]));
      const bridgedDomains = new Set<string>();
      for (const e of edges) {
        const srcDomain = nodeDomainById.get(e.source);
        const tgtDomain = nodeDomainById.get(e.target);
        if (!srcDomain || !tgtDomain || srcDomain === tgtDomain) continue;
        const srcIn = allowedDomains.has(srcDomain);
        const tgtIn = allowedDomains.has(tgtDomain);
        if (srcIn && !tgtIn) bridgedDomains.add(tgtDomain);
        else if (tgtIn && !srcIn) bridgedDomains.add(srcDomain);
      }
      bridgedDomains.forEach((d) => allowedDomains.add(d));

      nodes = nodes.filter((n) => allowedDomains.has(n.domain));
    }

    // Filter by node category (empty set = show all)
    if (visibleCategories.size > 0) {
      nodes = nodes.filter((n) => visibleCategories.has(n.category));
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
  }, [graphData, selectedDomains, visibleCategories]);
}
