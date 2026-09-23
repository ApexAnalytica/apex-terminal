// Find which images on which slides are advisor headshots.

import { readFileSync, mkdirSync, writeFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const TOOL_RESULT =
  "/Users/Junaid/.claude/projects/-Users-Junaid-Documents-apex-terminal--claude-worktrees-angry-kare-9bd8f1/e2953439-8563-4408-851d-f60c1272c962/tool-results/mcp-cef05c09-0879-429d-a85f-a45dc27ccdc9-download_file_content-1777599393654.txt";

// Stable working dir so we can debug after the script exits.
const WORK = "/Users/Junaid/Documents/apex-terminal/.claude/worktrees/angry-kare-9bd8f1/website/scripts/pptx-work";
if (existsSync(WORK)) rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

const json = JSON.parse(readFileSync(TOOL_RESULT, "utf8"));
const pptxBuf = Buffer.from(json.content, "base64");
const tmpPptx = join(WORK, "deck.pptx");
writeFileSync(tmpPptx, pptxBuf);
console.log(`Wrote pptx (${pptxBuf.length} bytes)`);

execSync(`unzip -o -q "${tmpPptx}" -d "${WORK}"`);
console.log(`Extracted into ${WORK}`);

const slidesDir = join(WORK, "ppt/slides");
const relsDir = join(WORK, "ppt/slides/_rels");
const slideFiles = readdirSync(slidesDir).filter((f) => f.endsWith(".xml")).sort();
console.log(`${slideFiles.length} slides found`);

const targets = ["Igusa", "Pita", "Telukdarie", "Brynna", "Junaid", "Korpas"];

// Aggressive text extraction: pull ALL text inside any <a:t> tag
function extractText(xml) {
  return [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(" | ");
}

for (const slideFile of slideFiles) {
  const xml = readFileSync(join(slidesDir, slideFile), "utf8");
  const text = extractText(xml);
  const hits = targets.filter((t) => text.includes(t));
  if (hits.length === 0) continue;

  console.log(`\n=== ${slideFile} ===`);
  console.log(`  hits: ${hits.join(", ")}`);
  console.log(`  text excerpt: ${text.slice(0, 220)}`);

  // Read companion rels
  const relsPath = join(relsDir, `${slideFile}.rels`);
  if (!existsSync(relsPath)) { console.log("  (no rels)"); continue; }
  const rels = readFileSync(relsPath, "utf8");

  // Map embed IDs → media filenames
  const embedToFile = {};
  for (const m of rels.matchAll(/Id="([^"]+)"\s+Type="[^"]+"\s+Target="\.\.\/media\/([^"]+)"/g)) {
    embedToFile[m[1]] = m[2];
  }

  // Each <p:pic> has a name and an r:embed
  const picBlocks = [...xml.matchAll(/<p:pic[\s\S]*?<\/p:pic>/g)];
  console.log(`  ${picBlocks.length} pic blocks`);
  for (const pb of picBlocks) {
    const block = pb[0];
    const name = (block.match(/<p:cNvPr[^/]*name="([^"]+)"/) || [])[1] || "(unnamed)";
    const embed = (block.match(/r:embed="([^"]+)"/) || [])[1] || "";
    const file = embedToFile[embed] || "(?)";
    console.log(`    ${name}  →  ${file}`);
  }
}
