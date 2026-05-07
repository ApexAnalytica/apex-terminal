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
  type ParsedActionTag,
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
 */
export function executeAction(action: ParsedAction): string | null {
  const tag: ParsedActionTag = { name: action.type, payload: action.param, raw: action.raw };
  return executeTag(tag);
}

/**
 * Process all actions in an LLM response. Returns the cleaned
 * display text plus the list of action results.
 */
export function processLlmActions(text: string): {
  displayText: string;
  actionResults: string[];
} {
  const { displayText, toolResults } = executeActions(text);
  return { displayText, actionResults: toolResults };
}
