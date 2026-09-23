// ─── Network activity heatmap series ────────────────────────────────
//
// Computes a per-bucket "system activity" intensity series across the
// visible timeline, derived from real per-node ω history in
// `temporalData`. The result is rendered as a colour-coded strip on
// the TimeDial track so the user can see, at a glance, where in time
// the system was actually moving — high-activity windows look red,
// quiet ones look green.
//
// Activity definition (chosen for "actual quantitative, not synthetic"):
//   For each bucket [t_i, t_{i+1}]:
//     for every node with history covering that range:
//       Δω_node = |ω(t_{i+1}) - ω(t_i)|        (linear-interp the
//                                                history at both ends)
//     bucket_activity = sum of Δω_node across all such nodes
//
// We then divide each bucket by the bucket width in seconds so a
// 12-hour bucket and a 1-day bucket compare on the same rate scale,
// and normalize the final series across [0, 1] using its own
// 95th-percentile max (resistant to a single huge spike). Bucket
// timestamps are evenly spaced from `start` to `end`, matching the
// TimeDial track's pixel mapping exactly so the heatmap aligns
// frame-perfect with the scrubber and the chart above.

import type { TemporalDataset } from "@/lib/temporal-state-helpers";

/**
 * Binary-search the rightmost index in `history` whose timestamp is
 * ≤ `target`. Returns -1 if `target` precedes every entry.
 *
 * Caller uses this on both ends of a bucket and linearly interpolates
 * between the bracketing samples — preserves the real shape of the
 * curve between sparse history points (e.g. World Bank annual series
 * that publish once a year would otherwise contribute Δω = 0 to
 * every intra-year bucket).
 */
function findLE(
  history: { timestamp: number }[],
  target: number,
): number {
  if (history.length === 0 || history[0].timestamp > target) return -1;
  let lo = 0;
  let hi = history.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (history[mid].timestamp <= target) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Linearly interpolate the omega value at `target` from the closest
 * bracketing history samples. Returns null if the target falls outside
 * the node's recorded range (the node hadn't appeared yet, or hasn't
 * published since) — those nodes don't contribute to the bucket.
 */
function omegaAt(
  history: { timestamp: number; omegaComposite: number }[],
  target: number,
): number | null {
  const i = findLE(history, target);
  if (i === -1) return null;
  if (i === history.length - 1) {
    // After the last sample. Hold-forward feels wrong for an "activity"
    // measure — a stale node contributes 0, not its last-known value
    // baked forward forever. Return null so it's skipped.
    return history[i].timestamp === target ? history[i].omegaComposite : null;
  }
  const a = history[i];
  const b = history[i + 1];
  const span = b.timestamp - a.timestamp;
  if (span <= 0) return a.omegaComposite;
  const t = (target - a.timestamp) / span;
  return a.omegaComposite + (b.omegaComposite - a.omegaComposite) * t;
}

export interface ActivitySeries {
  /** Normalized activity per bucket, length === `buckets`. Each value
   *  is in [0, 1] after clamping to the series' p95 reference. */
  values: number[];
  /** True iff at least one bucket has a positive activity reading.
   *  When false the renderer should skip drawing the strip entirely —
   *  a flat all-zero map reads as "broken feature", not "quiet system". */
  hasSignal: boolean;
}

/**
 * Compute the heatmap series for a given timeline window. Pure
 * function of (temporalData, start, end, buckets) — memoize at the
 * call site. O(N · buckets · log H) where N = nodes-with-history,
 * H = avg history length.
 */
export function computeActivitySeries(
  temporalData: TemporalDataset | null,
  start: number,
  end: number,
  buckets: number,
): ActivitySeries {
  const values = new Array<number>(buckets).fill(0);
  if (!temporalData || end <= start || buckets <= 0) {
    return { values, hasSignal: false };
  }

  const span = end - start;
  const bucketSpan = span / buckets;
  // Per-second normalization so 12-hour buckets and 1-day buckets
  // compare on the same rate scale. Without this, a longer-window
  // dial would naturally show "more activity" per bucket even if the
  // underlying system was quieter — pure artefact of bucketing.
  const bucketSpanSec = bucketSpan / 1000;
  if (bucketSpanSec <= 0) return { values, hasSignal: false };

  for (const node of temporalData.nodes.values()) {
    const h = node.history;
    if (h.length < 2) continue;
    // Early-out: skip nodes whose entire history is outside the window.
    if (h[h.length - 1].timestamp < start || h[0].timestamp > end) continue;

    for (let i = 0; i < buckets; i++) {
      const tStart = start + i * bucketSpan;
      const tEnd = tStart + bucketSpan;
      const a = omegaAt(h, tStart);
      const b = omegaAt(h, tEnd);
      if (a === null || b === null) continue;
      values[i] += Math.abs(b - a);
    }
  }

  // Normalize per-second so window length doesn't bias intensity.
  for (let i = 0; i < buckets; i++) values[i] /= bucketSpanSec;

  // Robust normalization: scale by the 95th percentile so a single
  // black-swan spike doesn't compress everything else to near-zero.
  // Anything ≥ p95 saturates to 1.
  const sorted = [...values].filter((v) => v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return { values, hasSignal: false };
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1];
  if (p95 <= 0) return { values, hasSignal: false };
  for (let i = 0; i < buckets; i++) {
    values[i] = Math.min(1, values[i] / p95);
  }
  return { values, hasSignal: true };
}

/**
 * Build a CSS linear-gradient string from the activity series.
 * Each bucket renders as a uniform-colour band. Green at activity = 0,
 * amber at 0.5, red at 1 — matches the system's existing critical /
 * caution / safe semantics so users don't have to learn a new palette.
 *
 * Caller paints this as `background: gradientFromActivity(...)` on a
 * `<div>` sized to the track width.
 */
export function gradientFromActivity(series: ActivitySeries): string {
  const { values } = series;
  if (values.length === 0) return "transparent";
  const stops: string[] = [];
  for (let i = 0; i < values.length; i++) {
    const a = values[i];
    const colour = activityToColour(a);
    const startPct = (i / values.length) * 100;
    const endPct = ((i + 1) / values.length) * 100;
    stops.push(`${colour} ${startPct.toFixed(3)}%`);
    stops.push(`${colour} ${endPct.toFixed(3)}%`);
  }
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

function activityToColour(a: number): string {
  // Hue 120° (green) → 60° (amber) → 0° (red). Lightness damped at the
  // low end so quiet buckets sit closer to the surface-elevated tone
  // and don't visually compete with the track's filled-portion
  // gradient. Alpha caps at 0.85 so the cursor + tick marks remain
  // visible on top.
  const hue = 120 * (1 - a);
  const sat = 70;
  const light = 35 + a * 10; // 35% → 45%
  const alpha = 0.25 + a * 0.6; // 0.25 → 0.85
  return `hsla(${hue.toFixed(1)}, ${sat}%, ${light}%, ${alpha.toFixed(2)})`;
}
