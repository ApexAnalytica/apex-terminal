// ─── Copilot Action Router (compat shim) ────────────────────────
//
// The action runner moved to src/lib/copilot/tool-registry.ts.
// This file is kept so existing callers (`processLlmActions`,
// `parseActions`, `stripActions`, `executeAction`) keep working
// while we migrate them to the registry directly.
//
// Importing this module also pulls in the tool definitions side
// effect — registering every built-in tool with the registry.

import {
  parseActionTags,
  stripActionTags,
  executeTag,
  executeActions,
  executeActionsWithTrace,
  type ParsedActionTag,
  type ToolCallTrace,
} from "./copilot/tool-registry";

// Side-effect import: registers all built-in tools with the registry.
import "./copilot/tools";

export interface ParsedAction {
  type: string;
  param: string;
  raw: string;
}

/** Parse <<<ACTION:...>>> tags into the legacy {type, param, raw} shape. */
export function parseActions(text: string): ParsedAction[] {
  return parseActionTags(text).map((t) => ({ type: t.name, param: t.payload, raw: t.raw }));
}

/** Strip action tags from text for display. */
export const stripActions = stripActionTags;

/**
 * Execute a single parsed action. Returns a human-readable result
 * string, or null if the action produced no output (kept for
 * backward compatibility — the registry always returns a string).
 *
 * Async because tool handlers may be async (`solve_interdiction` awaits
 * `solveInterdictionAsync` to keep the copilot path non-blocking).
 */
export async function executeAction(action: ParsedAction): Promise<string | null> {
  const tag: ParsedActionTag = { name: action.type, payload: action.param, raw: action.raw };
  return executeTag(tag);
}

/**
 * Process all actions in an LLM response. Returns the cleaned
 * display text plus the list of action results.
 */
export async function processLlmActions(text: string): Promise<{
  displayText: string;
  actionResults: string[];
}> {
  const { displayText, toolResults } = await executeActions(text);
  return { displayText, actionResults: toolResults };
}

/**
 * Same as `processLlmActions`, but also returns the structured per-call
 * trace data (for trace-logger / Supabase). Use this when you want to
 * capture timing + params + errors in addition to the human-readable
 * result strings. `SystemCopilot` is the primary caller — it awaits
 * this after the LLM stream completes, then flushes the trace to the
 * trace API.
 */
export async function processLlmActionsWithTrace(text: string): Promise<{
  displayText: string;
  actionResults: string[];
  toolCalls: ToolCallTrace[];
}> {
  const { displayText, toolResults, toolCalls } = await executeActionsWithTrace(text);
  return { displayText, actionResults: toolResults, toolCalls };
}
