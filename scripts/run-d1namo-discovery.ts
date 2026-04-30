// Run the lag-correlation discovery algorithm on the D1NAMO cohort
// and write a DiscoveryRun JSON to research/runs/.
//
// Usage:
//   npx tsx scripts/run-d1namo-discovery.ts
//
// Reads:  research/datasets/d1namo/cohort.json
// Writes: research/runs/d1namo-lag-correlation-<timestamp>.json
//
// Both paths are gitignored. The output contains only abstract structure
// (variable ids, edges, lags, p-values) — no raw measurements — so it
// is safe to share with clinicians or paste into a PR description.

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

import { d1namoIngester } from "../src/lib/discovery/ingesters/d1namo";
import { lagCorrelationAlgorithm } from "../src/lib/discovery/algorithms/lag-correlation";
import { buildDiscoveryRun } from "../src/lib/discovery/run-types";

async function main() {
  const repoRoot = process.cwd();
  const startedAt = new Date().toISOString();

  console.log("[d1namo] ingesting cohort...");
  const cohort = await d1namoIngester.ingest(repoRoot);
  console.log(
    `[d1namo] cohort ${cohort.id}: ${cohort.subjects.length} subjects, ` +
      `${cohort.subjects.reduce((a, s) => a + s.measurements.length, 0).toLocaleString()} measurements`,
  );

  console.log("[d1namo] running lag-correlation discovery...");
  const result = lagCorrelationAlgorithm.run(cohort);
  const completedAt = new Date().toISOString();

  console.log(
    `[d1namo] discovered ${result.edges.length} edges ` +
      `(over ${(result.diagnostics?.nCandidates as number) ?? "?"} candidates)`,
  );
  for (const e of result.edges) {
    console.log(
      `  ${e.source} → ${e.target}` +
        (typeof e.lag === "number" ? ` (lag ${e.lag}s)` : "") +
        ` r=${e.strength.toFixed(3)} p=${e.pValue?.toExponential(2) ?? "—"}`,
    );
  }

  const run = buildDiscoveryRun({
    id: randomUUID(),
    cohort,
    algorithm: {
      id: lagCorrelationAlgorithm.id,
      version: lagCorrelationAlgorithm.version,
    },
    params: { ...lagCorrelationAlgorithm.defaultParams } as Record<
      string,
      unknown
    >,
    startedAt,
    completedAt,
    result,
  });

  const outDir = path.join(repoRoot, "research", "runs");
  await fs.mkdir(outDir, { recursive: true });
  const ts = startedAt.replace(/[:.]/g, "-");
  const outPath = path.join(
    outDir,
    `d1namo-lag-correlation-${ts}.json`,
  );
  await fs.writeFile(outPath, JSON.stringify(run, null, 2));
  console.log(`[d1namo] wrote ${path.relative(repoRoot, outPath)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
