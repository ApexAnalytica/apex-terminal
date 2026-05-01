// Run BOCPD-vs-hypoglycemia calibration on the D1NAMO cohort.
//
// This is the "calibration of an estimator's relevance score against
// trial-CRF event labels" deliverable from the Joslin proposal,
// executed on a public T1D cohort so the methodology is demonstrable
// without waiting on a DUA.
//
// Output: research/runs/d1namo-bocpd-hypo-calibration-<ts>.json
//
// Usage: npx tsx scripts/run-d1namo-bocpd-calibration.ts

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

import { d1namoIngester } from "../src/lib/discovery/ingesters/d1namo";
import {
  calibrateBocpdHypo,
  DEFAULT_PARAMS,
} from "../src/lib/discovery/calibration/bocpd-hypo-calibrator";
import { buildDiscoveryRun } from "../src/lib/discovery/run-types";

async function main() {
  const repoRoot = process.cwd();
  const startedAt = new Date().toISOString();

  console.log("[d1namo-cal] ingesting cohort...");
  const cohort = await d1namoIngester.ingest(repoRoot);
  console.log(
    `[d1namo-cal] cohort ${cohort.id}: ${cohort.subjects.length} subjects`,
  );

  console.log("[d1namo-cal] running BOCPD hypo calibration...");
  const cal = calibrateBocpdHypo(cohort);
  const completedAt = new Date().toISOString();

  console.log("");
  console.log(`AUROC:        ${cal.auroc.toFixed(4)}`);
  console.log(`Brier score:  ${cal.brierScore.toFixed(4)}`);
  console.log(`ECE:          ${cal.ece.toFixed(4)}`);
  console.log(`Base rate:    ${(cal.baseRate * 100).toFixed(2)}%`);
  console.log(`N pairs:      ${cal.nPairs.toLocaleString()}`);
  console.log(`Subjects:     ${cal.nSubjects}`);
  console.log("");
  console.log("Per-subject:");
  for (const s of cal.perSubject) {
    const rate = s.nPairs === 0 ? 0 : (s.nEvents / s.nPairs) * 100;
    console.log(
      `  ${s.id}: ${s.nPairs.toString().padStart(4)} pairs, ` +
        `${s.nEvents.toString().padStart(3)} events (${rate.toFixed(1)}%)`,
    );
  }
  console.log("");
  console.log("Reliability diagram:");
  for (const b of cal.reliabilityBins) {
    if (b.count === 0) {
      console.log(
        `  [${b.binLow.toFixed(1)}-${b.binHigh.toFixed(1)})  empty`,
      );
      continue;
    }
    console.log(
      `  [${b.binLow.toFixed(1)}-${b.binHigh.toFixed(1)})  ` +
        `pred=${b.predictedMean.toFixed(3)}  obs=${b.observedRate.toFixed(3)}  ` +
        `n=${b.count}`,
    );
  }

  // Wrap as a DiscoveryRun-shaped record so the existing UI / API
  // surfaces can render it without schema gymnastics.
  const run = buildDiscoveryRun({
    id: randomUUID(),
    cohort,
    algorithm: { id: "bocpd-hypo-calibration", version: "0.1.0" },
    params: { ...DEFAULT_PARAMS } as Record<string, unknown>,
    startedAt,
    completedAt,
    result: {
      variables: [DEFAULT_PARAMS.cgmVariableId],
      edges: [], // calibration is not a structure-discovery output
      diagnostics: {
        auroc: cal.auroc,
        brierScore: cal.brierScore,
        ece: cal.ece,
        baseRate: cal.baseRate,
        nPairs: cal.nPairs,
        nSubjects: cal.nSubjects,
        reliabilityBins: cal.reliabilityBins,
        perSubject: cal.perSubject,
      },
    },
  });

  const outDir = path.join(repoRoot, "research", "runs");
  await fs.mkdir(outDir, { recursive: true });
  const ts = startedAt.replace(/[:.]/g, "-");
  const outPath = path.join(
    outDir,
    `d1namo-bocpd-hypo-calibration-${ts}.json`,
  );
  await fs.writeFile(outPath, JSON.stringify(run, null, 2));
  console.log("");
  console.log(`[d1namo-cal] wrote ${path.relative(repoRoot, outPath)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
