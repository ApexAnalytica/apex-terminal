// ─── Onboarding tour metrics ─────────────────────────────────────
//
// Fire-and-forget client logger for tour boundary events. Mirrors the
// copilot trace-logger pattern (src/lib/copilot/trace-logger.ts):
// best-effort POST to a server route, never blocks the UI, never
// throws upward. The server side currently logs to stdout (Vercel
// request logs); a future PR can swap that for a Supabase table or
// a Tinybird sink without changing this module.
//
// Why this exists: the 2026-05-03..04 onboarding overhaul restructured
// the tour into clean phase boundaries (first-run / deep-dive / per-
// track), but no telemetry was wired. Without metrics we don't know
// what fraction of users finish first-run, which deep-dive track they
// pick, or where they bail. This module instruments those answers.
//
// Cardinality is deliberately low: ~5 events per tour-open. Per-step
// telemetry is intentionally not instrumented at the boundary level
// to keep the volume small; if step-level granularity is needed
// later, add it as a separate `step_advanced` event with sampling.

// ─── Types ──────────────────────────────────────────────────────

export type TourEventType =
  | "tour_started"            // tour opened — auto (first visit) or manual ("?" button)
  | "first_run_completed"     // user advanced past the final first-run step
  | "deep_dive_launched"      // user picked a track from the deep-dive menu
  | "deep_dive_completed"     // user advanced past the final step of a deep-dive track
  | "tour_closed";            // user closed the tour at any point (Esc / X / outside-click)

export interface TourEvent {
  event: TourEventType;
  /** Step id at the moment of the event. Null for tour_started before the first step renders. */
  stepId: string | null;
  /** "first-run" | "deep-dive" | "menu" — the macro phase the tour was in. */
  phase: "first-run" | "deep-dive" | "menu";
  /**
   * For first-run: the persona track ("analyst" | "scientist").
   * For deep-dive: the track id ("engines" | "loop" | "customization").
   * For menu / unset: null.
   */
  track: string | null;
  /** Snapshot of the active persona at event time, if known. */
  persona: string | null;
  /** Stable id for the duration of one tour-open. Lets the server reconstruct
   *  per-session funnels without identifying users. */
  tourSessionId: string;
  /** ms since tour-session start. tour_started carries 0. */
  elapsedMs: number;
  /** Open-ended client metadata bag. Keep it small. */
  clientMeta?: Record<string, unknown>;
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * POST a tour event to the server. Fire-and-forget. Returns true on
 * 2xx, false on any failure or environment without `fetch`. Callers
 * MUST NOT await this from interaction-hot paths — logging failures
 * never block tour state.
 */
export async function logTourEvent(event: TourEvent): Promise<boolean> {
  if (typeof fetch === "undefined") return false;
  try {
    const res = await fetch("/api/tour/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      // Bounded budget so logging can never hang a tab.
      signal: AbortSignal.timeout(5000),
      // Send in the background so a tab close on tour_closed doesn't
      // lose the funnel-end event.
      keepalive: true,
    });
    if (!res.ok) {
      console.warn(`[tour-metrics] log failed: HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[tour-metrics] log failed:", err);
    return false;
  }
}

/**
 * Generate a fresh tour-session id. SpotlightTour creates one when
 * the tour opens (auto or manual) and reuses it across all events
 * inside that open until close. A re-launch from the "?" button
 * starts a new session id.
 */
export function newTourSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for very old runtimes — sufficient entropy for our
  // analytics use case (collisions don't matter).
  return `ts_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
