// ─── Pareto relevance — calibrated reference lookup ──────────────
//
// Per-selection live F·E·G·S·M is already wired. What this module adds is
// an interpretive layer: given the live F (or composite) computed on the
// user's current lasso selection, look up what that score level has meant
// historically against a real analyst-domain event ground truth.
//
// Architecture
// ------------
// Two pieces, by design:
//
//   1. BUILD-TIME (offline) — `scripts/build-fred-relevance-reference.ts`
//      Pulls a real public macro series (FRED HY OAS), slides a window
//      across its history, fits the same `outOfSampleFit` helper that
//      ships in the Pareto card, labels each window with "did a stress
//      event happen in the next N steps?", and bins (F → empirical event
//      rate). The output is a small JSON committed to
//      `public/relevance-references/<id>.json`.
//
//   2. RUN-TIME (per-selection, every lasso) — `lookupRelevanceReference`
//      Takes the live F from the active selection, finds the matching
//      bin in the reference, returns `{ eventRate, percentile, n }`. The
//      reference table is fixed; the per-selection score IS what's live —
//      the lookup answer changes every time the user reselects because
//      the live F changes.
//
// Why this shape
// --------------
// - Modular by construction. The reference is a static asset; the live
//   score is per-selection; the lookup is stateless.
// - Honest. The reference declares its substrate, label definition, and
//   build metadata so the UI can disclose exactly what F=0.71 means
//   under THIS reference (vs. a different one).
// - Cheap to ship. The reference JSON is ~few KB; no API call per lasso;
//   no offline compute on the user's machine.
// - Graceful when no reference exists. `loadRelevanceReference` resolves
//   to null on 404, and the UI degrades silently — no false signal in
//   profiles that haven't been calibrated yet.

// ─── Types ──────────────────────────────────────────────────────

export interface ReferenceBin {
  /** Lower bound (inclusive). */
  binLow: number;
  /** Upper bound (exclusive on all but the last bin). */
  binHigh: number;
  /** Number of windows in this bin. */
  count: number;
  /** Number of windows in this bin where the labelled event occurred. */
  eventCount: number;
  /** eventCount / count. NaN when count = 0; UI must guard. */
  eventRate: number;
}

export interface RelevanceReference {
  /** Stable id (also the basename of the JSON file under public/). */
  referenceId: string;
  /** Time series F was fit to (e.g. "BAMLH0A0HYM2"). */
  substrateId: string;
  /** Plain-English description of the binary event being predicted. */
  eventLabel: string;
  /** Per-window length used to compute F. */
  windowSize: number;
  /** Lookahead in the same units as the substrate's sample cadence. */
  lookahead: number;
  /** Total windows in the build. */
  totalWindows: number;
  /** Windows where the future event occurred. */
  totalEvents: number;
  /** totalEvents / totalWindows. */
  baseRate: number;
  /** Histogram of (F → event rate). Bins cover [0, 1] contiguously. */
  bins: ReferenceBin[];
  /** Diagnostic metadata that the UI surfaces for full disclosure. */
  buildMeta: {
    builderVersion: string;
    /** ISO timestamp of when the reference was built. */
    builtAt: string;
    /** Human-readable source URL or citation. */
    source: string;
    /** First / last sample of the substrate cohort included in the build. */
    cohortFrom: string;
    cohortTo: string;
  };
}

export interface ReferenceLookupResult {
  /** Empirical event rate in the bin containing F. NaN when bin is empty. */
  eventRate: number;
  /** Quantile of F vs the reference distribution (0..1). */
  percentile: number;
  /** Number of windows in the bin containing F. 0 → eventRate undefined. */
  n: number;
  /** Reference's overall baseRate, for comparison context. */
  baseRate: number;
  /** Carries through for UI disclosure. */
  referenceId: string;
  eventLabel: string;
}

// ─── Lookup ─────────────────────────────────────────────────────

/**
 * Find the bin containing F in the reference and return its event rate +
 * percentile + bin count + baseRate.
 *
 * F is clamped to [0, 1]. When the bin containing F is empty, eventRate
 * is NaN and the UI must surface "insufficient calibration coverage at
 * this F level" rather than a misleading number.
 */
