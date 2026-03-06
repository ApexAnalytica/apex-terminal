import { ColumnMapping, DataMode } from "./types";
import { HEADER_MAP } from "./parsers/csv-parser";

/**
 * Canonical fields available for mapping, grouped for the UI.
 */
export const CANONICAL_FIELDS: { group: string; fields: { value: string; label: string }[] }[] = [
  {
    group: "Identity",
    fields: [
      { value: "id", label: "ID" },
      { value: "label", label: "Label / Name" },
      { value: "shortLabel", label: "Short Label" },
    ],
  },
  {
    group: "Classification",
    fields: [
      { value: "category", label: "Category / Type" },
      { value: "domain", label: "Domain / Region" },
      { value: "discoverySource", label: "Discovery Source" },
    ],
  },
  {
    group: "Relationships (Edges)",
    fields: [
      { value: "source", label: "Source (from)" },
      { value: "target", label: "Target (to)" },
      { value: "weight", label: "Weight" },
      { value: "lag", label: "Lag" },
      { value: "confidence", label: "Confidence" },
      { value: "physicalMechanism", label: "Physical Mechanism" },
    ],
  },
  {
    group: "Risk Metrics",
    fields: [
      { value: "composite", label: "Omega Composite" },
      { value: "substitutionFriction", label: "Substitution Friction" },
      { value: "downstreamLoad", label: "Downstream Load" },
      { value: "cascadingVoltage", label: "Cascading Voltage" },
      { value: "existentialTailWeight", label: "Existential Tail Weight" },
      { value: "globalConcentration", label: "Global Concentration" },
      { value: "replacementTime", label: "Replacement Time" },
      { value: "physicalConstraint", label: "Physical Constraint" },
    ],
  },
  {
    group: "Flags",
    fields: [
      { value: "isConfounded", label: "Is Confounded" },
      { value: "isRestricted", label: "Is Restricted" },
      { value: "isInconsistent", label: "Is Inconsistent" },
    ],
  },
];

const ALL_CANONICAL_VALUES = new Set(
  CANONICAL_FIELDS.flatMap((g) => g.fields.map((f) => f.value))
);

/**
 * Generate initial column mappings by running HEADER_MAP + heuristics.
 * Returns a mapping for each raw header, with `null` for unmapped columns.
 */
export function autoMapHeaders(rawHeaders: string[]): ColumnMapping[] {
  const used = new Set<string>();

  return rawHeaders.map((raw) => {
    const normalized = raw.toLowerCase().replace(/[\s-]+/g, "_");

    // 1. Check HEADER_MAP
    const mapped = HEADER_MAP[normalized];
    if (mapped && ALL_CANONICAL_VALUES.has(mapped) && !used.has(mapped)) {
      used.add(mapped);
      return { rawHeader: raw, canonicalField: mapped };
    }

    // 2. Heuristic regex fallback
    const heuristics: { canonical: string; patterns: RegExp[] }[] = [
      { canonical: "id", patterns: [/_id$/, /^id$/] },
      { canonical: "label", patterns: [/(^|_)(name|label|title|description)(_|$)/] },
      { canonical: "source", patterns: [/(^|_)(origin|src|from|source)(_|$)/] },
      { canonical: "target", patterns: [/(^|_)(dest|dst|to|target|destination)(_|$)/] },
      { canonical: "category", patterns: [/(^|_)(category|type|role|class|kind|group)(_|$)/] },
      { canonical: "domain", patterns: [/(^|_)(domain|country|region|location|city)(_|$)/] },
      { canonical: "weight", patterns: [/(^|_)(weight|score|strength)(_|$)/] },
    ];

    for (const rule of heuristics) {
      if (used.has(rule.canonical)) continue;
      if (rule.patterns.some((p) => p.test(normalized))) {
        used.add(rule.canonical);
        return { rawHeader: raw, canonicalField: rule.canonical };
      }
    }

    return { rawHeader: raw, canonicalField: null };
  });
}

/**
 * Detect data mode from column mappings.
 */
export function detectDataMode(mappings: ColumnMapping[]): DataMode {
  const fields = new Set(mappings.map((m) => m.canonicalField).filter(Boolean));
  if (fields.has("source") && fields.has("target")) return "edges";
  return "nodes";
}

/**
 * Rewrite CSV content using user-defined column mappings.
 * Replaces the header row with canonical field names and drops unmapped columns.
 */
export function applyColumnMapping(
  rawCSV: string,
  mappings: ColumnMapping[],
  dataMode: DataMode
): string {
  const lines = rawCSV.split(/\r?\n/);
  if (lines.length === 0) return rawCSV;

  // Indices of columns to keep (mapped ones)
  const keepIndices: number[] = [];
  const newHeaders: string[] = [];

  for (let i = 0; i < mappings.length; i++) {
    const field = mappings[i].canonicalField;
    if (field) {
      keepIndices.push(i);
      newHeaders.push(field);
    }
  }

  // For edge mode, ensure source/target are present
  if (dataMode === "edges") {
    if (!newHeaders.includes("source") || !newHeaders.includes("target")) {
      // Fall through — the parser will handle the error
    }
  }

  // Rewrite header
  const result = [newHeaders.join(",")];

  // Rewrite data rows (simple CSV — fields may be quoted)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const fields = splitCSVFields(line);
    const kept = keepIndices.map((idx) => {
      const val = idx < fields.length ? fields[idx] : "";
      // Re-quote if needed
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        return '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    });
    result.push(kept.join(","));
  }

  return result.join("\n");
}

function splitCSVFields(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
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
 * Extract raw headers and sample rows from a CSV string (for the mapper UI).
 */
export function extractCSVPreview(
  rawCSV: string,
  maxRows = 5
): { headers: string[]; sampleRows: string[][] } {
  const lines = rawCSV.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { headers: [], sampleRows: [] };

  const headers = splitCSVFields(lines[0]);
  const sampleRows = lines.slice(1, 1 + maxRows).map((l) => splitCSVFields(l));

  return { headers, sampleRows };
}
