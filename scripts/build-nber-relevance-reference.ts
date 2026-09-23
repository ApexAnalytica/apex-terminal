// ─── Build a relevance-reference JSON from real committed macro data ──
//
// No-network variant of the relevance-reference builder. Reads the
// Shiller-attributed monthly macro series already committed in
// public/datasets/claire/macro_timeseries.json (10-year Treasury yield,
// 1980-01 → 2023-09, 525 observations) and labels each window against
// the canonical NBER recession date list (hardcoded below — official
// US Business Cycle Dating Committee designations, public, stable).
//
// Output: public/relevance-references/nber-recession-10y-yield.json
//
// Why this builder exists alongside build-fred-relevance-reference.ts:
//   - The FRED variant needs network access + an API key to fetch the
//     latest BAMLH0A0HYM2 series. Useful, but session-dependent.
//   - This builder uses only data already committed to the repo. It
//     runs anywhere, no secrets, no network, fully reproducible across
//     deploys.
//
// What ships in the UI on a lasso selection (geopolitical profile):
//   "F = 0.71 → 38% NBER recession in next 12mo
//    (substrate: 10y Treasury yield, n=84)"

import * as fs from "fs/promises";
import * as path from "path";
import { outOfSampleFit } from "../src/lib/pareto-relevance";

// ─── NBER recession dates (US, official) ────────────────────────
//
// Each entry is a (peak, trough) pair — the recession's start and end
// months. Source: NBER Business Cycle Dating Committee, public, stable.
// We only need the START dates for prediction-of-recession-onset
// labelling, but storing trough too lets a future variant label
// "recession in progress" instead.
const NBER_RECESSIONS: Array<{ start: string; end: string }> = [
  // (1980-01 to 1980-07 — start predates the Shiller series start; skip)
  { start: "1981-07", end: "1982-11" },
  { start: "1990-07", end: "1991-03" },
  { start: "2001-03", end: "2001-11" },
  { start: "2007-12", end: "2009-06" },
  { start: "2020-02", end: "2020-04" },
];

// ─── Defaults ────────────────────────────────────────────────────

const DEFAULTS = {
  referenceId: "nber-recession-10y-yield",
  substrateLabel: "long_rate_10y",
  substrateDisplay: "10-year Treasury yield (Shiller)",
  windowSize: 60,        // months — 5-year sliding window for the AR(1) fit
  lookahead: 12,         // months — "did a recession start in next 12 months?"
  binCount: 10,
  builderVersion: "0.1.0",
};

// ─── Helpers ────────────────────────────────────────────────────

interface MacroPoint {
  date: string;          // ISO date — "YYYY-MM-01"
  metric_name: string;
  metric_value: number;
  unit: string;
  source: string;
}

interface MacroFile {
  macro_fred_proxy: MacroPoint[];
}

/** Parse "YYYY-MM" or "YYYY-MM-DD" into a comparable month index
 *  (months since year 0). Used for arithmetic and comparison without
 *  having to construct a Date object for every point. */
function monthIndex(d: string): number {
  const [y, m] = d.slice(0, 7).split("-");
  return parseInt(y, 10) * 12 + (parseInt(m, 10) - 1);
}

/**
 * For each observation index t in `series`, did a NBER recession
 * start in the next `lookahead` months (i.e. peak month falls in
 * [series[t].date + 1, series[t].date + lookahead])?
 */
function buildRecessionLabels(
  series: MacroPoint[],
  lookahead: number,
): boolean[] {
  const recessionStartIdx = NBER_RECESSIONS.map((r) => monthIndex(r.start));
  return series.map((point) => {
    const t = monthIndex(point.date);
    for (const startIdx of recessionStartIdx) {
      if (startIdx > t && startIdx <= t + lookahead) return true;
    }
    return false;
  });
}

