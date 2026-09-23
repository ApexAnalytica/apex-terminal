// ─── Copilot capability-gap detector ───────────────────────────
//
// Mines copilot turns for things users asked the copilot to DO that
// it couldn't — i.e. the auto-generated "what to build next" backlog.
// Pure function (no I/O), same shape contract as analytics.ts: the
// route fetches RLS-filtered rows and passes them here.
//
// Two signal tiers:
//   A. EXPLICIT — the assistant emitted the honest-refusal marker
//      ("I can't do that yet", "no control wired into me"). High
//      precision: the copilot itself told us it lacks the capability.
//      (Depends on the Part-1 honesty rule in the system prompt.)
//   B. SUSPECTED — no tool fired AND the user message reads like an
//      action request (imperative verb). Higher recall, noisier:
//      catches gaps from turns recorded before the honesty rule, or
//      where the model answered in prose instead of refusing cleanly.
//
// Re-run as traces accumulate — the more real usage, the sharper the
// backlog.

// ─── Input shape ────────────────────────────────────────────────

/** Subset of copilot_traces columns the detector needs. */
export interface GapInputRow {
  created_at?: string | null;
  conversation_id?: string | null;
  user_message: string | null;
  /** Tags-stripped assistant text shown to the user. */
  display_text: string | null;
  tool_calls: Array<{ name: string }>;
}

// ─── Output shape ───────────────────────────────────────────────

export interface GapGroup {
  /** Normalized key similar requests collapse onto. */
  signature: string;
  count: number;
  /** Up to 3 representative raw user messages. */
  examples: string[];
}

export interface CapabilityGapReport {
  total_turns: number;
  turns_with_tools: number;
  /** Tier A — copilot explicitly said it couldn't. Sorted count desc. */
  explicit_refusals: GapGroup[];
  /** Tier B — action intent, zero tools fired. Sorted count desc. */
  suspected_gaps: GapGroup[];
  explicit_refusal_count: number;
  suspected_gap_count: number;
}

// ─── Signals ────────────────────────────────────────────────────

/** Markers the Part-1 honesty rule produces. Kept tight for precision. */
const REFUSAL_MARKER =
  /can'?t do (?:that|this) yet|no control wired into me|isn'?t something i can (?:do|control)|don'?t have a (?:tool|control|way) (?:to|for)/i;

/** Imperative verbs that signal the user wanted an ACTION, not a question. */
const ACTION_VERB =
  /\b(show|display|set|switch|change|run|select|isolate|hide|filter|pin|unpin|add|remove|delete|enable|disable|turn (?:on|off)|go to|jump|step|export|save|apply|sever|cut|reset|compare|highlight|zoom|play|stop|start|ablate|restrict|focus|toggle|open|close|load|render|color|colour)\b/i;

/** Collapse a message to a coarse signature so near-duplicates group. */
function signatureOf(msg: string): string {
  return msg
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 6)
    .join(" ");
}

function addToGroups(map: Map<string, GapGroup>, msg: string): void {
  const sig = signatureOf(msg);
  if (!sig) return;
  const g = map.get(sig);
  if (g) {
    g.count++;
    if (g.examples.length < 3 && !g.examples.includes(msg)) g.examples.push(msg);
  } else {
    map.set(sig, { signature: sig, count: 1, examples: [msg] });
  }
}

function rank(map: Map<string, GapGroup>): GapGroup[] {
  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.signature.localeCompare(b.signature),
  );
}

// ─── Analyzer ───────────────────────────────────────────────────

export function analyzeCapabilityGaps(rows: GapInputRow[]): CapabilityGapReport {
  const explicit = new Map<string, GapGroup>();
  const suspected = new Map<string, GapGroup>();
  let turnsWithTools = 0;

  for (const row of rows) {
    const firedTool = (row.tool_calls?.length ?? 0) > 0;
    if (firedTool) turnsWithTools++;

    const user = (row.user_message ?? "").trim();
    if (!user) continue;

    const assistant = row.display_text ?? "";

    // Tier A takes precedence — the copilot self-reported the gap.
    if (REFUSAL_MARKER.test(assistant)) {
      addToGroups(explicit, user);
      continue;
    }

    // Tier B — wanted an action, nothing fired.
    if (!firedTool && ACTION_VERB.test(user)) {
      addToGroups(suspected, user);
    }
  }

  const explicitGroups = rank(explicit);
  const suspectedGroups = rank(suspected);

  return {
    total_turns: rows.length,
    turns_with_tools: turnsWithTools,
    explicit_refusals: explicitGroups,
    suspected_gaps: suspectedGroups,
    explicit_refusal_count: explicitGroups.reduce((s, g) => s + g.count, 0),
    suspected_gap_count: suspectedGroups.reduce((s, g) => s + g.count, 0),
  };
}
