// Run pcmci-plus on the D1NAMO cohort and write a DiscoveryRun JSON.
// Usage: npx tsx scripts/run-d1namo-pcmci-plus.ts
//
// Requires the raw D1NAMO data to be built first:
//   python research/scripts/build_d1namo_cohort.py
//
// Output goes to two places:
//   - research/runs/d1namo-pcmci-plus-<ts>.json (audit / drift trail)
//   - public/discovery-runs/d1namo-pcmci-plus-v0-2-0.json (panel-served)

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { d1namoIngester } from "../src/lib/discovery/ingesters/d1namo";
import { pcmciPlusAlgorithm } from "../src/lib/discovery/algorithms/pcmci-plus";
import { buildDiscoveryRun } from "../src/lib/discovery/run-types";

// Stable id + timestamps so the version-stable panel-served file is
// reproducible across re-runs. Audit copy uses the real wall clock.
const STABLE_RUN_ID = "d1namo-pcmci-plus-v0-2-0";
const STABLE_STARTED_AT = "2026-05-30T00:00:00.000Z";
const STABLE_COMPLETED_AT = "2026-05-30T00:00:01.000Z";

async function main() {
  const repoRoot = process.cwd();
  const wallStartedAt = new Date().toISOString();

  console.log("[d1namo-pcmci-plus] ingesting cohort...");
  const cohort = await d1namoIngester.ingest(repoRoot);
  console.log(
    `[d1namo-pcmci-plus] cohort ${cohort.id}: ${cohort.subjects.length} subjects, ` +
      `${cohort.subjects.reduce((a, s) => a + s.measurements.length, 0).toLocaleString()} measurements`,
  );

  console.log("[d1namo-pcmci-plus] running pcmci-plus discovery...");
  const result = pcmciPlusAlgorithm.run(cohort);
  const wallCompletedAt = new Date().toISOString();

  console.log(
    `[d1namo-pcmci-plus] discovered ${result.edges.length} edges from ` +
      `${(result.diagnostics?.nFinalCandidates as number) ?? "?"} MCI candidates`,
  );
  for (const e of result.edges) {
    const lagStr = typeof e.lag === "number" ? ` (lag ${e.lag}s)` : " (contemp)";
    const marks = e.endpointMarks
      ? ` [${e.endpointMarks.sourceMark}-${e.endpointMarks.targetMark}]`
      : "";
    console.log(
      `  ${e.source} → ${e.target}${lagStr}${marks} r=${e.strength.toFixed(3)}` +
        ` p=${e.pValue?.toExponential(2) ?? "—"}`,
    );
  }

  // Panel-served copy with stable timestamps so the file is reproducible.
  const servedRun = buildDiscoveryRun({
    id: STABLE_RUN_ID,
    cohort,
    algorithm: { id: pcmciPlusAlgorithm.id, version: pcmciPlusAlgorithm.version },
    params: { ...pcmciPlusAlgorithm.defaultParams } as Record<string, unknown>,
    startedAt: STABLE_STARTED_AT,
    completedAt: STABLE_COMPLETED_AT,
    result,
  });

  const publicDir = path.join(repoRoot, "public", "discovery-runs");
  await fs.mkdir(publicDir, { recursive: true });
  const publicPath = path.join(publicDir, "d1namo-pcmci-plus-v0-2-0.json");
  await fs.writeFile(publicPath, JSON.stringify(servedRun, null, 2) + "\n");
  console.log(`[d1namo-pcmci-plus] wrote ${path.relative(repoRoot, publicPath)}`);

  // Audit copy with wall-clock timestamps + a uuid-style id.
  const auditDir = path.join(repoRoot, "research", "runs");
  await fs.mkdir(auditDir, { recursive: true });
  const tsSlug = wallStartedAt.replace(/[:.]/g, "-");
  const auditPath = path.join(auditDir, `d1namo-pcmci-plus-${tsSlug}.json`);
  const auditRun = buildDiscoveryRun({
    id: `${STABLE_RUN_ID}-${tsSlug}`,
    cohort,
    algorithm: { id: pcmciPlusAlgorithm.id, version: pcmciPlusAlgorithm.version },
    params: { ...pcmciPlusAlgorithm.defaultParams } as Record<string, unknown>,
    startedAt: wallStartedAt,
    completedAt: wallCompletedAt,
    result,
  });
  await fs.writeFile(auditPath, JSON.stringify(auditRun, null, 2));
  console.log(`[d1namo-pcmci-plus] wrote ${path.relative(repoRoot, auditPath)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