/**
 * Fit AR(1) on the leading portion of `window`, return one-step-ahead
 * predictions of the same length. Same shape as the in-app CSD model
 * and the FRED builder so the F values are byte-comparable across
 * substrates. Returns null when the input has zero variance.
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
  const macroPath = path.join(
    repoRoot,
    "public",
    "datasets",
    "claire",
    "macro_timeseries.json",
  );
  console.log(`[nber-ref] loading ${path.relative(repoRoot, macroPath)}...`);
  const raw = await fs.readFile(macroPath, "utf8");
  const file: MacroFile = JSON.parse(raw);

  // Filter to the 10y yield substrate, sort by date.
  const series = file.macro_fred_proxy
    .filter((p) => p.metric_name === DEFAULTS.substrateLabel)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (series.length === 0) {
    throw new Error(
      `[nber-ref] no observations found for metric_name="${DEFAULTS.substrateLabel}" — check public/datasets/claire/macro_timeseries.json`,
    );
  }
  console.log(
    `[nber-ref] ${series.length} ${DEFAULTS.substrateLabel} observations from ${series[0].date} to ${series[series.length - 1].date}`,
  );

  // Sanity check: NBER recession starts within our coverage.
  const covered = NBER_RECESSIONS.filter(
    (r) =>
      monthIndex(r.start) >= monthIndex(series[0].date) &&
      monthIndex(r.start) <= monthIndex(series[series.length - 1].date),
  );
  console.log(
    `[nber-ref] ${covered.length} NBER recessions covered by the substrate (of ${NBER_RECESSIONS.length} total):`,
  );
  for (const r of covered) console.log(`  - ${r.start} → ${r.end}`);

  console.log("[nber-ref] labelling windows...");
  const labels = buildRecessionLabels(series, DEFAULTS.lookahead);
  const labelTrueCount = labels.filter(Boolean).length;
  console.log(
    `[nber-ref] ${labelTrueCount}/${labels.length} observations have a recession start in the next ${DEFAULTS.lookahead} months (full-series base rate ${((labelTrueCount / labels.length) * 100).toFixed(2)}%)`,
  );

  console.log("[nber-ref] sliding window → F per window...");
  const values = series.map((p) => p.metric_value);
  const winSize = DEFAULTS.windowSize;
  const holdoutFrac = 0.2;
  const fValues: number[] = [];
  const fLabels: boolean[] = [];
  for (let wEnd = winSize; wEnd < values.length; wEnd++) {
    const window = values.slice(wEnd - winSize, wEnd);
    const holdoutStart = Math.floor(window.length * (1 - holdoutFrac));
    if (holdoutStart < 2 || holdoutStart >= window.length) continue;
    const pred = arOneFitAndPredict(window, holdoutStart);
    if (!pred) continue;
    const fit = outOfSampleFit(window, pred);
    if (!Number.isFinite(fit.score)) continue;
    fValues.push(fit.score);
    fLabels.push(labels[wEnd - 1]);
  }
  const eventsInUsedWindows = fLabels.filter(Boolean).length;
  console.log(
    `[nber-ref] ${fValues.length} usable (F, label) pairs; ${eventsInUsedWindows} with recession-soon label (${((eventsInUsedWindows / fValues.length) * 100).toFixed(2)}%)`,
  );

  // Binning into equal-width bins on [0, 1].
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
    substrateId: DEFAULTS.substrateLabel,
    eventLabel: `NBER US recession start in next ${DEFAULTS.lookahead} months`,
    windowSize: DEFAULTS.windowSize,
    lookahead: DEFAULTS.lookahead,
    totalWindows: fValues.length,
    totalEvents: eventsInUsedWindows,
    baseRate: fValues.length === 0 ? 0 : eventsInUsedWindows / fValues.length,
    bins,
    buildMeta: {
      builderVersion: DEFAULTS.builderVersion,
      builtAt: new Date().toISOString(),
      source: `${DEFAULTS.substrateDisplay} × NBER recession dates (US Business Cycle Dating Committee)`,
      cohortFrom: series[0].date,
      cohortTo: series[series.length - 1].date,
    },
  };

  const outDir = path.join(repoRoot, "public", "relevance-references");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${DEFAULTS.referenceId}.json`);
  await fs.writeFile(outPath, JSON.stringify(reference, null, 2));
  console.log("");
  console.log(`[nber-ref] wrote ${path.relative(repoRoot, outPath)}`);
  console.log("");
  console.log("Histogram (F bin → empirical recession-soon rate):");
  for (const b of bins) {
    const rate = Number.isFinite(b.eventRate)
      ? `${(b.eventRate * 100).toFixed(1)}%`
      : "(empty)";
    console.log(
      `  [${b.binLow.toFixed(1)}-${b.binHigh.toFixed(1)})  n=${String(b.count).padStart(4)}  rate=${rate}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
