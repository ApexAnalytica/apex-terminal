// ─── Graph-wide calculation history — localStorage persistence ───────
//
// The CALCULATIONS panel lets the user push graph-wide calc values
// ("→ DIAL") into `graphCalcHistory` so they accumulate a trajectory
// rendered as an inline sparkline. That history lived only in memory
// and died on every page reload, which undercut the whole "track over
// time" story. These helpers persist it to localStorage.
//
// Scope decision: only graphCalcHistory persists, not the full store.
// The graph itself, selection, timeline position etc. are session
// state — reload should reset them. Calc trajectories are the one
// thing the user is deliberately building up over time, so they're
// the only thing worth surviving a refresh.

export type GraphCalcHistory = Record<
  string,
  { value: number; observedAt: string }[]
>;

const STORAGE_KEY = "manifold:graph-calc-history";
const MAX_ENTRIES_PER_CALC = 60; // mirrors LIVE_HISTORY_MAX

/**
 * Load persisted graph-calc history. SSR-safe (returns {} when
 * localStorage is unavailable). Defensively validates the shape so a
 * corrupted / hand-edited entry can't crash hydration — anything that
 * doesn't parse to the expected structure is dropped.
 */
export function loadGraphCalcHistory(): GraphCalcHistory {
  if (typeof window === "undefined" || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: GraphCalcHistory = {};
    for (const [calcId, entries] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (!Array.isArray(entries)) continue;
      const clean = entries.filter(
        (e): e is { value: number; observedAt: string } =>
          !!e &&
          typeof e === "object" &&
          typeof (e as { value?: unknown }).value === "number" &&
          Number.isFinite((e as { value: number }).value) &&
          typeof (e as { observedAt?: unknown }).observedAt === "string",
      );
      if (clean.length > 0) {
        out[calcId] = clean.slice(-MAX_ENTRIES_PER_CALC);
      }
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Persist graph-calc history. SSR-safe + swallows quota / serialization
 * errors (persistence is best-effort; a failure must never break the
 * push action that triggered it).
 */
export function saveGraphCalcHistory(history: GraphCalcHistory): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // ignore — quota exceeded, private-mode, etc.
  }
}
