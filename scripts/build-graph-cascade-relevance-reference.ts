// ─── Build a relevance-reference from the committed graph × cascade simulator ──
//
// Digital-twin calibration. Where the NBER builder calibrates F against
// real-world recession events on the 10-yr Treasury yield substrate,
// this builder calibrates F against the platform's OWN forecast model:
// "did the cascade simulator's Ω-buffer breach the critical threshold
// within the next K epochs?"
//
// Why this calibration exists alongside NBER
// ------------------------------------------
// The NBER reference answers "what has F meant historically against
// real-world recessions on real macro data." That's directly relevant
// when the analyst is reading macro signals.
//
// THIS reference answers "what has F meant historically against the
// simulator's own forecast of cascade evolution on the committed
// Manifold graph." That's directly relevant when the analyst is
// reading the Pareto card on the actual graph (which is the
// in-platform use case the user asked about).
//
// What's real here
// ----------------
//   - The graph is real (committed under src/lib/graph-data.ts)
//   - The cascade simulator is real (production code in
//     src/lib/cascade-simulator.ts)
//   - The "events" are simulator outcomes — not real-world events.
//     The reference is a calibration against the platform's own
//     mechanistic model, not against an external ground truth.
//
// The framing on the UI line + tooltip MUST disclose this:
//   "F=0.55 → 24% buffer-breach rate (n=120, base 18%)"
//   tooltip: "Calibrated against graph-cascade-buffer-breach: simulator
//   Ω-buffer crossed below CRITICAL (35) in next 50 epochs across N
//   single-node-shock scenarios on the committed Manifold graph."
//
// Output: public/relevance-references/graph-cascade-buffer-breach.json

import * as fs from "fs/promises";
import * as path from "path";
import { outOfSampleFit } from "../src/lib/pareto-relevance";
import { simulateCascade } from "../src/lib/cascade-simulator";
import { MAIN_GRAPH } from "../src/lib/graph-data";
import type { CausalShock, CausalNode } from "../src/lib/types";

// ─── Defaults ────────────────────────────────────────────────────

const DEFAULTS = {
  referenceId: "graph-cascade-buffer-breach",
  // Threshold for picking "interesting" seed nodes to shock. Lower
  // catches more nodes; higher focuses on already-fragile ones. 5.5 is
  // mid-tier — empirically gives ~150-200 seed nodes on the committed graph.
  seedOmegaFloor: 5.5,
  // Top-K seed nodes (highest Ω) to use for pair-shock combinations,
  // alongside the single-node sweep. Pairs of high-fragility nodes
  // are what drive the cascade hard enough to breach.
  pairShockTopK: 10,
  // Severity grid for single-node shocks. We sweep across these so
  // the histogram covers both "weak shock that fizzles" and "strong
  // shock that breaches" — gives a varied event-rate by F bin.
  singleSeverities: [0.3, 0.5, 0.7, 0.9, 0.95],
  // Severity for pair-shock scenarios (high to ensure some breach).
  pairSeverity: 0.7,
  // Sliding-window length for F (matches the analyst card's typical
  // scope).
  windowSize: 30,
  // Per-node Ω-composite threshold for the "node-critical" event.
  // The pillar prose calls Ω >= 9.0 "critical" (cascade across
  // multiple subsystems). Localized to the activated subgraph so the
  // signal isn't drowned by the rest of a 192-node graph.
  nodeCriticalThreshold: 9.0,
  // How many epochs ahead we look for a node-critical event.
  lookahead: 50,
  // Cascade-simulator run length per scenario.
  maxEpochs: 200,
  binCount: 10,
  builderVersion: "0.1.0",
};

// ─── Scenario generation ────────────────────────────────────────

/**
 * Each scenario is one of:
 *   - A single-node shock at an Ω >= seedOmegaFloor node, severity drawn
 *     from the singleSeverities grid (5 severities × N nodes)
 *   - A pair-shock at two of the top-K highest-Ω nodes, severity
 *     pairSeverity (K choose 2 = 45 scenarios at K=10)
 *
 * Singles give the histogram its low-end (weak shocks → low F regions
 * via stable trajectories that AR(1) doesn't fit cleanly when nothing's
 * happening); pairs give it the high-end (strong shocks that actually
 * breach the buffer).
 *
 * All scenarios are programmatic but they ARE running on the real
 * committed graph through the real cascade simulator. The "events"
 * are simulator outcomes (digital-twin calibration), explicitly
 * disclosed in the reference JSON's buildMeta.source.
 */
