import { ImportFormat, ParsedGraph } from "../types";
import { parseCSV } from "./csv-parser";
import { parseJSON } from "./json-parser";
import { parseGraphML } from "./graphml-parser";
import { parseDOT } from "./dot-parser";

const EXTENSION_MAP: Record<string, ImportFormat> = {
  csv: "csv",
  json: "json",
  graphml: "graphml",
  gml: "graphml",
  dot: "dot",
  gv: "dot",
};

export function detectFormat(file: File): ImportFormat | null {
  // Try file extension first
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext in EXTENSION_MAP) return EXTENSION_MAP[ext];
  return null;
}

function detectFormatFromContent(content: string): ImportFormat | null {
  const trimmed = content.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
  if (trimmed.startsWith("<?xml") || trimmed.startsWith("<graphml")) return "graphml";
  if (/^(strict\s+)?(di)?graph\s/i.test(trimmed)) return "dot";
  return null;
}

const PARSER_MAP: Record<ImportFormat, (content: string) => ParsedGraph> = {
  csv: parseCSV,
  json: parseJSON,
  graphml: parseGraphML,
  dot: parseDOT,
};

export async function parseFile(file: File): Promise<ParsedGraph> {
  const content = await file.text();

  let format = detectFormat(file);
  if (!format) {
    format = detectFormatFromContent(content);
  }
  if (!format) {
    return {
      nodes: [],
      edges: [],
      format: "csv",
      warnings: [
        `Could not detect file format for "${file.name}". Supported: .csv, .json, .graphml, .gml, .dot, .gv`,
      ],
    };
  }

  return PARSER_MAP[format](content);
}