export function lookupRelevanceReference(
  ref: RelevanceReference,
  f: number,
): ReferenceLookupResult {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(f) ? f : 0));

  // Bins are sorted ascending in build output. Binary scan for the one
  // whose [binLow, binHigh) contains clamped (last bin is closed at top).
  let bin: ReferenceBin | undefined;
  for (let i = 0; i < ref.bins.length; i++) {
    const b = ref.bins[i];
    const isLast = i === ref.bins.length - 1;
    if (
      (clamped >= b.binLow && clamped < b.binHigh) ||
      (isLast && clamped <= b.binHigh)
    ) {
      bin = b;
      break;
    }
  }
  if (!bin) {
    // F outside any bin — shouldn't happen after clamping, but if the
    // reference is malformed, fall back to the nearest bin instead of
    // throwing (the lookup must never break the card).
    bin = ref.bins[ref.bins.length - 1] ?? {
      binLow: 0,
      binHigh: 1,
      count: 0,
      eventCount: 0,
      eventRate: Number.NaN,
    };
  }

  // Empirical percentile = cumulative window count up to and including
  // this bin / total windows. Linear interpolation within the bin gives
  // sub-bin resolution.
  let cumulative = 0;
  for (const b of ref.bins) {
    if (b === bin) {
      const span = Math.max(1e-9, bin.binHigh - bin.binLow);
      const frac = (clamped - bin.binLow) / span;
      cumulative += bin.count * Math.max(0, Math.min(1, frac));
      break;
    }
    cumulative += b.count;
  }
  const percentile =
    ref.totalWindows > 0
      ? Math.max(0, Math.min(1, cumulative / ref.totalWindows))
      : 0;

  return {
    eventRate: bin.eventRate,
    percentile,
    n: bin.count,
    baseRate: ref.baseRate,
    referenceId: ref.referenceId,
    eventLabel: ref.eventLabel,
  };
}

// ─── JSON load + cache ──────────────────────────────────────────

const referenceCache = new Map<string, RelevanceReference | null>();
const inflightLoads = new Map<string, Promise<RelevanceReference | null>>();

/**
 * Fetch a reference JSON from /relevance-references/<id>.json with
 * module-level caching. Resolves to null on any failure (404, parse
 * error, network) — the UI degrades silently when a reference doesn't
 * exist yet for the active profile.
 *
 * The cache is keyed by referenceId and never refreshed during a
 * session. References are build-time artifacts; a deploy invalidates
 * them by changing the underlying URL fingerprint.
 */
export async function loadRelevanceReference(
  referenceId: string,
): Promise<RelevanceReference | null> {
  if (referenceCache.has(referenceId)) return referenceCache.get(referenceId)!;
  const existing = inflightLoads.get(referenceId);
  if (existing) return existing;
  if (typeof fetch === "undefined") {
    referenceCache.set(referenceId, null);
    return null;
  }

  const load = (async () => {
    try {
      const res = await fetch(`/relevance-references/${referenceId}.json`, {
        // Bounded budget so a slow CDN never blocks the card.
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        referenceCache.set(referenceId, null);
        return null;
      }
      const json = (await res.json()) as unknown;
      if (!isValidReference(json)) {
        console.warn(
          `[relevance-reference] ${referenceId}: malformed JSON, ignoring`,
        );
        referenceCache.set(referenceId, null);
        return null;
      }
      referenceCache.set(referenceId, json);
      return json;
    } catch (err) {
      // Never throw upward — a missing reference must not break the
      // Pareto card. Log once, cache the null, move on.
      console.warn(`[relevance-reference] ${referenceId}: load failed`, err);
      referenceCache.set(referenceId, null);
      return null;
    } finally {
      inflightLoads.delete(referenceId);
    }
  })();
  inflightLoads.set(referenceId, load);
  return load;
}

/** Validate a candidate JSON value against the `RelevanceReference` shape. */
function isValidReference(v: unknown): v is RelevanceReference {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  if (typeof r.referenceId !== "string") return false;
  if (typeof r.substrateId !== "string") return false;
  if (typeof r.eventLabel !== "string") return false;
  if (typeof r.windowSize !== "number" || !Number.isFinite(r.windowSize)) return false;
  if (typeof r.totalWindows !== "number") return false;
  if (typeof r.baseRate !== "number") return false;
  if (!Array.isArray(r.bins) || r.bins.length === 0) return false;
  for (const b of r.bins) {
    if (typeof b !== "object" || b === null) return false;
    const bb = b as Record<string, unknown>;
    if (typeof bb.binLow !== "number") return false;
    if (typeof bb.binHigh !== "number") return false;
    if (typeof bb.count !== "number") return false;
    if (typeof bb.eventRate !== "number") return false;
  }
  return true;
}

/**
 * Test-only: clear the module-level cache. Production callers don't
 * need this; the cache key is referenceId and entries are immutable
 * for the lifetime of the page.
 */
export function _resetRelevanceReferenceCache(): void {
  referenceCache.clear();
  inflightLoads.clear();
}