function buildScenarios(graph: typeof MAIN_GRAPH): CausalShock[] {
  const seedNodes = graph.nodes
    .filter((n: CausalNode) => n.omegaFragility.composite >= DEFAULTS.seedOmegaFloor)
    .sort((a, b) => b.omegaFragility.composite - a.omegaFragility.composite);

  const out: CausalShock[] = [];

  // Singles — every seed node × every severity in the grid.
  for (const node of seedNodes) {
    for (const sev of DEFAULTS.singleSeverities) {
      out.push({
        id: `sweep_${node.id}_${sev}`,
        name: `sweep shock at ${node.id} (sev ${sev})`,
        severity: sev,
        category: node.category as CausalShock["category"],
        description: `single-node deterministic shock at ${node.id} (sev ${sev})`,
        targetNodes: [node.id],
      });
    }
  }

  // Pairs — top-K seed nodes pairwise. With K=10 that's 45 pairs.
  const topK = seedNodes.slice(0, DEFAULTS.pairShockTopK);
  for (let i = 0; i < topK.length; i++) {
    for (let j = i + 1; j < topK.length; j++) {
      const a = topK[i];
      const b = topK[j];
      out.push({
        id: `pair_${a.id}__${b.id}`,
        name: `pair shock at ${a.id} + ${b.id}`,
        severity: DEFAULTS.pairSeverity,
        category: a.category as CausalShock["category"],
        description: `pair-node deterministic shock (sev ${DEFAULTS.pairSeverity})`,
        targetNodes: [a.id, b.id],
      });
    }
  }
  return out;
}

// ─── Trajectory extraction ──────────────────────────────────────

/**
 * For each epoch, return the mean Ω-composite across ACTIVATED nodes
 * only. This mirrors what the analyst card's `scopedOmegaSeries` looks
 * like when the user lassos the cascade's active subgraph — averaging
 * over the inactive nodes would drown the signal.
 *
 * Also return the max Ω-composite across activated nodes per epoch —
 * used downstream as the "did any node go critical" event signal.
 */
function extractActivatedOmegaSeries(
  epochs: ReturnType<typeof simulateCascade>,
): { mean: number[]; max: number[] } {
  const mean: number[] = [];
  const max: number[] = [];
  for (const snap of epochs) {
    const activated = Object.values(snap.nodeStates).filter(
      (s) => s.isActivated,
    );
    if (activated.length === 0) {
      mean.push(0);
      max.push(0);
      continue;
    }
    let sum = 0;
    let m = -Infinity;
    for (const s of activated) {
      sum += s.omegaComposite;
      if (s.omegaComposite > m) m = s.omegaComposite;
    }
    mean.push(sum / activated.length);
    max.push(m);
  }
  return { mean, max };
}

/**
 * AR(1) fit on the leading portion of the window, one-step-ahead
 * prediction over the full window. Same shape as the in-app CSD model
 * and the NBER builder so F values are byte-comparable across
 * substrates. Returns null when variance is zero.
 */
