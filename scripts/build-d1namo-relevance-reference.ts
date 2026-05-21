// ─── Convert the existing D1NAMO csd-fit calibration into a relevance-reference ──
//
// We already shipped a real calibration run against the D1NAMO cohort
// (csd-fit-hypo-calibration, PR #200) that lives at
// public/discovery-runs/d1namo-csd-fit-hypo-calibration-v0-1-0.json.
// That JSON carries reliability bins (F → empirical hypo-event rate)
// already — exactly the shape relevance-references consume.
//
// This builder is a thin converter, not a re-computation. It reads the
// existing discovery-run JSON and emits the relevance-reference JSON
// in the format the Pareto card lookup expects. No network, no model
// re-fit, no synthetic data — the underlying calibration is the same
// one already validated and shipped in #200 (AUROC 0.589 on the 9 T1D
// subjects of D1NAMO, 8,102 (F, label) pairs).
//
// Output:
//   public/relevance-references/d1namo-cgm-hypo.json
//
// What changes in the UI:
//   T1D_PROFILE.relevanceReferenceId becomes "d1namo-cgm-hypo", so the
//   T1D Pareto card now shows the same kind of lookup line the
//   analyst card has had since #355/#359:
//
//     F=0.71 → 68% hypo-event rate (n=386, base 12%)

import * as fs from "fs/promises";
import * as path from "path";

interface DiscoveryReliabilityBin {
  binLow: number;
  binHigh: number;
  predictedMean: number;
  observedRate: number;
  count: number;
}

interface DiscoveryDiagnostics {
  aurocFitHigh: number;
  aurocFitLow: number;
  baseRate: number;
  brierScore: number;
  ece: number;
  meanCiHalfWidth: number;
  nPairs: number;
  nSubjects: number;
  reliabilityBins: DiscoveryReliabilityBin[];
}

interface DiscoveryRun {
  algorithm: { id: string; version: string };
  cohortId: string;
  startedAt: string;
  completedAt: string;
  params: {
    cgmVariableId?: string;
    hypoThresholdMgdl?: number;
    predictionHorizonMin?: number;
    gridSeconds?: number;
    windowSize?: number;
  };
  result: {
    diagnostics: DiscoveryDiagnostics;
  };
}

async function main() {
  const repoRoot = process.cwd();
  const inputPath = path.join(
    repoRoot,
    "public",
    "discovery-runs",
    "d1namo-csd-fit-hypo-calibration-v0-1-0.json",
  );
  console.log(`[d1namo-ref] loading ${path.relative(repoRoot, inputPath)}...`);
  const raw = await fs.readFile(inputPath, "utf8");
  const run: DiscoveryRun = JSON.parse(raw);

  const d = run.result.diagnostics;
  const params = run.params;
  console.log(
    `[d1namo-ref] source run ${run.algorithm.id} v${run.algorithm.version}: ${d.nPairs} pairs across ${d.nSubjects} subjects, base rate ${(d.baseRate * 100).toFixed(2)}%`,
  );

  // Convert each discovery-bin to the relevance-reference bin shape.
  // The discovery shape carries `observedRate` (= eventRate) and `count`
  // per bin but not eventCount; derive it as count × observedRate
  // (rounded to nearest integer for storage hygiene).
  const bins = d.reliabilityBins.map((b) => ({
    binLow: b.binLow,
    binHigh: b.binHigh,
    count: b.count,
    eventCount: Math.round(b.count * b.observedRate),
    eventRate: b.observedRate,
  }));
  const totalEvents = bins.reduce((s, b) => s + b.eventCount, 0);

  const horizonMin = params.predictionHorizonMin ?? 30;

  const reference = {
    referenceId: "d1namo-cgm-hypo",
    substrateId: params.cgmVariableId ?? "cgm_glucose_mgdl",
    eventLabel: `Hypoglycemic episode (CGM < ${params.hypoThresholdMgdl ?? 70} mg/dL) within next ${horizonMin} minutes`,
    windowSize: params.windowSize ?? 24,
    // lookahead is in CGM steps (5-min grid)
    lookahead: Math.round((horizonMin * 60) / (params.gridSeconds ?? 300)),
    totalWindows: d.nPairs,
    totalEvents,
    baseRate: d.baseRate,
    bins,
    buildMeta: {
      builderVersion: "0.1.0",
      builtAt: new Date().toISOString(),
      source: `Derived from the live D1NAMO csd-fit-hypo-calibration run shipped in PR #200 (cohort: ${run.cohortId}, ${d.nSubjects} T1D subjects, AUROC ${d.aurocFitHigh.toFixed(3)} on F → hypo). Real CGM substrate, real hypoglycemic event ground truth. Converter only: no re-computation, just a shape transformation from the discovery-run JSON to the relevance-reference JSON.`,
      cohortFrom: run.startedAt,
      cohortTo: run.completedAt,
    },
  };

  const outDir = path.join(repoRoot, "public", "relevance-references");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${reference.referenceId}.json`);
  await fs.writeFile(outPath, JSON.stringify(reference, null, 2));
  console.log("");
  console.log(`[d1namo-ref] wrote ${path.relative(repoRoot, outPath)}`);
  console.log("");
  console.log("Histogram (F bin → empirical hypo-event rate):");
  for (const b of bins) {
    const rate = b.count > 0
      ? `${(b.eventRate * 100).toFixed(1)}%`
      : "(empty)";
    console.log(
      `  [${b.binLow.toFixed(1)}-${b.binHigh.toFixed(1)})  n=${String(b.count).padStart(5)}  events=${String(b.eventCount).padStart(4)}  rate=${rate}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
