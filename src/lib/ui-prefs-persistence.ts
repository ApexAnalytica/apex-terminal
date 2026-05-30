// ─── UI preferences — localStorage persistence ──────────────────────
//
// Small, deliberate UI choices the user makes that should outlive a
// page reload — distinct from session state (graph, selection, timeline
// position) which intentionally resets. Kept separate from
// calc-history-persistence so each file owns exactly one concern.

const BOTTOM_DOCK_COLLAPSED_KEY = "manifold:bottom-dock-collapsed";
const WATCHLIST_COLLAPSED_KEY = "manifold:watchlist-collapsed";
const PINNED_SERIES_KEY = "manifold:pinned-series";

/**
 * Load the persisted bottom-dock collapsed preference. SSR-safe.
 * Returns `null` when nothing is stored (or storage is unavailable) so
 * the caller can keep its own default rather than being forced to false.
 */
export function loadBottomDockCollapsed(): boolean | null {
  return loadBoolFlag(BOTTOM_DOCK_COLLAPSED_KEY);
}

/**
 * Persist the bottom-dock collapsed preference. SSR-safe + swallows
 * quota / private-mode errors (best-effort; must never break the toggle
 * that triggered it).
 */
export function saveBottomDockCollapsed(collapsed: boolean): void {
  saveBoolFlag(BOTTOM_DOCK_COLLAPSED_KEY, collapsed);
}

/** Watchlist column (inside the dock) collapsed-to-left preference. */
export function loadWatchlistCollapsed(): boolean | null {
  return loadBoolFlag(WATCHLIST_COLLAPSED_KEY);
}
export function saveWatchlistCollapsed(collapsed: boolean): void {
  saveBoolFlag(WATCHLIST_COLLAPSED_KEY, collapsed);
}

export interface PersistedPinnedSeries {
  nodes: string[];
  calcs: string[];
}

/**
 * Load persisted pinned series (both node curves and graph-calc
 * trajectories). Pruning to the current graph is the caller's job — we
 * just hand back whatever was stored. Defensively validates the shape;
 * a corrupted entry returns null so the caller keeps its in-memory
 * default rather than wiping pins.
 */
export function loadPinnedSeries(): PersistedPinnedSeries | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(PINNED_SERIES_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as { nodes?: unknown; calcs?: unknown };
    const nodes = Array.isArray(obj.nodes)
      ? obj.nodes.filter((x): x is string => typeof x === "string")
      : [];
    const calcs = Array.isArray(obj.calcs)
      ? obj.calcs.filter((x): x is string => typeof x === "string")
      : [];
    return { nodes, calcs };
  } catch {
    return null;
  }
}

/** Persist pinned series. Best-effort. */
export function savePinnedSeries(pins: PersistedPinnedSeries): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(PINNED_SERIES_KEY, JSON.stringify(pins));
  } catch {
    // ignore — quota exceeded, private-mode, etc.
  }
}

// ─── shared helpers ─────────────────────────────────────────────────

function loadBoolFlag(key: string): boolean | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    return raw === "1";
  } catch {
    return null;
  }
}

function saveBoolFlag(key: string, value: boolean): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // ignore — quota exceeded, private-mode, etc.
  }
}

