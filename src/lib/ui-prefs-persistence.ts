// ─── UI preferences — localStorage persistence ──────────────────────
//
// Small, deliberate UI choices the user makes that should outlive a
// page reload — distinct from session state (graph, selection, timeline
// position) which intentionally resets. Kept separate from
// calc-history-persistence so each file owns exactly one concern.
//
// First (and currently only) member: the bottom time-series dock's
// collapsed/expanded state. Collapsing reclaims canvas room for the
// primary module; if the user does that, having it spring back open on
// every refresh is annoying, so we remember it.

const BOTTOM_DOCK_COLLAPSED_KEY = "manifold:bottom-dock-collapsed";

/**
 * Load the persisted bottom-dock collapsed preference. SSR-safe.
 * Returns `null` when nothing is stored (or storage is unavailable) so
 * the caller can keep its own default rather than being forced to false.
 */
export function loadBottomDockCollapsed(): boolean | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(BOTTOM_DOCK_COLLAPSED_KEY);
    if (raw === null) return null;
    return raw === "1";
  } catch {
    return null;
  }
}

/**
 * Persist the bottom-dock collapsed preference. SSR-safe + swallows
 * quota / private-mode errors (best-effort; must never break the toggle
 * that triggered it).
 */
export function saveBottomDockCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(BOTTOM_DOCK_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // ignore — quota exceeded, private-mode, etc.
  }
}
