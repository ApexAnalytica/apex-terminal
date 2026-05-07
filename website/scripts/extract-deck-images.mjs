// Extracts embedded images from the v.3 pitch deck PPTX so we can identify
// and use the advisor headshots on the team page.
//
// Pipeline:
//   1. Read the Drive download (base64-wrapped JSON dropped by the MCP)
//   2. Decode the base64 PPTX bytes
//   3. Treat the PPTX as a ZIP, extract /ppt/media/* into ./extracted
//
// This script is idempotent — safe to re-run.

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TOOL_RESULT =
  "/Users/Junaid/.claude/projects/-Users-Junaid-Documents-apex-terminal--claude-worktrees-angry-kare-9bd8f1/e2953439-8563-4408-851d-f60c1272c962/tool-results/mcp-cef05c09-0879-429d-a85f-a45dc27ccdc9-download_file_content-1777599393654.txt";

const OUT_DIR = "/Users/Junaid/Documents/apex-terminal/.claude/worktrees/angry-kare-9bd8f1/website/scripts/extracted";

console.log("→ Reading tool-result JSON…");
const raw = readFileSync(TOOL_RESULT, "utf8");
const json = JSON.parse(raw);
console.log(`  mimeType=${json.mimeType} title=${json.title}`);
console.log(`  base64 length=${json.content.length}`);

const pptxBuf = Buffer.from(json.content, "base64");
console.log(`→ Decoded ${pptxBuf.length} bytes`);

const tmpPptx = join(tmpdir(), `apex-deck-${Date.now()}.pptx`);
writeFileSync(tmpPptx, pptxBuf);
console.log(`→ Wrote tmp pptx: ${tmpPptx}`);

mkdirSync(OUT_DIR, { recursive: true });
// Extract everything under ppt/media (images live there in pptx)
console.log("→ Unzipping ppt/media/* …");
try {
  execSync(`unzip -o -j "${tmpPptx}" "ppt/media/*" -d "${OUT_DIR}"`, {
    stdio: "inherit",
  });
} catch (e) {
  console.error("unzip failed:", e.message);
  process.exit(1);
}

console.log(`✓ Done. Files in ${OUT_DIR}`);
