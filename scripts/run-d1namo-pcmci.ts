// Run pcmci-linear on the D1NAMO cohort and write a DiscoveryRun JSON.
// Usage: npx tsx scripts/run-d1namo-pcmci.ts

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { d1namoIngester } from "../src/lib/discovery/ingesters/d1namo";
import { pcmciLinearAlgorithm } from "../src/lib/discovery/algorithms/pcmci-linear";
import { buildDiscoveryRun } from "../src/lib/discovery/run-types";

async function main() {
  const repoRoot = process.cwd();
  const startedAt = new Date().toISOString();

  console.log("[d1namo-pcmci] ingesting cohort...");
  const cohort = await d1namoIngester.ingest(repoRoot);
  console.log(
    `[d1namo-pcmci] cohort ${cohort.id}: ${cohort.subjects.length} subjects, ` +
      `${cohort.subjects.reduce((a, s) => a + s.measurements.length, 0).toLocaleString()} measurements`,
  );

  console.log("[d1namo-pcmci] running pcmci-linear discovery...");
  const result = pcmciLinearAlgorithm.run(cohort);
  const completedAt = new Date().toISOString();

  console.log(
    `[d1namo-pcmci] discovered ${result.edges.length} edges from ` +
      `${(result.diagnostics?.nFinalCandidates as number) ?? "?"} MCI candidates ` +
      `(avg cond size ${(result.diagnostics?.averageCondSize as number)?.toFixed(2) ?? "?"})`,
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
    algorithm: { id: pcmciLinearAlgorithm.id, version: pcmciLinearAlgorithm.version },
    params: { ...pcmciLinearAlgorithm.defaultParams } as Record<string, unknown>,
    startedAt,
    completedAt,
    result,
  });

  const outDir = path.join(repoRoot, "research", "runs");
  await fs.mkdir(outDir, { recursive: true });
  const ts = startedAt.replace(/[:.]/g, "-");
  const outPath = path.join(outDir, `d1namo-pcmci-linear-${ts}.json`);
  await fs.writeFile(outPath, JSON.stringify(run, null, 2));
  console.log(`[d1namo-pcmci] wrote ${path.relative(repoRoot, outPath)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
