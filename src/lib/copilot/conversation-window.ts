// ─── Conversation window ────────────────────────────────────────
//
// First-cut conversation memory: a sliding window over the chat
// history. Keep the last N user/assistant turns verbatim, drop
// older ones, and report how many were dropped so the UI can
// surface a hint to the user.
//
// Why a sliding window (and not summarization or retrieval yet):
//   - We don't have evidence that long-context regressions are
//     a real production pain point. Adding summarization now would
//     be guessing at what to preserve.
//   - Sliding window is reversible — easy to swap to summarization
//     or retrieval later if `copilot_traces` data shows long,
//     coherent conversations that suffer from dropped context.
//   - It's a one-line plug into the existing
//     copilotMessages.filter(...) chain in SystemCopilot.
//
// The "turn" unit here is *messages*, not user/assistant pairs.
// That keeps the math simple — N=12 is roughly 6 turns of back-
// and-forth. ACTIONS-EXECUTED system messages are filtered out
// upstream (see SystemCopilot's `m.role !== "system"` filter), so
// they don't enter this window.

import type { CopilotMessage } from "@/lib/types";

/**
 * Hard cap on how many user/assistant messages get included in
 * the prompt history. Picked at 12 = ~6 turns of back-and-forth,
 * enough to preserve context for any normal chat session while
 * keeping prompt cost bounded.
 *
 * Bumping this is cheap; lowering it gets aggressive about cost
 * at the expense of conversational coherence. Move with intent.
 */
export const DEFAULT_CONVERSATION_WINDOW = 12;

export interface PrunedWindow {
  /** The messages that should be sent to the LLM (last N). */
  kept: CopilotMessage[];
  /** Count of messages dropped from the front. */
  droppedCount: number;
}

/**
 * Take a chat history (already filtered to user/assistant roles)
 * and prune to the most recent `limit` entries.
 *
 * Edge cases:
 *   - If history fits within the limit, returns it unchanged.
 *   - If limit ≤ 0, returns an empty window (defensive — should
 *     never happen in practice).
 *   - Does NOT try to keep user/assistant pairs together. The
 *     LLM tolerates a leading assistant turn fine; pair-aware
 *     pruning is a future enhancement if it ever causes issues.
 */
export function pruneConversation(
  messages: CopilotMessage[],
  limit: number = DEFAULT_CONVERSATION_WINDOW,
): PrunedWindow {
  if (limit <= 0) {
    return { kept: [], droppedCount: messages.length };
  }
  if (messages.length <= limit) {
    return { kept: messages, droppedCount: 0 };
  }
  return {
    kept: messages.slice(-limit),
    droppedCount: messages.length - limit,
  };
}
