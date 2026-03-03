import { ParsedGraph, RawNode, RawEdge } from "../types";

export function parseJSON(content: string): ParsedGraph {
  const warnings: string[] = [];
  let data: unknown;

  try {
    data = JSON.parse(content);
  } catch {
    return { nodes: [], edges: [], format: "json", warnings: ["Invalid JSON"] };
  }

  let nodes: RawNode[] = [];
  let edges: RawEdge[] = [];

  if (Array.isArray(data)) {
    // Array of objects — detect if nodes or edges
    const first = data[0];
    if (first && typeof first === "object" && "source" in first && "target" in first) {
      edges = data as RawEdge[];
      warnings.push("Detected array of edges (no nodes in file)");
    } else {
      nodes = data as RawNode[];
      warnings.push("Detected array of nodes (no edges in file)");
    }
  } else if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;

    if ("nodes" in obj && Array.isArray(obj.nodes)) {
      nodes = obj.nodes as RawNode[];
    }
    if ("edges" in obj && Array.isArray(obj.edges)) {
      edges = obj.edges as RawEdge[];
    }

    if (nodes.length === 0 && edges.length === 0) {
      warnings.push(
        "JSON object has no 'nodes' or 'edges' arrays. Expected { nodes: [...], edges: [...] }"
      );
    }
  } else {
    warnings.push("Unexpected JSON structure. Expected an object or array.");
  }

  return { nodes, edges, format: "json", warnings };
}
