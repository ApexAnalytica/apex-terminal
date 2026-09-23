// scripts/sync-public-docs.mjs
//
// Copies the curated user-facing docs from `docs/` to `public/docs/`
// so they're servable as static assets by Next.js. The in-app
// DocumentationDrawer fetches from `/docs/<slug>.md` on demand and
// renders with react-markdown.
//
// Why a build-time copy (rather than reading from `docs/` directly):
// `docs/` lives outside `public/`, so Next.js's static asset
// pipeline doesn't pick it up. We could route through a custom
// webpack rule or a serverless route handler, but a literal copy is
// the lowest-magic option — works identically locally and on
// Vercel, and `public/docs/` shows up in the build manifest like
// any other asset.
//
// Curated list intentionally hand-picked: the in-app reference is
// for users, not session logs. Working notes under `docs/sessions/`
// are excluded entirely. When a new user-facing doc lands, add it
// to DOCS below.

import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

const DOCS = [
  { src: "docs/ARCHITECTURE.md", dest: "architecture.md" },
  { src: "docs/ENGINES.md", dest: "engines.md" },
  { src: "docs/DATA_MODEL.md", dest: "data-model.md" },
  { src: "docs/PERFORMANCE.md", dest: "performance.md" },
  { src: "docs/MANIFOLD_FOR_T1D.md", dest: "manifold-for-t1d.md" },
];

const PUBLIC_DOCS_DIR = resolve(REPO_ROOT, "public/docs");

if (!existsSync(PUBLIC_DOCS_DIR)) {
  mkdirSync(PUBLIC_DOCS_DIR, { recursive: true });
}

// Clean stale files so a removed doc doesn't linger in `public/docs/`
// after a curation update.
const expected = new Set(DOCS.map((d) => d.dest));
for (const f of readdirSync(PUBLIC_DOCS_DIR)) {
  if (f.endsWith(".md") && !expected.has(f)) {
    unlinkSync(resolve(PUBLIC_DOCS_DIR, f));
    process.stdout.write(`[sync-public-docs] removed stale ${f}\n`);
  }
}

for (const { src, dest } of DOCS) {
  const srcPath = resolve(REPO_ROOT, src);
  const destPath = resolve(PUBLIC_DOCS_DIR, dest);
  if (!existsSync(srcPath)) {
    process.stderr.write(`[sync-public-docs] missing source: ${src}\n`);
    process.exit(1);
  }
  copyFileSync(srcPath, destPath);
  process.stdout.write(`[sync-public-docs] ${src} → public/docs/${dest}\n`);
}
