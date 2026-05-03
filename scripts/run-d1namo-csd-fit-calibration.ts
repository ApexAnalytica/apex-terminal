// Run CSD-fit-vs-hypoglycemia calibration on the D1NAMO cohort.
//
// This validates the F sub-score of the F·E·G·S·M relevance composite
// (and the bootstrap CI shipped in PR #179) on real labelled CGM data.
// On single-subject CGM, M and several other sub-scores are degenerate;
// the calibrator records exactly which sub-scores are validated and which
// degenerate, and the algorithm id makes the scope explicit:
// `csd-fit-hypo-calibration`.
//
// Output: research/runs/d1namo-csd-fit-hypo-calibration-<ts>.json
// (also copy to public/discovery-runs/d1namo-csd-fit-hypo-calibration-v0-1-0.json
// to make the run available to the in-app SPIRTES module).
//
// Usage: npx tsx scripts/run-d1namo-csd-fit-calibration.ts

import * as fs from "fs/promises";
import * as path from "path";
import { randomUUID } from "crypto";

import { d1namoIngester } from "../src/lib/discovery/ingesters/d1namo";
import {
  calibrateCsdFitHypo,
  DEFAULT_PARAMS,
} from "../src/lib/discovery/calibration/csd-fit-hypo-calibrator";
import { buildDiscoveryRun } from "../src/lib/discovery/run-types";

async function main() {
  const repoRoot = process.cwd();
  const startedAt = new Date().toISOString();

  console.log("[d1namo-fit] ingesting cohort...");
  const cohort = await d1namoIngester.ingest(repoRoot);
  console.log(
    `[d1namo-fit] cohort ${cohort.id}: ${cohort.subjects.length} subjects`,
  );

  console.log("[d1namo-fit] running CSD-fit hypo calibration...");
  const cal = calibrateCsdFitHypo(cohort);
  const completedAt = new Date().toISOString();

  console.log("");
  console.log(`AUROC (F → hypo):       ${cal.aurocFitHigh.toFixed(4)}`);
  console.log(`AUROC (1−F → hypo):     ${cal.aurocFitLow.toFixed(4)}`);
  console.log(`Brier (F as P(event)):  ${cal.brierScore.toFixed(4)}`);
  console.log(`ECE:                    ${cal.ece.toFixed(4)}`);
  console.log(`Mean CI half-width:     ${cal.meanCiHalfWidth.toFixed(4)}`);
  console.log(`Base rate:              ${(cal.baseRate * 100).toFixed(2)}%`);
  console.log(`N (window, label) pairs: ${cal.nPairs.toLocaleString()}`);
  console.log(`Subjects used:          ${cal.nSubjects}`);
  console.log("");
  console.log("Per-subject:");
  for (const s of cal.perSubject) {
    const rate = s.nPairs === 0 ? 0 : (s.nEvents / s.nPairs) * 100;
    console.log(
      `  ${s.id}: ${s.nPairs.toString().padStart(4)} pairs, ` +
        `${s.nEvents.toString().padStart(3)} events ` +
        `(${rate.toFixed(1)}%), meanF=${s.meanF.toFixed(3)}`,
    );
  }
  console.log("");
  console.log("Reliability diagram (F vs label):");
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
  console.log("");
  console.log(`Validates:  ${cal.validatedSubScores.join(", ")}`);
  console.log(`Degenerate: ${cal.degenerateSubScores.join(", ")}`);

  const run = buildDiscoveryRun({
    id: randomUUID(),
    cohort,
    algorithm: { id: "csd-fit-hypo-calibration", version: "0.1.0" },
    params: { ...DEFAULT_PARAMS } as Record<string, unknown>,
    startedAt,
    completedAt,
    result: {
      variables: [DEFAULT_PARAMS.cgmVariableId],
      edges: [],
      diagnostics: {
        aurocFitHigh: cal.aurocFitHigh,
        aurocFitLow: cal.aurocFitLow,
        brierScore: cal.brierScore,
        ece: cal.ece,
        meanCiHalfWidth: cal.meanCiHalfWidth,
        baseRate: cal.baseRate,
        nPairs: cal.nPairs,
        nSubjects: cal.nSubjects,
        reliabilityBins: cal.reliabilityBins,
        perSubject: cal.perSubject,
        validatedSubScores: cal.validatedSubScores,
        degenerateSubScores: cal.degenerateSubScores,
      },
    },
  });

  const outDir = path.join(repoRoot, "research", "runs");
  await fs.mkdir(outDir, { recursive: true });
  const ts = startedAt.replace(/[:.]/g, "-");
  const outPath = path.join(
    outDir,
    `d1namo-csd-fit-hypo-calibration-${ts}.json`,
  );
  await fs.writeFile(outPath, JSON.stringify(run, null, 2));
  console.log("");
  console.log(`[d1namo-fit] wrote ${path.relative(repoRoot, outPath)}`);

  // Also copy to public/discovery-runs/ so the SPIRTES UI can load it.
  const publicDir = path.join(repoRoot, "public", "discovery-runs");
  await fs.mkdir(publicDir, { recursive: true });
  const publicPath = path.join(
    publicDir,
    "d1namo-csd-fit-hypo-calibration-v0-1-0.json",
  );
  await fs.writeFile(publicPath, JSON.stringify(run, null, 2));
  console.log(
    `[d1namo-fit] wrote ${path.relative(repoRoot, publicPath)}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
