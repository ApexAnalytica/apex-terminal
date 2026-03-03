import { CausalGraph, CausalNode, CausalEdge } from "@/lib/types";
import { MergeResult } from "./types";

export function mergeGraphs(
  existing: CausalGraph,
  incoming: { nodes: CausalNode[]; edges: CausalEdge[] }
): { graph: CausalGraph; result: MergeResult } {
  const existingNodeIds = new Set(existing.nodes.map((n) => n.id));
  const existingEdgeIds = new Set(existing.edges.map((e) => e.id));

  const skippedNodes: string[] = [];
  const skippedEdges: string[] = [];

  // Merge nodes
  const newNodes: CausalNode[] = [];
  for (const node of incoming.nodes) {
    if (existingNodeIds.has(node.id)) {
      skippedNodes.push(node.id);
    } else {
      newNodes.push(node);
      existingNodeIds.add(node.id); // for edge ref checks
    }
  }

  // Merge edges
  const newEdges: CausalEdge[] = [];
  for (const edge of incoming.edges) {
    if (existingEdgeIds.has(edge.id)) {
      skippedEdges.push(edge.id);
      continue;
    }
    // Skip edges referencing non-existent nodes
    if (!existingNodeIds.has(edge.source) || !existingNodeIds.has(edge.target)) {
      skippedEdges.push(edge.id);
      continue;
    }
    newEdges.push(edge);
  }

  const mergedNodes = [...existing.nodes, ...newNodes];
  const mergedEdges = [...existing.edges, ...newEdges];

  const totalNodes = mergedNodes.length;
  const totalEdges = mergedEdges.length;
  const density =
    totalNodes > 1 ? (2 * totalEdges) / (totalNodes * (totalNodes - 1)) : 0;

  const graph: CausalGraph = {
    nodes: mergedNodes,
    edges: mergedEdges,
    metadata: {
      ...existing.metadata,
      totalNodes,
      totalEdges,
      density: Math.round(density * 1000) / 1000,
      inconsistentEdges: mergedEdges.filter((e) => e.isInconsistent).length,
      restrictedNodes: mergedNodes.filter((n) => n.isRestricted).length,
      verificationStatus: newNodes.length > 0 ? "UNVERIFIED" : existing.metadata.verificationStatus,
    },
  };

  return {
    graph,
    result: {
      addedNodes: newNodes.length,
      addedEdges: newEdges.length,
      skippedNodes,
      skippedEdges,
    },
  };
}
