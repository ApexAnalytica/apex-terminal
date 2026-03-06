import type { TextItem } from "pdfjs-dist/types/src/display/api";

const MAX_PAGES = 50;
const Y_TOLERANCE = 3; // px — items within this vertical distance are same row
const MIN_TABLE_COLS = 3;
const FILL_THRESHOLD = 0.5; // row must fill ≥50% of columns to count

interface PositionedText {
  text: string;
  x: number;
  y: number;
}

/**
 * Parse a PDF buffer, extract the best tabular region, and return CSV.
 * Follows the XLSX binary pattern: ArrayBuffer → structured data → CSV string.
 */
export async function parsePDF(
  buffer: ArrayBuffer
): Promise<{ csv: string; warnings: string[] }> {
  const warnings: string[] = [];

  // Use legacy build to avoid Turbopack worker issues
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
  const totalPages = doc.numPages;

  if (totalPages > MAX_PAGES) {
    warnings.push(
      `PDF has ${totalPages} pages; only the first ${MAX_PAGES} were scanned.`
    );
  }

  // ── 1. Extract all positioned text items ──────────────────────────
  const items: PositionedText[] = [];
  let yOffset = 0;

  for (let p = 1; p <= Math.min(totalPages, MAX_PAGES); p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    for (const item of content.items) {
      if (!("str" in item) || !(item as TextItem).str.trim()) continue;
      const ti = item as TextItem;
      const tx = ti.transform[4]; // x position
      const ty = ti.transform[5]; // y position (PDF bottom-up)
      items.push({
        text: ti.str.trim(),
        x: Math.round(tx),
        y: Math.round(viewport.height - ty + yOffset), // flip to top-down
      });
    }

    yOffset += viewport.height;
  }

  if (items.length === 0) {
    warnings.push(
      "No extractable text found. This may be a scanned/image-based PDF."
    );
    return { csv: "", warnings };
  }

  // ── 2. Cluster into rows by y-coordinate ──────────────────────────
  items.sort((a, b) => a.y - b.y || a.x - b.x);

  const rows: PositionedText[][] = [];
  let currentRow: PositionedText[] = [items[0]];
  let currentY = items[0].y;

  for (let i = 1; i < items.length; i++) {
    if (Math.abs(items[i].y - currentY) <= Y_TOLERANCE) {
      currentRow.push(items[i]);
    } else {
      currentRow.sort((a, b) => a.x - b.x);
      rows.push(currentRow);
      currentRow = [items[i]];
      currentY = items[i].y;
    }
  }
  currentRow.sort((a, b) => a.x - b.x);
  rows.push(currentRow);

  // ── 3. Detect column boundaries via x-coordinate gap clustering ───
  const allX = items.map((it) => it.x).sort((a, b) => a - b);
  const columnEdges: number[] = [allX[0]];

  // Find gaps between x positions; a gap > median text width signals a column break
  const gaps: { pos: number; size: number }[] = [];
  for (let i = 1; i < allX.length; i++) {
    const gap = allX[i] - allX[i - 1];
    if (gap > 0) gaps.push({ pos: allX[i], size: gap });
  }

  if (gaps.length === 0) {
    warnings.push("Could not detect table column structure in PDF.");
    return { csv: "", warnings };
  }

  gaps.sort((a, b) => a.size - b.size);
  const medianGap = gaps[Math.floor(gaps.length / 2)].size;
  const colGapThreshold = Math.max(medianGap * 2, 20);

  for (const g of gaps) {
    if (g.size >= colGapThreshold) {
      columnEdges.push(g.pos);
    }
  }
  columnEdges.sort((a, b) => a - b);

  const numCols = columnEdges.length;
  if (numCols < MIN_TABLE_COLS) {
    warnings.push(
      `Only ${numCols} column(s) detected; need at least ${MIN_TABLE_COLS} for a table.`
    );
    return { csv: "", warnings };
  }

  // ── 4. Assign each text item to its nearest column ────────────────
  function nearestCol(x: number): number {
    let best = 0;
    let bestDist = Math.abs(x - columnEdges[0]);
    for (let c = 1; c < columnEdges.length; c++) {
      const dist = Math.abs(x - columnEdges[c]);
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }
    return best;
  }

  const gridRows: string[][] = rows.map((row) => {
    const cells = new Array<string>(numCols).fill("");
    for (const item of row) {
      const col = nearestCol(item.x);
      cells[col] = cells[col] ? cells[col] + " " + item.text : item.text;
    }
    return cells;
  });

  // ── 5. Find best table region — longest run with ≥50% cols filled ─
  const filled = gridRows.map(
    (cells) => cells.filter((c) => c !== "").length / numCols >= FILL_THRESHOLD
  );

  let bestStart = 0;
  let bestLen = 0;
  let runStart = -1;

  for (let i = 0; i < filled.length; i++) {
    if (filled[i]) {
      if (runStart === -1) runStart = i;
    } else if (runStart !== -1) {
      const len = i - runStart;
      if (len > bestLen) {
        bestStart = runStart;
        bestLen = len;
      }
      runStart = -1;
    }
  }
  if (runStart !== -1) {
    const len = filled.length - runStart;
    if (len > bestLen) {
      bestStart = runStart;
      bestLen = len;
    }
  }

  if (bestLen < 2) {
    warnings.push(
      "No contiguous table region found (need at least 2 qualifying rows)."
    );
    return { csv: "", warnings };
  }

  const tableRegions = filled.reduce((acc, f, i) => {
    if (f && (i === 0 || !filled[i - 1])) acc++;
    return acc;
  }, 0);
  if (tableRegions > 1) {
    warnings.push(
      `Found ${tableRegions} table-like regions; extracted the largest (${bestLen} rows).`
    );
  }

  // ── 6. Build CSV output ───────────────────────────────────────────
  const tableRows = gridRows.slice(bestStart, bestStart + bestLen);
  const csvLines = tableRows.map((cells) =>
    cells
      .map((c) => {
        if (c.includes(",") || c.includes('"') || c.includes("\n")) {
          return '"' + c.replace(/"/g, '""') + '"';
        }
        return c;
      })
      .join(",")
  );

  return { csv: csvLines.join("\n"), warnings };
}
