import * as XLSX from "xlsx";
import { ImportFormat, ParsedGraph } from "../types";
import { parseCSV, HEADER_MAP } from "./csv-parser";
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
  xlsx: "xlsx",
  xls: "xlsx",
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

const PARSER_MAP: Record<Exclude<ImportFormat, "xlsx">, (content: string) => ParsedGraph> = {
  csv: parseCSV,
  json: parseJSON,
  graphml: parseGraphML,
  dot: parseDOT,
};

/**
 * Extract the largest contiguous table from a sheet.
 * Dashboard-style xlsx files have title rows, section headers, and multiple
 * tables with different schemas. This finds the biggest one and returns clean CSV.
 */
function extractTableFromSheet(sheet: XLSX.WorkSheet): { csv: string; warnings: string[] } {
  const warnings: string[] = [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: true,
  });

  // Count non-empty cells per row
  const cellCounts = rows.map((row) => {
    if (!Array.isArray(row)) return 0;
    return row.filter((c) => c != null && c !== "").length;
  });

  // Find contiguous "table regions" — runs of rows with ≥3 non-empty cells
  const MIN_COLS = 3;
  const regions: { start: number; end: number; maxCols: number }[] = [];
  let regionStart = -1;
  let maxCols = 0;

  for (let i = 0; i < cellCounts.length; i++) {
    if (cellCounts[i] >= MIN_COLS) {
      if (regionStart === -1) {
        regionStart = i;
        maxCols = cellCounts[i];
      } else {
        maxCols = Math.max(maxCols, cellCounts[i]);
      }
    } else if (regionStart !== -1) {
      regions.push({ start: regionStart, end: i, maxCols });
      regionStart = -1;
      maxCols = 0;
    }
  }
  if (regionStart !== -1) {
    regions.push({ start: regionStart, end: cellCounts.length, maxCols });
  }

  if (regions.length === 0) {
    return { csv: "", warnings: ["No tabular data found in sheet"] };
  }

  // Score each region: prefer tables whose headers match known HEADER_MAP fields.
  // This distinguishes entity tables (Supply Chain Stage, Company, Country) from
  // time-series tables (Quarter, Price, Index) in dashboard-style xlsx files.
  function scoreRegion(region: { start: number; end: number; maxCols: number }): number {
    const headerRow = rows[region.start];
    if (!Array.isArray(headerRow)) return 0;
    let mapHits = 0;
    for (const cell of headerRow) {
      if (cell == null || cell === "") continue;
      const normalized = String(cell).toLowerCase().replace(/[\s-]+/g, "_");
      if (normalized in HEADER_MAP) mapHits++;
    }
    // Weighted score: HEADER_MAP matches are worth 10 rows each,
    // so a 7-row table with 4 mapped headers (score=47) beats
    // a 10-row table with 0 mapped headers (score=10).
    const rowCount = region.end - region.start;
    return mapHits * 10 + rowCount;
  }

  const best = regions.reduce((a, b) => (scoreRegion(b) > scoreRegion(a) ? b : a));

  if (regions.length > 1) {
    warnings.push(
      `Found ${regions.length} table sections; extracted best match (rows ${best.start + 1}–${best.end}, ${best.end - best.start} rows)`
    );
  }

  // Extract rows for the best region
  const tableRows = rows.slice(best.start, best.end) as unknown[][];

  // Find the leading empty column offset (dashboard sheets often have col A empty)
  let colOffset = 0;
  const headerRow = tableRows[0] || [];
  while (colOffset < headerRow.length && (headerRow[colOffset] == null || headerRow[colOffset] === "")) {
    colOffset++;
  }

  // Find the last used column
  let maxCol = 0;
  for (const row of tableRows) {
    if (!Array.isArray(row)) continue;
    for (let c = row.length - 1; c >= colOffset; c--) {
      if (row[c] != null && row[c] !== "") {
        maxCol = Math.max(maxCol, c);
        break;
      }
    }
  }

  // Build clean CSV from the trimmed region
  const csvLines = tableRows.map((row) => {
    const cells: string[] = [];
    for (let c = colOffset; c <= maxCol; c++) {
      const val = Array.isArray(row) && c < row.length ? row[c] : "";
      const str = val == null ? "" : String(val);
      // Quote fields that contain commas, quotes, or newlines
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        cells.push('"' + str.replace(/"/g, '""') + '"');
      } else {
        cells.push(str);
      }
    }
    return cells.join(",");
  });

  return { csv: csvLines.join("\n"), warnings };
}

export async function parseFile(file: File): Promise<ParsedGraph> {
  // Handle xlsx/xls binary files before reading as text
  let format = detectFormat(file);
  if (format === "xlsx") {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const { csv: csvText, warnings: xlsxWarnings } = extractTableFromSheet(
      workbook.Sheets[sheetName]
    );

    if (!csvText) {
      return {
        nodes: [],
        edges: [],
        format: "xlsx",
        warnings: xlsxWarnings,
      };
    }

    const result = parseCSV(csvText);
    result.format = "xlsx";
    result.warnings.unshift(...xlsxWarnings);
    if (workbook.SheetNames.length > 1) {
      result.warnings.unshift(
        `Converted sheet "${sheetName}" (1 of ${workbook.SheetNames.length}). Other sheets were ignored.`
      );
    }
    return result;
  }

  const content = await file.text();

  if (!format) {
    format = detectFormatFromContent(content);
  }
  if (!format) {
    return {
      nodes: [],
      edges: [],
      format: "csv",
      warnings: [
        `Could not detect file format for "${file.name}". Supported: .csv, .json, .graphml, .gml, .dot, .gv, .xlsx, .xls`,
      ],
    };
  }

  return PARSER_MAP[format as Exclude<ImportFormat, "xlsx">](content);
}