function arOneFitAndPredict(window: number[], holdoutStart: number): number[] | null {
  const n = window.length;
  if (n < 3) return null;
  let xMean = 0;
  let yMean = 0;
  let nFit = 0;
  for (let t = 1; t < holdoutStart; t++) {
    xMean += window[t - 1];
    yMean += window[t];
    nFit += 1;
  }
  if (nFit < 2) return null;
  xMean /= nFit;
  yMean /= nFit;
  let num = 0;
  let den = 0;
  for (let t = 1; t < holdoutStart; t++) {
    const dx = window[t - 1] - xMean;
    num += dx * (window[t] - yMean);
    den += dx * dx;
  }
  if (den <= 0) return null;
  const alpha = num / den;
  const mu = yMean - alpha * xMean;
  const pred = new Array<number>(n);
  pred[0] = window[0];
  for (let t = 1; t < n; t++) pred[t] = alpha * window[t - 1] + mu;
  return pred;
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  const repoRoot = process.cwd();
  const graph = MAIN_GRAPH;
  console.log(
    `[graph-ref] graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges`,
  );

  const scenarios = buildScenarios(graph);
  console.log(
    `[graph-ref] ${scenarios.length} scenarios at Ω >= ${DEFAULTS.seedOmegaFloor} (singles × ${DEFAULTS.singleSeverities.length} severities + ${DEFAULTS.pairShockTopK}-node pair sweep at sev ${DEFAULTS.pairSeverity})`,
  );

  console.log("[graph-ref] running cascade simulations + extracting (F, label) pairs...");
  const fValues: number[] = [];
  const fLabels: boolean[] = [];
  let breachedScenarios = 0;
  let nonBreachedScenarios = 0;
  for (const scenario of scenarios) {
    const epochs = simulateCascade(graph, [scenario], [], {
      maxEpochs: DEFAULTS.maxEpochs,
    });
    const { mean: trajectory, max: maxOmegaPerEpoch } =
      extractActivatedOmegaSeries(epochs);

    let scenarioBreached = false;
    // Slide window across the trajectory; for each window ending at
    // `wEnd`, fit AR(1), compute F, label with "did any activated node
    // exceed nodeCriticalThreshold (9.0) in next `lookahead` epochs?"
    const winSize = DEFAULTS.windowSize;
    const holdoutFrac = 0.2;
    for (let wEnd = winSize; wEnd + 1 < trajectory.length; wEnd++) {
      const window = trajectory.slice(wEnd - winSize, wEnd);
      const holdoutStart = Math.floor(window.length * (1 - holdoutFrac));
      if (holdoutStart < 2 || holdoutStart >= window.length) continue;
      const pred = arOneFitAndPredict(window, holdoutStart);
      if (!pred) continue;
      const fit = outOfSampleFit(window, pred);
      if (!Number.isFinite(fit.score)) continue;

      // Forward label: did maxΩ_activated cross above threshold in
      // epochs [wEnd, wEnd + lookahead)?
      const lookEnd = Math.min(maxOmegaPerEpoch.length, wEnd + DEFAULTS.lookahead);
      let event = false;
      for (let s = wEnd; s < lookEnd; s++) {
        if (maxOmegaPerEpoch[s] >= DEFAULTS.nodeCriticalThreshold) {
          event = true;
          break;
        }
      }
      fValues.push(fit.score);
      fLabels.push(event);
      if (event) scenarioBreached = true;
    }
    if (scenarioBreached) breachedScenarios += 1;
    else nonBreachedScenarios += 1;
  }
  console.log(
    `[graph-ref] ${fValues.length} (F, label) pairs across ${scenarios.length} scenarios; ${breachedScenarios} scenarios eventually breached, ${nonBreachedScenarios} did not`,
  );
  const totalEvents = fLabels.filter(Boolean).length;
  console.log(
    `[graph-ref] window-level base rate: ${totalEvents}/${fValues.length} = ${((totalEvents / fValues.length) * 100).toFixed(2)}%`,
  );

  // Binning
  const binCount = DEFAULTS.binCount;
  const bins = Array.from({ length: binCount }, (_, i) => ({
    binLow: i / binCount,
    binHigh: (i + 1) / binCount,
    count: 0,
    eventCount: 0,
    eventRate: Number.NaN,
  }));
  for (let i = 0; i < fValues.length; i++) {
    const f = Math.max(0, Math.min(1, fValues[i]));
    const idx = Math.min(binCount - 1, Math.floor(f * binCount));
    bins[idx].count += 1;
    if (fLabels[i]) bins[idx].eventCount += 1;
  }
  for (const b of bins) {
    b.eventRate = b.count > 0 ? b.eventCount / b.count : Number.NaN;
  }

  const reference = {
    referenceId: DEFAULTS.referenceId,
    substrateId: "graph-activated-mean-omega",
    eventLabel: `Cascade-simulator: max-Ω across activated nodes reached ≥ ${DEFAULTS.nodeCriticalThreshold.toFixed(1)} (node-critical) within next ${DEFAULTS.lookahead} epochs`,
    windowSize: DEFAULTS.windowSize,
    lookahead: DEFAULTS.lookahead,
    totalWindows: fValues.length,
    totalEvents,
    baseRate: fValues.length === 0 ? 0 : totalEvents / fValues.length,
    bins,
    buildMeta: {
      builderVersion: DEFAULTS.builderVersion,
      builtAt: new Date().toISOString(),
      source: `Manifold committed graph (${graph.nodes.length} nodes, ${graph.edges.length} edges) × cascade simulator. ${scenarios.length} scenarios at Ω >= ${DEFAULTS.seedOmegaFloor} (single-node sweep × ${DEFAULTS.singleSeverities.length} severities + ${DEFAULTS.pairShockTopK}-node pair-shock sweep at severity ${DEFAULTS.pairSeverity}). Digital-twin calibration — events are simulator outcomes, not real-world events.`,
      cohortFrom: "scenario-1",
      cohortTo: `scenario-${scenarios.length}`,
    },
  };

  const outDir = path.join(repoRoot, "public", "relevance-references");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${DEFAULTS.referenceId}.json`);
  await fs.writeFile(outPath, JSON.stringify(reference, null, 2));
  console.log("");
  console.log(`[graph-ref] wrote ${path.relative(repoRoot, outPath)}`);
  console.log("");
  console.log("Histogram (F bin → empirical buffer-breach rate):");
  for (const b of bins) {
    const rate = Number.isFinite(b.eventRate)
      ? `${(b.eventRate * 100).toFixed(1)}%`
      : "(empty)";
    console.log(
      `  [${b.binLow.toFixed(1)}-${b.binHigh.toFixed(1)})  n=${String(b.count).padStart(5)}  rate=${rate}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
