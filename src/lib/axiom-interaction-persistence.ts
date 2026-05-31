// ─── Axiom interaction history — localStorage persistence ─────────────
//
// Tracks which axioms the user has clicked into and when, so the
// recommender can apply a decayed-recency boost — "you've investigated
// concentration risk often this week" surfaces concentration axioms
// even before the user clicks a relevant node.
//
// Shape: Record<axiomId, { lastClickedAt: ISO8601, clickCount }>. The
// recency boost in scoreAxiomRelevance uses lastClickedAt with a 7-day
// exponential decay; clickCount is recorded for future weighting work
// (it's not used yet, but persisting it now means we don't lose history
// when the scoring function eventually starts reading it).

export type AxiomInteractionRecord = {
  lastClickedAt: string;
  clickCount: number;
};
export type AxiomInteractionHistory = Record<string, AxiomInteractionRecord>;

const STORAGE_KEY = "manifold:axiom-interaction-history";
const MAX_ENTRIES = 200; // cap so localStorage can't grow unbounded

/**
 * Load persisted axiom interaction history. SSR-safe. Defensively
 * validates each record; anything malformed is dropped.
 */
export function loadAxiomInteractionHistory(): AxiomInteractionHistory {
  if (typeof window === "undefined" || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: AxiomInteractionHistory = {};
    for (const [axiomId, record] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (!record || typeof record !== "object") continue;
      const r = record as Partial<AxiomInteractionRecord>;
      if (
        typeof r.lastClickedAt === "string" &&
        typeof r.clickCount === "number" &&
        Number.isFinite(r.clickCount) &&
        r.clickCount >= 0
      ) {
        out[axiomId] = {
          lastClickedAt: r.lastClickedAt,
          clickCount: r.clickCount,
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Persist axiom interaction history. SSR-safe + swallows quota errors.
 * Caps total entries at MAX_ENTRIES by dropping the oldest by
 * lastClickedAt — protects against unbounded growth from random
 * exploration over time.
 */
export function saveAxiomInteractionHistory(
  history: AxiomInteractionHistory,
): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const entries = Object.entries(history);
    let toPersist = history;
    if (entries.length > MAX_ENTRIES) {
      // Keep the MAX_ENTRIES most-recently-clicked records.
      const trimmed = entries
        .sort((a, b) =>
          b[1].lastClickedAt.localeCompare(a[1].lastClickedAt),
        )
        .slice(0, MAX_ENTRIES);
      toPersist = Object.fromEntries(trimmed);
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist));
  } catch {
    // ignore — quota exceeded, private-mode, etc.
  }
}
