// CausalGraph builder — pulls together the four large graph-data
// modules and merges them by selected domain. Kept in a separate
// module from `@/lib/domains` so static importers of the lighter
// catalog (HeaderBar, copilot-context, etc.) don't drag the heavy
// graph data into the critical-path bundle.
//
// Importers that legitimately need the merged graph (DomainSelector,
// DemoFlowPlayer, copilot-actions) import from here. Those code
// paths already accept the full graph-data weight.

import { MAIN_GRAPH, EMPTY_GRAPH } from "@/lib/graph-data";
import { ATHENA_GRAPH, BRIDGE_EDGES } from "@/lib/athena-graph-data";
import { T1D_GRAPH } from "@/lib/t1d-graph-data";
import { VX880_GRAPH } from "@/lib/t1d-vx880-graph-data";
import { mergeGraphs } from "@/lib/import/merge";
import type { CausalGraph } from "@/lib/types";
import { DOMAIN_CARDS, type DomainCard } from "@/lib/domains";

// Static node counts per dataset — exposed so the picker can render
// "X nodes will load" previews without forcing the data through
// `buildGraphFromDomains`. Same module → same chunk, no extra cost.
export const DATASET_NODE_COUNTS: Record<DomainCard["dataset"], number> = {
  main: MAIN_GRAPH.nodes.length,
  athena: ATHENA_GRAPH.nodes.length,
  t1d: T1D_GRAPH.nodes.length,
  vx880: VX880_GRAPH.nodes.length,
};

// Build the graph from selected domains — auto-includes the right datasets.
export function buildGraphFromDomains(domainIds: string[]): CausalGraph {
  const selectedDomains = domainIds.map((id) =>
    DOMAIN_CARDS.find((d) => d.id === id)
  ).filter(Boolean) as DomainCard[];

  const needsMain = selectedDomains.some((d) => d.dataset === "main");
  const needsAthena = selectedDomains.some((d) => d.dataset === "athena");
  const needsT1D = selectedDomains.some((d) => d.dataset === "t1d");
  const needsVX880 = selectedDomains.some((d) => d.dataset === "vx880");

  let graph: CausalGraph = { nodes: [], edges: [], metadata: EMPTY_GRAPH.metadata };

  if (needsMain) {
    const { graph: merged } = mergeGraphs(graph, { nodes: MAIN_GRAPH.nodes, edges: MAIN_GRAPH.edges });
    graph = merged;
  }
  if (needsAthena) {
    const { graph: merged } = mergeGraphs(graph, { nodes: ATHENA_GRAPH.nodes, edges: ATHENA_GRAPH.edges });
    graph = merged;
  }
  if (needsT1D) {
    const { graph: merged } = mergeGraphs(graph, { nodes: T1D_GRAPH.nodes, edges: T1D_GRAPH.edges });
    graph = merged;
  }
  if (needsVX880) {
    const { graph: merged } = mergeGraphs(graph, { nodes: VX880_GRAPH.nodes, edges: VX880_GRAPH.edges });
    graph = merged;
  }

  // When both MAIN and ATHENA are loaded, splice in the bridge edges that
  // wire civilian/energy/financial domains into the defense substrate.
  // mergeGraphs will silently skip any bridge whose endpoints aren't present.
  if (needsMain && needsAthena) {
    const { graph: merged } = mergeGraphs(graph, { nodes: [], edges: BRIDGE_EDGES });
    graph = merged;
  }

  return graph;
}
