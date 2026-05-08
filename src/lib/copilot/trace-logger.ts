// ─── Copilot Trace Logger ───────────────────────────────────────
//
// Captures every copilot turn as a structured row for replay,
// eval, and (eventually) training-data collection. The shape
// here mirrors the supabase-copilot-traces.sql schema 1:1.
//
// Design: fire-and-forget POST to /api/copilot/trace. Logging
// MUST never block the chat or surface errors to the user — if
// the POST fails, we log to the console and move on.

import type { ToolCallTrace } from "./tool-registry";

// ─── Types ──────────────────────────────────────────────────────

/**
 * One row in the copilot_traces table. Mirrors the columns
 * declared in supabase-copilot-traces.sql.
 */
export interface TurnTrace {
  conversation_id: string;
  turn_index: number;
  user_message: string | null;
  assistant_message: string | null;
  display_text: string | null;
  tool_calls: ToolCallTrace[];
  model_provider: string | null;
  model_id: string | null;
  system_prompt_hash: string | null;
  system_prompt_size: number | null;
  dataset: string | null;
  active_module: string | null;
  selected_node: string | null;
  active_shock_count: number | null;
  client_meta?: Record<string, unknown>;
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * POST a turn trace to the server. Fire-and-forget — the returned
 * Promise resolves to true on success, false on any failure, but
 * callers should NOT await it from the chat hot path. Logging
 * failures must never break the user's chat experience.
 */
export async function logTurnTrace(trace: TurnTrace): Promise<boolean> {
  // Skip logging in test/SSR environments where fetch isn't available.
  if (typeof fetch === "undefined") return false;

  try {
    const res = await fetch("/api/copilot/trace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(trace),
      // Never let logging hang the page — give it a generous but
      // bounded budget.
      signal: AbortSignal.timeout(5000),
      // Send in the background so a tab close doesn't lose the
      // last turn. keepalive payloads are capped at 64KB; if
      // the trace is bigger than that, the browser will fall
      // back to a regular fetch.
      keepalive: true,
    });
    if (!res.ok) {
      console.warn(`[copilot-trace] log failed: HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    // Logging never throws upward.
    console.warn("[copilot-trace] log failed:", err);
    return false;
  }
}

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Cheap, deterministic, non-cryptographic hash of a string. Used
 * as the system_prompt_hash so we can tell whether two turns
 * shared a prompt without storing the prompt itself. djb2 is
 * fast, has good distribution for short-medium strings, and
 * collisions don't matter for our analytics use case.
 */
export function hashPrompt(prompt: string): string {
  let h = 5381;
  for (let i = 0; i < prompt.length; i++) {
    h = (h * 33) ^ prompt.charCodeAt(i);
  }
  // 32-bit unsigned, hex — short and stable across runtimes.
  return (h >>> 0).toString(16);
}

/**
 * Generate a fresh conversation id. We use this when a chat
 * session boots; SystemCopilot keeps it stable across turns and
 * resets it when the user clears the conversation.
 */
export function newConversationId(): string {
  // crypto.randomUUID is available in all modern browsers + Node 18+.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for very old runtimes — sufficient entropy for our purposes.
  return `cv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
