import { ParsedGraph, RawNode, RawEdge } from "../types";

export function parseGraphML(content: string): ParsedGraph {
  const warnings: string[] = [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(content, "text/xml");

  // Check for parse errors
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    return {
      nodes: [],
      edges: [],
      format: "graphml",
      warnings: [`XML parse error: ${parseError.textContent?.slice(0, 200)}`],
    };
  }

  // Build key map: key id → attr.name (or key id itself)
  const keyMap = new Map<string, string>();
  doc.querySelectorAll("key").forEach((k) => {
    const id = k.getAttribute("id") ?? "";
    const name = k.getAttribute("attr.name") ?? id;
    keyMap.set(id, name);
  });

  // Parse nodes
  const nodes: RawNode[] = [];
  doc.querySelectorAll("node").forEach((el) => {
    const raw: RawNode = { id: el.getAttribute("id") ?? undefined };
    el.querySelectorAll(":scope > data").forEach((d) => {
      const key = d.getAttribute("key") ?? "";
      const attrName = keyMap.get(key) ?? key;
      const val = d.textContent?.trim() ?? "";

      // Try numeric coercion
      const num = Number(val);
      if (!isNaN(num) && val !== "") {
        (raw as Record<string, unknown>)[attrName] = num;
      } else if (val.toLowerCase() === "true") {
        (raw as Record<string, unknown>)[attrName] = true;
      } else if (val.toLowerCase() === "false") {
        (raw as Record<string, unknown>)[attrName] = false;
      } else {
        (raw as Record<string, unknown>)[attrName] = val;
      }
    });
    nodes.push(raw);
  });

  // Parse edges
  const edges: RawEdge[] = [];
  doc.querySelectorAll("edge").forEach((el) => {
    const raw: RawEdge = {
      id: el.getAttribute("id") ?? undefined,
      source: el.getAttribute("source") ?? undefined,
      target: el.getAttribute("target") ?? undefined,
    };
    el.querySelectorAll(":scope > data").forEach((d) => {
      const key = d.getAttribute("key") ?? "";
      const attrName = keyMap.get(key) ?? key;
      const val = d.textContent?.trim() ?? "";

      const num = Number(val);
      if (!isNaN(num) && val !== "") {
        (raw as Record<string, unknown>)[attrName] = num;
      } else if (val.toLowerCase() === "true") {
        (raw as Record<string, unknown>)[attrName] = true;
      } else if (val.toLowerCase() === "false") {
        (raw as Record<string, unknown>)[attrName] = false;
      } else {
        (raw as Record<string, unknown>)[attrName] = val;
      }
    });
    edges.push(raw);
  });

  warnings.push(
    `Parsed GraphML: ${nodes.length} nodes, ${edges.length} edges, ${keyMap.size} attribute keys`
  );

  return { nodes, edges, format: "graphml", warnings };
}
