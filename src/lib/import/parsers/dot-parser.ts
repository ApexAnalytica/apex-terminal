import { ParsedGraph, RawNode, RawEdge } from "../types";

/**
 * Parse DOT attribute brackets: [key=value, key="value", ...]
 */
function parseAttributes(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  // Match key=value or key="value" pairs
  const re = /(\w+)\s*=\s*(?:"([^"]*)"|([\w.+-]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrStr)) !== null) {
    attrs[m[1]] = m[2] ?? m[3];
  }
  return attrs;
}

function coerce(val: string): string | number | boolean {
  if (val.toLowerCase() === "true") return true;
  if (val.toLowerCase() === "false") return false;
  const num = Number(val);
  if (!isNaN(num) && val !== "") return num;
  return val;
}

export function parseDOT(content: string): ParsedGraph {
  const warnings: string[] = [];

  // Strip comments (// and /* */)
  const cleaned = content
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  // Check for digraph/graph wrapper
  const graphMatch = cleaned.match(/(?:di)?graph\s+(?:"[^"]*"|\w+)?\s*\{([\s\S]*)\}/);
  if (!graphMatch) {
    return {
      nodes: [],
      edges: [],
      format: "dot",
      warnings: ["Could not find a graph { ... } block in DOT file"],
    };
  }
  const body = graphMatch[1];

  // Check for subgraphs (unsupported)
  if (/subgraph\s/i.test(body)) {
    warnings.push("Subgraphs detected but not supported — subgraph structure will be ignored");
  }

  const nodes: RawNode[] = [];
  const edges: RawEdge[] = [];
  const declaredNodeIds = new Set<string>();

  // Split on semicolons and newlines
  const statements = body.split(/[;\n]/).map((s) => s.trim()).filter(Boolean);

  for (const stmt of statements) {
    // Skip graph-level attributes (e.g., rankdir=LR)
    if (/^\w+\s*=/.test(stmt) && !stmt.includes("->") && !stmt.includes("--")) {
      continue;
    }
    // Skip node/edge/graph attribute defaults
    if (/^(node|edge|graph)\s*\[/.test(stmt)) {
      continue;
    }

    // Edge: a -> b or a -- b
    const edgeMatch = stmt.match(
      /^"?(\w+)"?\s*(?:->|--)\s*"?(\w+)"?\s*(?:\[(.*)\])?/
    );
    if (edgeMatch) {
      const source = edgeMatch[1];
      const target = edgeMatch[2];
      const attrs = edgeMatch[3] ? parseAttributes(edgeMatch[3]) : {};

      const raw: RawEdge = { source, target };
      for (const [k, v] of Object.entries(attrs)) {
        (raw as Record<string, unknown>)[k] = coerce(v);
      }
      if (!raw.id) {
        raw.id = `${source}_${target}`;
      }
      edges.push(raw);
      // Implicitly declare nodes
      declaredNodeIds.add(source);
      declaredNodeIds.add(target);
      continue;
    }

    // Node declaration: nodeId [attrs]
    const nodeMatch = stmt.match(/^"?(\w+)"?\s*(?:\[(.*)\])?$/);
    if (nodeMatch) {
      const nodeId = nodeMatch[1];
      const attrs = nodeMatch[2] ? parseAttributes(nodeMatch[2]) : {};

      const raw: RawNode = { id: nodeId };
      for (const [k, v] of Object.entries(attrs)) {
        (raw as Record<string, unknown>)[k] = coerce(v);
      }
      nodes.push(raw);
      declaredNodeIds.add(nodeId);
    }
  }

  // Create implicit node entries for nodes referenced in edges but not declared
  const explicitIds = new Set(nodes.map((n) => n.id));
  for (const id of declaredNodeIds) {
    if (!explicitIds.has(id)) {
      nodes.push({ id });
    }
  }

  warnings.push(
    `Parsed DOT: ${nodes.length} nodes, ${edges.length} edges`
  );

  return { nodes, edges, format: "dot", warnings };
}
