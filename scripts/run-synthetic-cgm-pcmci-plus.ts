// Run pcmci-plus on the synthetic CGM cohort and write a DiscoveryRun JSON.
// Usage: npx tsx scripts/run-synthetic-cgm-pcmci-plus.ts
//
// Why this exists: D1NAMO raw data is built from a Python script and
// isn't checked in. This script runs the same PCMCI+ algorithm against
// the deterministic synthetic CGM cohort so the panel always has a
// PCMCI+ run to display. When real D1NAMO data is available locally,
// `scripts/run-d1namo-pcmci-plus.ts` runs the same algorithm there.

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { buildSyntheticCgmCohort } from "../src/lib/discovery/fixtures/synthetic-cgm-cohort";
import { pcmciPlusAlgorithm } from "../src/lib/discovery/algorithms/pcmci-plus";
import { buildDiscoveryRun } from "../src/lib/discovery/run-types";

// Stable timestamps so re-running produces bit-identical JSON output —
// otherwise startedAt/completedAt would churn the file on every build.
const STABLE_STARTED_AT = "2026-05-30T00:00:00.000Z";
const STABLE_COMPLETED_AT = "2026-05-30T00:00:01.000Z";
const STABLE_RUN_ID = "synthetic-cgm-pcmci-plus-v0-2-0";

async function main() {
  const repoRoot = process.cwd();

  console.log("[synth-cgm-pcmci-plus] building synthetic cohort...");
  const cohort = buildSyntheticCgmCohort();
  console.log(
    `[synth-cgm-pcmci-plus] cohort ${cohort.id}: ${cohort.subjects.length} subjects, ` +
      `${cohort.subjects.reduce((a, s) => a + s.measurements.length, 0).toLocaleString()} measurements`,
  );

  console.log("[synth-cgm-pcmci-plus] running pcmci-plus discovery...");
  const result = pcmciPlusAlgorithm.run(cohort);

  console.log(
    `[synth-cgm-pcmci-plus] discovered ${result.edges.length} edges from ` +
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

  const run = buildDiscoveryRun({
    // Use a stable id so committed file is reproducible. The audit
    // log can layer instance-level uuids on top at serve time.
    id: STABLE_RUN_ID,
    cohort,
    algorithm: { id: pcmciPlusAlgorithm.id, version: pcmciPlusAlgorithm.version },
    params: { ...pcmciPlusAlgorithm.defaultParams } as Record<string, unknown>,
    startedAt: STABLE_STARTED_AT,
    completedAt: STABLE_COMPLETED_AT,
    result,
  });

  // Direct write to the version-stable name the panel serves from.
  // No timestamp suffix — this file IS the served run.
  const outDir = path.join(repoRoot, "public", "discovery-runs");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "synthetic-cgm-pcmci-plus-v0-2-0.json");
  await fs.writeFile(outPath, JSON.stringify(run, null, 2) + "\n");
  console.log(`[synth-cgm-pcmci-plus] wrote ${path.relative(repoRoot, outPath)}`);
  // Suppress unused-import warnings for STABLE_* if minified differently
  void STABLE_RUN_ID;
  void randomUUID;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
