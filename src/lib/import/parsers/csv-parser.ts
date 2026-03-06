import { ParsedGraph, RawNode, RawEdge } from "../types";

/**
 * Parse a single CSV row respecting quoted fields.
 */
function splitCSVRow(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Try to parse a value as number or boolean, otherwise return string.
 */
function coerceValue(val: string): string | number | boolean {
  if (val === "") return val;
  if (val.toLowerCase() === "true") return true;
  if (val.toLowerCase() === "false") return false;
  const num = Number(val);
  if (!isNaN(num) && val !== "") return num;
  return val;
}

// Header aliases → canonical field name
export const HEADER_MAP: Record<string, string> = {
  id: "id",
  node_id: "id",
  nodeid: "id",
  risk_id: "id",
  edge_id: "id",
  flow_id: "id",
  link_id: "id",
  record_id: "id",
  label: "label",
  name: "label",
  entity_name: "label",
  node_name: "label",
  title: "label",
  description: "label",
  company: "label",
  firm: "label",
  supplier: "label",
  manufacturer: "label",
  entity: "label",
  organization: "label",
  supply_chain_stage: "label",
  process: "label",
  material: "label",
  component: "label",
  short_label: "shortLabel",
  shortlabel: "shortLabel",
  category: "category",
  type: "type",
  role: "category",
  group: "category",
  class: "category",
  kind: "category",
  activity: "category",
  sector: "category",
  tier: "category",
  stage: "category",
  domain: "domain",
  country: "domain",
  region: "domain",
  location: "domain",
  city: "domain",
  source: "source",
  from: "source",
  origin: "source",
  origin_node: "source",
  src: "source",
  src_node: "source",
  from_node: "source",
  target: "target",
  to: "target",
  destination: "target",
  destination_node: "target",
  dest: "target",
  dest_node: "target",
  dst: "target",
  to_node: "target",
  weight: "weight",
  lag: "lag",
  confidence: "confidence",
  discovery_source: "discoverySource",
  discoverysource: "discoverySource",
  composite: "composite",
  omega: "composite",
  omega_fragility: "composite",
  substitution_friction: "substitutionFriction",
  downstream_load: "downstreamLoad",
  cascading_voltage: "cascadingVoltage",
  existential_tail_weight: "existentialTailWeight",
  global_concentration: "globalConcentration",
  replacement_time: "replacementTime",
  capacity: "physicalConstraint",
  notes: "physicalConstraint",
  key_non_china_alternatives: "physicalConstraint",
  alternatives: "physicalConstraint",
  physical_constraint: "physicalConstraint",
  china_share: "globalConcentration",
  "china_share_%": "globalConcentration",
  concentration: "globalConcentration",
  weighted_exposure: "globalConcentration",
  risk_weight: "weight",
  trend: "replacementTime",
  "non_china_capacity_%": "replacementTime",
  physical_mechanism: "physicalMechanism",
  is_confounded: "isConfounded",
  is_restricted: "isRestricted",
  is_inconsistent: "isInconsistent",
};

export function parseCSV(content: string): ParsedGraph {
  const warnings: string[] = [];
  const lines = content.split(/\r?\n/).filter((l) => l.trim() !== "");

  if (lines.length < 2) {
    return {
      nodes: [],
      edges: [],
      format: "csv",
      warnings: ["CSV file has no data rows"],
    };
  }

  // Parse headers
  const rawHeaders = splitCSVRow(lines[0]);
  const headers = rawHeaders.map((h) => {
    const normalized = h.toLowerCase().replace(/[\s-]+/g, "_");
    return HEADER_MAP[normalized] ?? normalized;
  });

  // Heuristic fallback: for key fields still missing, scan unmapped columns
  const heuristicRules: {
    canonical: string;
    patterns: RegExp[];
  }[] = [
    { canonical: "id", patterns: [/_id$/] },
    { canonical: "label", patterns: [/(^|_)(name|label|title|description)(_|$)/] },
    { canonical: "source", patterns: [/(^|_)(origin|src|from|source)(_|$)/] },
    { canonical: "target", patterns: [/(^|_)(dest|dst|to|target|destination)(_|$)/] },
    { canonical: "category", patterns: [/(^|_)(category|type|role|class|kind|group)(_|$)/] },
  ];

  for (const rule of heuristicRules) {
    if (headers.includes(rule.canonical)) continue; // already resolved
    for (let i = 0; i < headers.length; i++) {
      const normalized = rawHeaders[i].toLowerCase().replace(/[\s-]+/g, "_");
      // Skip columns already mapped by HEADER_MAP
      if (normalized in HEADER_MAP) continue;
      if (rule.patterns.some((p) => p.test(normalized))) {
        warnings.push(
          `Heuristic: mapped column "${rawHeaders[i]}" → ${rule.canonical}`
        );
        headers[i] = rule.canonical;
        break; // first match wins
      }
    }
  }

  const unmapped = rawHeaders.filter(
    (h, i) => {
      const normalized = h.toLowerCase().replace(/[\s-]+/g, "_");
      return !(normalized in HEADER_MAP) && headers[i] === normalized;
    }
  );
  if (unmapped.length > 0) {
    warnings.push(`Unmapped columns (kept as-is): ${unmapped.join(", ")}`);
  }

  // Detect edge vs node rows
  const isEdgeFile = headers.includes("source") && headers.includes("target");

  // Parse data rows
  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCSVRow(lines[i]);
    const row: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      if (idx < values.length) {
        row[h] = coerceValue(values[idx]);
      }
    });
    rows.push(row);
  }

  if (isEdgeFile) {
    const edges: RawEdge[] = rows as RawEdge[];
    warnings.push(
      `Detected edge file (${edges.length} rows) — 'source' and 'target' columns found`
    );
    return { nodes: [], edges, format: "csv", warnings };
  }

  // Node file — hoist omega sub-fields into omegaFragility object
  const nodes: RawNode[] = rows.map((row) => {
    const node = { ...row } as RawNode;
    const composite = row.composite as number | undefined;
    const sf = row.substitutionFriction as number | undefined;
    const dl = row.downstreamLoad as number | undefined;
    const cv = row.cascadingVoltage as number | undefined;
    const etw = row.existentialTailWeight as number | undefined;

    if (
      composite !== undefined ||
      sf !== undefined ||
      dl !== undefined ||
      cv !== undefined ||
      etw !== undefined
    ) {
      node.omegaFragility = {
        ...(composite !== undefined && { composite }),
        ...(sf !== undefined && { substitutionFriction: sf }),
        ...(dl !== undefined && { downstreamLoad: dl }),
        ...(cv !== undefined && { cascadingVoltage: cv }),
        ...(etw !== undefined && { existentialTailWeight: etw }),
      };
      // Remove hoisted fields from top level
      delete (node as Record<string, unknown>).composite;
      delete (node as Record<string, unknown>).substitutionFriction;
      delete (node as Record<string, unknown>).downstreamLoad;
      delete (node as Record<string, unknown>).cascadingVoltage;
      delete (node as Record<string, unknown>).existentialTailWeight;
    }
    return node;
  });

  warnings.push(`Detected node file (${nodes.length} rows)`);
  return { nodes, edges: [], format: "csv", warnings };
}
