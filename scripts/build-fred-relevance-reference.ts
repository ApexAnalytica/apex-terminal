// ─── Build a relevance-reference JSON from FRED HY OAS ──────────
//
// Offline builder. Pulls the full history of a FRED series, slides a
// window across it, fits the SAME `outOfSampleFit` helper the Pareto
// card uses live, labels each window with "did a stress event happen
// in the next N steps?", and bins (F → empirical event rate). The
// output is a small JSON committed to public/relevance-references/.
//
// Run-time pipeline: scripts/build-fred-relevance-reference.ts (this
// file) → public/relevance-references/<id>.json → loaded once per
// page by src/lib/pareto-relevance-reference.ts → per-selection
// lookup against the live F.
//
// Usage:
//   FRED_API_KEY=… npx tsx scripts/build-fred-relevance-reference.ts
//
// Defaults match the geopolitical profile: BAMLH0A0HYM2 (ICE BofA US
// High Yield OAS) as the substrate; "OAS spiked above the rolling
// 95th percentile in the next 24 weeks" as the event label; window
// = 60 weeks; bins = 10 equal-width over [0, 1].

import * as fs from "fs/promises";
import * as path from "path";
import { outOfSampleFit } from "../src/lib/pareto-relevance";

// ─── Defaults ───────────────────────────────────────────────────

const DEFAULTS = {
  referenceId: "fred-hy-oas-stress",
  substrateId: "BAMLH0A0HYM2",
  // FRED HY OAS publishes daily; we resample to weekly to match the
  // typical analyst-card scope length (weeks of macro signal).
  weeklyResampling: true,
  windowSize: 60,        // weeks
  lookahead: 24,         // weeks — "stress within next 24 weeks"
  spikePercentile: 0.95, // rolling 95th percentile defines "spike"
  rollingWindow: 156,    // weeks (~3 years) for the rolling percentile
  binCount: 10,
  cohortFromYear: 2000,  // FRED BAMLH0A0HYM2 starts 1996; 2000 trims early-history noise
  builderVersion: "0.1.0",
};

// ─── FRED fetch ─────────────────────────────────────────────────

interface FredObs {
  date: string;
  value: number;
}

