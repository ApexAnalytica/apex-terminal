// ─── Eval Case Snippet Generator ────────────────────────────────
//
// Takes a captured trace + minimal user input and produces a
// `TestCase` TS literal the user can paste into seed.ts. Pure
// function, no I/O. The button-driven UX in CopilotTraceHistory
// is a thin shell around this.
//
// Why TS-snippet-to-clipboard, not DB-backed cases:
//   - Code-as-cases keeps the eval reviewable in PRs (you can see
//     exactly which case was added; reviewer can sanity-check it)
//   - CI gate doesn't depend on prod data — no dev/prod skew
//   - Clear ownership: the seed set is a curated artifact, not a
//     free-for-all production dump.
//
// We may add a DB-backed flow later (auto-suggest cases from
// surprising traces, etc), but the canonical eval set should stay
// in code.

import type { ObservedToolCall } from "./types";

// ─── Input shapes ──────────────────────────────────────────────

/** Subset of TraceListRow that we actually need. Decoupled from
 *  the API route so this module isn't pulled into the client
 *  bundle's API-route dependency graph. */
export interface CaseSeedInput {
  user_message: string | null;
  tool_calls: ObservedToolCall[];
}

/** User-editable fields on top of the captured trace. */
export interface CaseSeedForm {
  /** Stable case id (snake_case-ish; deduped against existing seed). */
  id: string;
  /** Human-readable description shown in console output. */
  description: string;
  /** Graph fixture name from seed.ts. Default geopolitical_main. */
  graph_fixture: string;
  /** Comma-separated tags (UI-friendly; we split + trim). */
  tags?: string;
  /** Free-form regex sources (one per line). */
  required_in_response?: string;
  forbidden_in_response?: string;
  /** When true, the generated case asserts no tools were called. */
  forbid_tool_calls?: boolean;
}

// ─── Public API ────────────────────────────────────────────────

/**
 * Build a TestCase TS literal that the user can paste into
 * `src/lib/copilot/eval/cases/seed.ts`. The output is hand-edited-
 * shaped (multi-line, matching the surrounding style) so a paste
 * fits in alongside the existing cases without reformatting.
 */
export function buildCaseSnippet(input: CaseSeedInput, form: CaseSeedForm): string {
  const lines: string[] = [];
  lines.push("{");
  lines.push(`  id: ${jsString(form.id)},`);
  lines.push(`  description:`);
  lines.push(`    ${jsString(form.description)},`);
  lines.push(`  user_message: ${jsString(input.user_message ?? "")},`);
  lines.push(`  graph_fixture: ${jsString(form.graph_fixture)},`);

  if (form.forbid_tool_calls) {
    lines.push(`  forbid_tool_calls: true,`);
  } else if (input.tool_calls.length > 0) {
    lines.push(`  accepted_tool_calls: [`);
    for (const tc of input.tool_calls) {
      lines.push(`    ${renderToolCallAssertion(tc)},`);
    }
    lines.push(`  ],`);
  }

  const required = parseRegexLines(form.required_in_response);
  if (required.length > 0) {
    lines.push(`  required_in_response: [${required.map(renderRegexLiteral).join(", ")}],`);
  }
  const forbidden = parseRegexLines(form.forbidden_in_response);
  if (forbidden.length > 0) {
    lines.push(`  forbidden_in_response: [${forbidden.map(renderRegexLiteral).join(", ")}],`);
  }

  const tags = parseTags(form.tags);
  if (tags.length > 0) {
    lines.push(`  tags: [${tags.map(jsString).join(", ")}],`);
  }
  lines.push("},");
  return lines.join("\n");
}

/**
 * Pre-fill the form from a trace. The user can edit anything
 * before exporting. We bias toward minimal-but-useful defaults:
 *   - id: slug from the user message
 *   - description: a stub the user should rewrite
 *   - graph_fixture: geopolitical_main (the most common)
 *   - tags: derived from the tool names involved
 */
export function defaultFormFromTrace(input: CaseSeedInput): CaseSeedForm {
  const slug = slugify(input.user_message ?? "", 32);
  const toolNames = input.tool_calls.map((tc) => tc.name);
  const toolTag =
    toolNames.length === 0 ? "no-tool" : toolNames.length === 1 ? toolNames[0] : "multi-tool";
  return {
    id: slug || "untitled_case",
    description:
      input.tool_calls.length === 0
        ? "User asked a definitional question — model should respond without tools."
        : `User intent → fires ${toolNames.join(" + ")}.`,
    graph_fixture: "geopolitical_main",
    tags: ["tool-selection", toolTag].join(", "),
    required_in_response: "",
    forbidden_in_response: "",
    forbid_tool_calls: input.tool_calls.length === 0,
  };
}

// ─── Internals ─────────────────────────────────────────────────

/** Render a single ObservedToolCall as a ToolCallAssertion literal.
 *  Auto-converts string params into `{ includes: ... }` matchers
 *  (more permissive — exact strings are brittle for natural-text
 *  fields like queries). Numbers and booleans match exactly. */
function renderToolCallAssertion(tc: ObservedToolCall): string {
  if (Object.keys(tc.params).length === 0) {
    return `{ name: ${jsString(tc.name)} }`;
  }
  const matchers = Object.entries(tc.params).map(([k, v]) => {
    if (typeof v === "string") {
      return `${k}: { includes: ${jsString(v)} }`;
    }
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") {
      // Permissive: only assert one element is present.
      return `${k}: { array_includes: ${jsString(v[0] as string)} }`;
    }
    return `${k}: ${JSON.stringify(v)}`;
  });
  return (
    `{ name: ${jsString(tc.name)}, params_match: { ${matchers.join(", ")} } }`
  );
}

/** Convert a free-form line of text into a /regex/i. We bias to
 *  case-insensitive because the eval is matching response text,
 *  not code. The user can edit afterward if they want stricter. */
function renderRegexLiteral(source: string): string {
  // If the user already wrote /…/flags, respect it.
  const slashed = source.match(/^\/(.+)\/([a-z]*)$/);
  if (slashed) {
    return `/${slashed[1]}/${slashed[2]}`;
  }
  return `/${source.replace(/\//g, "\\/")}/i`;
}

function parseRegexLines(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function slugify(text: string, max: number): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .slice(0, max);
}

/** JSON.stringify produces double-quoted JS-compatible string
 *  literals; that's exactly what we want in the snippet. */
function jsString(s: string): string {
  return JSON.stringify(s);
}
