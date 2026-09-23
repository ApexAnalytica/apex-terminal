// ─── UI preferences — localStorage persistence ──────────────────────
//
// Small, deliberate UI choices the user makes that should outlive a
// page reload — distinct from session state (graph, selection, timeline
// position) which intentionally resets. Kept separate from
// calc-history-persistence so each file owns exactly one concern.

import type { SystemStateSnapshot } from "@/lib/snapshots/types";

const BOTTOM_DOCK_COLLAPSED_KEY = "manifold:bottom-dock-collapsed";
const WATCHLIST_COLLAPSED_KEY = "manifold:watchlist-collapsed";
const PINNED_SERIES_KEY = "manifold:pinned-series";
const SEVERED_EDGES_KEY = "manifold:severed-edges";
const ENABLED_AXIOMS_KEY = "manifold:enabled-axioms";
const SNAPSHOT_HISTORY_KEY = "manifold:snapshot-history";
const VIEW_MODE_KEY = "manifold:view-mode";
const ACTIVE_MODULE_KEY = "manifold:active-module";
const NODE_SIZE_METRIC_KEY = "manifold:node-size-metric";
const VISIBLE_EDGE_TYPES_KEY = "manifold:visible-edge-types";
const TRUTH_FILTER_KEY = "manifold:truth-filter";
const ACTIVE_PERSONA_KEY = "manifold:active-persona";
const SELECTED_DATA_SOURCES_KEY = "manifold:selected-data-sources";

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

// ─── Pearl scissors mode: severed edges ─────────────────────────────
//
// User-curated edge severs are real interdiction work, not session
// state. Pruning to the current graph happens on hydration (caller's
// job) so stale ids drop silently.

export function loadSeveredEdges(): string[] | null {
  return loadStringArray(SEVERED_EDGES_KEY);
}
export function saveSeveredEdges(edges: string[]): void {
  saveStringArray(SEVERED_EDGES_KEY, edges);
}

// ─── Tarski axioms: user's enabled subset ───────────────────────────
//
// Serialized as a sorted array; the store keeps it as a Set. An empty
// stored array means "explicit empty subset" (user disabled all); a
// missing key means "never customized" → fall back to default.

export function loadEnabledAxioms(): string[] | null {
  return loadStringArray(ENABLED_AXIOMS_KEY);
}
export function saveEnabledAxioms(axioms: Set<string>): void {
  saveStringArray(ENABLED_AXIOMS_KEY, Array.from(axioms).sort());
}

// ─── Snapshot history (Pareto panel captures) ───────────────────────
//
// `SystemStateSnapshot` is a slim summary (~50 nodes + a few floats
// each), so even the 50-entry cap stays well under localStorage's
// ~5MB quota. Persisted as a JSON array; defensive on parse so a
// corrupted entry returns null and the store keeps its empty default.

export function loadSnapshotHistory(): SystemStateSnapshot[] | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_HISTORY_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    // Cheap shape check — version + timestamp + graph + tarskiValidation
    // are the minimum we render against; anything missing those drops.
    return parsed.filter(
      (s): s is SystemStateSnapshot =>
        !!s &&
        typeof s === "object" &&
        (s as { version?: unknown }).version === 1 &&
        typeof (s as { timestamp?: unknown }).timestamp === "string" &&
        !!(s as { graph?: unknown }).graph &&
        !!(s as { tarskiValidation?: unknown }).tarskiValidation,
    );
  } catch {
    return null;
  }
}
export function saveSnapshotHistory(history: SystemStateSnapshot[]): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(SNAPSHOT_HISTORY_KEY, JSON.stringify(history));
  } catch {
    // ignore — quota exceeded, private-mode, etc.
  }
}

// ─── User preferences (string / array / set primitives) ────────────
//
// Each pair is a thin named wrapper over loadString / loadStringArray
// so consumers grep cleanly and a future rename catches every site.
// Caller is responsible for validating the value matches the current
// union (we don't import the unions here to keep this file
// type-independent). An unknown stored value gets passed through; the
// consuming component / store either coerces or falls back to default.

export function loadViewMode(): string | null {
  return loadString(VIEW_MODE_KEY);
}
export function saveViewMode(v: string): void {
  saveString(VIEW_MODE_KEY, v);
}

export function loadActiveModule(): string | null {
  return loadString(ACTIVE_MODULE_KEY);
}
export function saveActiveModule(v: string): void {
  saveString(ACTIVE_MODULE_KEY, v);
}

export function loadNodeSizeMetric(): string | null {
  return loadString(NODE_SIZE_METRIC_KEY);
}
export function saveNodeSizeMetric(v: string): void {
  saveString(NODE_SIZE_METRIC_KEY, v);
}

export function loadVisibleEdgeTypes(): string[] | null {
  return loadStringArray(VISIBLE_EDGE_TYPES_KEY);
}
export function saveVisibleEdgeTypes(types: Set<string>): void {
  saveStringArray(VISIBLE_EDGE_TYPES_KEY, Array.from(types).sort());
}

export function loadTruthFilter(): string | null {
  return loadString(TRUTH_FILTER_KEY);
}
export function saveTruthFilter(v: string): void {
  saveString(TRUTH_FILTER_KEY, v);
}

export function loadActivePersona(): string | null {
  return loadString(ACTIVE_PERSONA_KEY);
}
export function saveActivePersona(v: string): void {
  saveString(ACTIVE_PERSONA_KEY, v);
}

export function loadSelectedDataSources(): string[] | null {
  return loadStringArray(SELECTED_DATA_SOURCES_KEY);
}
export function saveSelectedDataSources(sources: string[]): void {
  saveStringArray(SELECTED_DATA_SOURCES_KEY, sources);
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

function loadString(key: string): string | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function saveString(key: string, value: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore — quota exceeded, private-mode, etc.
  }
}

function loadStringArray(key: string): string[] | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return null;
  }
}

function saveStringArray(key: string, value: string[]): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore — quota exceeded, private-mode, etc.
  }
}

