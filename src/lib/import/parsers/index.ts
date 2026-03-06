import * as XLSX from "xlsx";
import { ImportFormat, ParsedGraph } from "../types";
import { parseCSV, HEADER_MAP } from "./csv-parser";
import { parseJSON } from "./json-parser";
import { parseGraphML } from "./graphml-parser";
import { parseDOT } from "./dot-parser";
import { parsePDF } from "./pdf-parser";

const EXTENSION_MAP: Record<string, ImportFormat> = {
  csv: "csv",
  json: "json",
  graphml: "graphml",
  gml: "graphml",
  dot: "dot",
  gv: "dot",
  xlsx: "xlsx",
  xls: "xlsx",
  pdf: "pdf",
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

const PARSER_MAP: Record<Exclude<ImportFormat, "xlsx" | "pdf" | "csv">, (content: string) => ParsedGraph> = {
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

/**
 * Extract the best contiguous table from a raw CSV string.
 * Dashboard-style CSVs have title rows, section headers, summary rows, and
 * multiple tables with different schemas. This applies the same region-detection
 * and HEADER_MAP scoring as extractTableFromSheet().
 *
 * Returns the original content unchanged if it already looks like a clean
 * single-table CSV (first row maps well to HEADER_MAP).
 */
function extractTableFromCSV(rawCSV: string): { csv: string; warnings: string[]; extracted: boolean } {
  const warnings: string[] = [];
  const lines = rawCSV.split(/\r?\n/);

  // Quick check: if the first non-empty row already has good header coverage, skip extraction
  const firstNonEmpty = lines.findIndex((l) => l.trim() !== "");
  if (firstNonEmpty >= 0) {
    const firstFields = splitCSVFields(lines[firstNonEmpty]);
    const nonEmpty = firstFields.filter((f) => f !== "");
    let mapHits = 0;
    for (const field of nonEmpty) {
      const normalized = field.toLowerCase().replace(/[\s-]+/g, "_");
      if (normalized in HEADER_MAP) mapHits++;
    }
    // If ≥50% of non-empty first-row fields are in HEADER_MAP, it's a clean CSV
    if (nonEmpty.length >= 3 && mapHits / nonEmpty.length >= 0.5) {
      return { csv: rawCSV, warnings: [], extracted: false };
    }
  }

  // Parse all lines into cell arrays
  const rows: string[][] = lines.map((line) => splitCSVFields(line));

  // Count non-empty cells per row
  const cellCounts = rows.map((row) => row.filter((c) => c !== "").length);

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
    return { csv: rawCSV, warnings: ["No tabular regions detected in CSV"], extracted: false };
  }

  // Score each region by HEADER_MAP match quality
  function scoreRegion(region: { start: number; end: number; maxCols: number }): number {
    const headerRow = rows[region.start];
    let mapHits = 0;
    for (const cell of headerRow) {
      if (cell === "") continue;
      const normalized = cell.toLowerCase().replace(/[\s-]+/g, "_");
      if (normalized in HEADER_MAP) mapHits++;
    }
    const rowCount = region.end - region.start;
    return mapHits * 10 + rowCount;
  }

  const best = regions.reduce((a, b) => (scoreRegion(b) > scoreRegion(a) ? b : a));

  if (regions.length > 1) {
    warnings.push(
      `Found ${regions.length} table sections in CSV; extracted best match (rows ${best.start + 1}–${best.end}, ${best.end - best.start} rows)`
    );
  }

  // Extract rows for the best region
  const tableRows = rows.slice(best.start, best.end);

  // Find leading empty column offset
  let colOffset = 0;
  const headerRow = tableRows[0] || [];
  while (colOffset < headerRow.length && headerRow[colOffset] === "") {
    colOffset++;
  }

  // Find last used column
  let maxCol = 0;
  for (const row of tableRows) {
    for (let c = row.length - 1; c >= colOffset; c--) {
      if (row[c] !== "") {
        maxCol = Math.max(maxCol, c);
        break;
      }
    }
  }

  // Build clean CSV from trimmed region
  const csvLines = tableRows.map((row) => {
    const cells: string[] = [];
    for (let c = colOffset; c <= maxCol; c++) {
      const str = c < row.length ? row[c] : "";
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        cells.push('"' + str.replace(/"/g, '""') + '"');
      } else {
        cells.push(str);
      }
    }
    return cells.join(",");
  });

  return { csv: csvLines.join("\n"), warnings, extracted: true };
}

/**
 * Split a single CSV line into fields (simplified — handles quotes).
 * Used by extractTableFromCSV for region detection.
 */
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

  if (format === "pdf") {
    const buffer = await file.arrayBuffer();
    const { csv: csvText, warnings: pdfWarnings } = await parsePDF(buffer);

    if (!csvText) {
      return {
        nodes: [],
        edges: [],
        format: "pdf",
        warnings: pdfWarnings,
      };
    }

    const result = parseCSV(csvText);
    result.format = "pdf";
    result.warnings.unshift(...pdfWarnings);
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
        `Could not detect file format for "${file.name}". Supported: .csv, .json, .graphml, .gml, .dot, .gv, .xlsx, .xls, .pdf`,
      ],
    };
  }

  // For CSV, run dashboard table extraction before parsing
  if (format === "csv") {
    const { csv: cleanCSV, warnings: extractWarnings, extracted } = extractTableFromCSV(content);
    const result = parseCSV(extracted ? cleanCSV : content);
    if (extracted) {
      result.warnings.unshift(...extractWarnings);
    }
    return result;
  }

  return PARSER_MAP[format as Exclude<ImportFormat, "xlsx" | "pdf" | "csv">](content);
}
