#!/usr/bin/env -S npx tsx
/**
 * Session-doc bundler — concatenates every `docs/sessions/*.md` into a
 * single `docs/sessions.bundle.md` so the full session context can be
 * read offline on a phone (or any mobile markdown reader) without
 * jumping between files.
 *
 *   npx tsx scripts/export-sessions.ts
 *   npm run export:sessions
 *
 * Output starts with the routing-table README, then a generated TOC
 * with anchor links, then every scope doc inline separated by HR
 * dividers. Section ordering follows the routing-table order from the
 * README; any scope file not listed there is appended alphabetically
 * at the end (so newly-added sessions don't silently disappear).
 *
 * The bundle is committed so it's browsable directly from GitHub
 * mobile — point your phone at github.com/.../docs/sessions.bundle.md
 * and you have the whole session graph in one scroll.
 *
 * Re-run after editing any scope doc; the script is idempotent and
 * the diff is what you'd expect (one section changed).
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";

const SESSIONS_DIR = "docs/sessions";
const OUTPUT_PATH = "docs/sessions.bundle.md";
const README_NAME = "README.md";

// Extract the routing-table order from the README. The table has rows
// like `| Session | [`name.md`](./name.md) | …`; we pull every
// `./name.md` link in order so the bundle follows the same ordering
// the user already navigates by.
function routingOrderFromReadme(readmeBody: string): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  // `./name.md` inside parens. Captures the filename only.
  const re = /\.\/([\w-]+\.md)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(readmeBody)) !== null) {
    const file = m[1];
    if (file === README_NAME) continue;
    if (!seen.has(file)) {
      seen.add(file);
      order.push(file);
    }
  }
  return order;
}

function slugify(name: string): string {
  // Stable anchor — matches what GitHub generates for a top-level h2
  // built from the filename (sans .md). Strips extension, lowercases,
  // replaces non-alphanum with dashes.
  return name
    .replace(/\.md$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function readSection(file: string): string {
  return readFileSync(join(SESSIONS_DIR, file), "utf-8");
}

function main(): void {
  const files = readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith(".md"))
    .filter((f) => f !== README_NAME && f !== basename(OUTPUT_PATH));

  const readme = readSection(README_NAME);
  const ordered = routingOrderFromReadme(readme);
  const known = new Set(ordered);
  // Anything not in the routing table — append alphabetically so it
  // still surfaces.
  const trailing = files
    .filter((f) => !known.has(f))
    .sort();
  // Only include files that actually exist on disk.
  const sections = [...ordered.filter((f) => files.includes(f)), ...trailing];

  const today = new Date().toISOString().slice(0, 10);
  const parts: string[] = [];

  parts.push("# Manifold — Session Bundle");
  parts.push("");
  parts.push(
    `_Generated ${today} by \`scripts/export-sessions.ts\`. ` +
      `Re-run to refresh. Source of truth is the individual files under ` +
      `\`docs/sessions/\` — edit those, not this bundle._`,
  );
  parts.push("");
  parts.push("---");
  parts.push("");

  // README first (the routing table is genuinely useful as an intro).
  parts.push("## Session Map (README)");
  parts.push("");
  parts.push(readme.trim());
  parts.push("");
  parts.push("---");
  parts.push("");

  // Generated TOC for the inlined scope docs.
  parts.push("## Contents");
  parts.push("");
  for (const file of sections) {
    parts.push(`- [\`${file}\`](#${slugify(file)})`);
  }
  parts.push("");
  parts.push("---");
  parts.push("");

  // Each scope doc inline.
  for (const file of sections) {
    parts.push(`## ${file}`);
    parts.push("");
    parts.push(readSection(file).trim());
    parts.push("");
    parts.push("---");
    parts.push("");
  }

  writeFileSync(OUTPUT_PATH, parts.join("\n"), "utf-8");

  const totalKB = (Buffer.byteLength(parts.join("\n"), "utf-8") / 1024).toFixed(
    1,
  );
  console.log(
    `\nbundled ${sections.length} session doc${
      sections.length === 1 ? "" : "s"
    } → ${OUTPUT_PATH} (${totalKB} KB)`,
  );
  console.log(`order: ${sections.join(", ")}`);
}

main();