async function fetchSeries(seriesId: string, apiKey: string): Promise<FredObs[]> {
  const url =
    "https://api.stlouisfed.org/fred/series/observations" +
    `?series_id=${seriesId}` +
    `&api_key=${apiKey}` +
    `&file_type=json` +
    `&sort_order=asc` +
    `&observation_start=${DEFAULTS.cohortFromYear}-01-01`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`FRED ${seriesId}: HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    observations?: Array<{ date: string; value: string }>;
  };
  const raw = body.observations ?? [];
  const out: FredObs[] = [];
  for (const o of raw) {
    if (o.value === "." || o.value == null) continue;
    const v = Number(o.value);
    if (!Number.isFinite(v)) continue;
    out.push({ date: o.date, value: v });
  }
  if (out.length === 0) {
    throw new Error(`FRED ${seriesId}: zero parseable observations`);
  }
  return out;
}

// ─── Resample daily → weekly (Friday close) ─────────────────────

function resampleToWeekly(obs: FredObs[]): FredObs[] {
  // Take the last observation per ISO-week. FRED BAMLH0A0HYM2 is
  // daily on business days; "Friday close" is the natural pick.
  const byWeek = new Map<string, FredObs>();
  for (const o of obs) {
    const d = new Date(`${o.date}T00:00:00Z`);
    const week = isoWeekKey(d);
    const prev = byWeek.get(week);
    if (!prev || prev.date < o.date) byWeek.set(week, o);
  }
  return Array.from(byWeek.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function isoWeekKey(d: Date): string {
  // ISO-8601 week-of-year. Returns "YYYY-W##".
  const target = new Date(d.valueOf());
  const dayNr = (d.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = (target.valueOf() - firstThursday.valueOf()) / 86400000;
  const week = 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// ─── Event labelling: rolling-percentile spike ──────────────────

/**
 * For each timestep t, is there an OAS spike (value > rolling-window
 * 95th percentile) within the next `lookahead` steps?
 */
function buildEventLabels(
  values: number[],
  rollingWindow: number,
  spikePercentile: number,
  lookahead: number,
): boolean[] {
  const labels = new Array<boolean>(values.length).fill(false);
  for (let t = 0; t < values.length; t++) {
    const lookEnd = Math.min(values.length, t + 1 + lookahead);
    let event = false;
    for (let s = t + 1; s < lookEnd; s++) {
      const rollStart = Math.max(0, s - rollingWindow);
      const window = values.slice(rollStart, s);
      if (window.length < 30) continue;
      const sorted = [...window].sort((a, b) => a - b);
      const p =
        sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * spikePercentile))];
      if (values[s] > p) {
        event = true;
        break;
      }
    }
    labels[t] = event;
  }
  return labels;
}

// ─── AR(1) prediction for the sliding F window ──────────────────

/**
 * Same shape as the in-app CSD model: fit AR(1) on the leading
 * portion, predict the held-out tail, return the model series of the
 * same length as the input window. `outOfSampleFit` then computes F
 * the same way the live card does.
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

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    console.error(
      "FRED_API_KEY is required.\n" +
        "Get one at https://fred.stlouisfed.org/docs/api/api_key.html\n" +
        "Then re-run: FRED_API_KEY=… npx tsx scripts/build-fred-relevance-reference.ts",
    );
    process.exit(1);
  }
  const repoRoot = process.cwd();
  console.log(`[ref-build] fetching ${DEFAULTS.substrateId} from FRED...`);
  const daily = await fetchSeries(DEFAULTS.substrateId, apiKey);
  console.log(
    `[ref-build] ${daily.length} daily observations from ${daily[0].date} to ${daily[daily.length - 1].date}`,
  );

  const series = DEFAULTS.weeklyResampling ? resampleToWeekly(daily) : daily;
  console.log(`[ref-build] ${series.length} weekly observations after resample`);
  const values = series.map((o) => o.value);
  const dates = series.map((o) => o.date);

  console.log("[ref-build] labelling stress events...");
  const labels = buildEventLabels(
    values,
    DEFAULTS.rollingWindow,
    DEFAULTS.spikePercentile,
    DEFAULTS.lookahead,
  );
  const totalEvents = labels.filter(Boolean).length;
  console.log(
    `[ref-build] ${totalEvents}/${labels.length} windows labelled stress=true (base rate ${(
      (totalEvents / labels.length) * 100
    ).toFixed(2)}%)`,
  );

  console.log("[ref-build] sliding window → F per window...");
  // For each window ending at index wEnd, fit AR(1), compute F, pair
  // with label[wEnd]. Holdout = trailing 20% of the window.
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
  console.log(`[ref-build] ${fValues.length} usable (F, label) pairs`);

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
    substrateId: DEFAULTS.substrateId,
    eventLabel: `OAS spike above rolling-${DEFAULTS.rollingWindow}-week ${(
      DEFAULTS.spikePercentile * 100
    ).toFixed(0)}th percentile within next ${DEFAULTS.lookahead} weeks`,
    windowSize: DEFAULTS.windowSize,
    lookahead: DEFAULTS.lookahead,
    totalWindows: fValues.length,
    totalEvents: fLabels.filter(Boolean).length,
    baseRate:
      fLabels.length === 0 ? 0 : fLabels.filter(Boolean).length / fLabels.length,
    bins,
    buildMeta: {
      builderVersion: DEFAULTS.builderVersion,
      builtAt: new Date().toISOString(),
      source: `FRED · ${DEFAULTS.substrateId} (https://fred.stlouisfed.org/series/${DEFAULTS.substrateId})`,
      cohortFrom: dates[0],
      cohortTo: dates[dates.length - 1],
    },
  };

  const outDir = path.join(repoRoot, "public", "relevance-references");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${DEFAULTS.referenceId}.json`);
  await fs.writeFile(outPath, JSON.stringify(reference, null, 2));
  console.log("");
  console.log(`[ref-build] wrote ${path.relative(repoRoot, outPath)}`);
  console.log("");
  console.log("Histogram (F bin → empirical event rate):");
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
