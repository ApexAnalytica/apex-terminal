// ─── Calculation history — localStorage persistence ──────────────────
//
// The CALCULATIONS panel lets the user push calc values ("→ DIAL")
// so they accumulate a trajectory. Two flavours:
//
//   1. Graph-wide calcs (mean ΩF, cross-domain edges, ...) push into
//      `graphCalcHistory: Record<calcId, {value, observedAt}[]>` — flat
//      time-series per calc id.
//
//   2. Node-scoped calcs (HHI on inbound edges, etc.) push into the
//      selected node's `liveData[]` via `upsertLiveSignal`, which
//      carries the full per-(nodeId, kind) trajectory on the point's
//      embedded `history` array. The store mirrors only the calc-kind
//      points into `nodeCalcHistory: Record<nodeId, LiveDataPoint[]>`
//      so we can persist them without dragging the whole graph through
//      localStorage.
//
// Both die on page reload unless we persist them, which undercuts the
// whole "track over time" story. These helpers persist both.
//
// Scope decision: ONLY calc trajectories persist, not the full store.
// The graph itself, selection, timeline position etc. are session
// state — reload should reset them. Calc trajectories are the one
// thing the user is deliberately building up over time, so they're
// the only thing worth surviving a refresh.

import type { LiveDataPoint } from "@/lib/types";

export type GraphCalcHistory = Record<
  string,
  { value: number; observedAt: string }[]
>;

/** Per-node mirror of calc-kind LiveDataPoint entries (kind starts
 *  with "calc:"). Each point carries its own embedded `history` array,
 *  so the trajectory restores cleanly via `upsertLiveSignal` on
 *  hydration. */
export type NodeCalcHistory = Record<string, LiveDataPoint[]>;

const STORAGE_KEY = "manifold:graph-calc-history";
const NODE_STORAGE_KEY = "manifold:node-calc-history";
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

/**
 * Load persisted node-scoped calc history. SSR-safe. Defensively
 * validates each entry as a LiveDataPoint-shaped object; anything that
 * doesn't parse is dropped rather than crashing hydration.
 */
export function loadNodeCalcHistory(): NodeCalcHistory {
  if (typeof window === "undefined" || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(NODE_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: NodeCalcHistory = {};
    for (const [nodeId, entries] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (!Array.isArray(entries)) continue;
      const clean = entries.filter((e): e is LiveDataPoint => {
        if (!e || typeof e !== "object") return false;
        const p = e as Partial<LiveDataPoint>;
        return (
          typeof p.kind === "string" &&
          p.kind.startsWith("calc:") &&
          typeof p.value === "number" &&
          Number.isFinite(p.value) &&
          typeof p.observedAt === "string" &&
          typeof p.unit === "string" &&
          typeof p.source === "string" &&
          typeof p.capacity === "number"
        );
      });
      if (clean.length > 0) out[nodeId] = clean;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Persist node-scoped calc history. SSR-safe + swallows quota /
 * serialization errors.
 */
export function saveNodeCalcHistory(history: NodeCalcHistory): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(NODE_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // ignore — quota exceeded, private-mode, etc.
  }
}
