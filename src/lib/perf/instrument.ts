// ─── Performance instrumentation ────────────────────────────────────
//
// Lightweight wrapper around `performance.mark` / `performance.measure`
// for the three paths that historically dominate Manifold's frame
// budget: app launch, per-feed-tick processing, view-mode switch.
//
// Each call site uses `mark(start)` / `mark(end)` and the aggregator
// computes mean / p50 / p95 over a rolling window so the inspector
// shows useful numbers instead of one-shot noise. Snapshot via
// `window.__manifoldPerf` in DevTools.
//
// Goals:
//  - Zero overhead in production builds (helpers compile to no-ops via
//    a single env check; the User Timing API entries don't accumulate
//    because mark/measure aren't called at all).
//  - No third-party deps and no React tree integration — the call
//    sites just import a function and call it.
//  - Bounded memory: each measurement keeps the last 100 samples.

const ENABLED =
  typeof window !== "undefined" &&
  typeof performance !== "undefined" &&
  process.env.NODE_ENV !== "production";

const ROLLING_WINDOW = 100;

interface Aggregate {
  samples: number[]; // ring of last N durations, ms
  total: number; // monotonic count since session start
}

const aggregates = new Map<string, Aggregate>();

/**
 * Mark a named instant in the User Timing timeline. No-op in prod.
 * Pair start/end marks with the same suffix convention
 * (`"launch:start"` / `"launch:end"`) so `measureBetween` can join
 * them automatically.
 */
export function mark(name: string): void {
  if (!ENABLED) return;
  try {
    performance.mark(name);
  } catch {
    // mark() throws on invalid name characters — swallow rather than
    // breaking the call site, which is by definition non-critical.
  }
}

/**
 * Measure between two previously-marked instants and record the
 * duration in the rolling aggregate keyed on `measureName`. Returns
 * the duration in ms (or 0 in prod / on failure).
 */
export function measureBetween(
  measureName: string,
  startMark: string,
  endMark: string,
): number {
  if (!ENABLED) return 0;
  try {
    const entry = performance.measure(measureName, startMark, endMark);
    record(measureName, entry.duration);
    return entry.duration;
  } catch {
    return 0;
  }
}

/**
 * One-shot helper: marks an end, measures from a start mark created
 * elsewhere, and records the result. Use when the start mark is known
 * but you don't want a manual `mark + measure` pair.
 */
export function endMeasure(
  measureName: string,
  startMark: string,
): number {
  if (!ENABLED) return 0;
  const endMark = `${measureName}:__end_${Date.now()}_${Math.random()}`;
  mark(endMark);
  return measureBetween(measureName, startMark, endMark);
}

/**
 * Record a raw duration without using marks. Useful when you measure
 * with `performance.now()` directly (e.g. inside a tight loop where
 * the User Timing buffer would itself add overhead).
 */
export function record(measureName: string, durationMs: number): void {
  if (!ENABLED) return;
  let agg = aggregates.get(measureName);
  if (!agg) {
    agg = { samples: [], total: 0 };
    aggregates.set(measureName, agg);
  }
  agg.samples.push(durationMs);
  if (agg.samples.length > ROLLING_WINDOW) agg.samples.shift();
  agg.total += 1;
}

interface MeasurementSummary {
  count: number;
  mean: number;
  p50: number;
  p95: number;
  min: number;
  max: number;
  last: number;
}

/**
 * Snapshot the current aggregates as a plain object — call from
 * DevTools via `window.__manifoldPerf.snapshot()` for a quick read.
 */
export function snapshot(): Record<string, MeasurementSummary> {
  const out: Record<string, MeasurementSummary> = {};
  for (const [name, agg] of aggregates) {
    if (agg.samples.length === 0) continue;
    const sorted = [...agg.samples].sort((a, b) => a - b);
    const sum = sorted.reduce((s, v) => s + v, 0);
    out[name] = {
      count: agg.total,
      mean: sum / sorted.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      min: sorted[0],
      max: sorted[sorted.length - 1],
      last: agg.samples[agg.samples.length - 1],
    };
  }
  return out;
}

/** Reset all aggregates. Useful when starting a fresh measurement run. */
export function reset(): void {
  aggregates.clear();
  if (ENABLED) {
    try {
      performance.clearMarks();
      performance.clearMeasures();
    } catch {
      // ignore — older browsers without selective clear support
    }
  }
}

/**
 * Pretty-print the current snapshot to the console as a single table.
 * Easier to scan than the raw object — durations rounded to 2dp.
 */
export function logSnapshot(): void {
  if (!ENABLED) return;
  const snap = snapshot();
  const rows = Object.entries(snap).map(([name, s]) => ({
    name,
    count: s.count,
    mean_ms: +s.mean.toFixed(2),
    p50_ms: +s.p50.toFixed(2),
    p95_ms: +s.p95.toFixed(2),
    last_ms: +s.last.toFixed(2),
    min_ms: +s.min.toFixed(2),
    max_ms: +s.max.toFixed(2),
  }));
  console.table(rows);
}

// Expose to DevTools. The check matches ENABLED so production never
// has the global at all; dev sessions can `__manifoldPerf.logSnapshot()`
// directly from the console.
if (ENABLED) {
  (window as unknown as { __manifoldPerf: unknown }).__manifoldPerf = {
    snapshot,
    logSnapshot,
    reset,
    mark,
    measureBetween,
    record,
  };
}
