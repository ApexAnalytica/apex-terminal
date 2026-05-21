// ─── Copilot Tool Registry ──────────────────────────────────────
//
// Declarative tool definitions for the copilot. Each tool registers
// its name, description, parameter schema, and handler. The system
// prompt is generated from the registry, and the wire format
// (<<<ACTION:name:payload>>>) is parsed + validated against the
// schema before the handler runs.
//
// The shape is deliberately MCP / Anthropic-tool-use-compatible so
// we can later (a) auto-generate `tools` arrays for native tool use
// and (b) swap the hand-rolled schema layer for zod without changing
// call sites.

import { useApexStore } from "@/stores/useApexStore";
import type { ApexState } from "@/stores/useApexStore";

// ─── Schema primitives ──────────────────────────────────────────

/**
 * A parameter schema describes one input field on a tool. The shape
 * is deliberately small — string / string[] / number / enum / boolean —
 * because tool params come off the wire as strings and we coerce.
 *
 * Adding a new variant: extend the union, then handle it in
 * `coerceParam` and `renderParamSignature`.
 */
export type ParamSchema =
  | { type: "string"; required?: boolean; description?: string }
  | { type: "string[]"; required?: boolean; description?: string }
  | { type: "number"; required?: boolean; description?: string; min?: number; max?: number; default?: number }
  | { type: "enum"; values: readonly string[]; required?: boolean; description?: string; default?: string }
  | { type: "boolean"; required?: boolean; description?: string };

export type ParamShape = Record<string, ParamSchema>;

/** Type-level inference: schema → typed params object. */
// A field with `required: true` OR `default: <value>` is always defined
// at runtime. We treat both the same way for inference.
type IsAlwaysDefined<S> = S extends { required: true }
  ? true
  : S extends { default: unknown }
    ? true
    : false;

export type InferParams<P extends ParamShape> = {
  [K in keyof P]: P[K] extends { type: "string" }
    ? IsAlwaysDefined<P[K]> extends true ? string : string | undefined
    : P[K] extends { type: "string[]" }
      ? string[]
      : P[K] extends { type: "number" }
        ? IsAlwaysDefined<P[K]> extends true ? number : number | undefined
        : P[K] extends { type: "enum"; values: infer V }
          ? V extends readonly string[]
            ? IsAlwaysDefined<P[K]> extends true ? V[number] : V[number] | undefined
            : never
          : P[K] extends { type: "boolean" }
            ? IsAlwaysDefined<P[K]> extends true ? boolean : boolean | undefined
            : never;
};

// ─── Tool definition ────────────────────────────────────────────

export interface ToolContext {
  /**
   * Returns the current store snapshot. Injectable for tests.
   * Defaults to `useApexStore.getState()` in production.
   */
  getStore: () => ApexState;
}

export interface Tool<P extends ParamShape = ParamShape> {
  /** Stable identifier emitted in <<<ACTION:name:...>>>. */
  name: string;
  /** One-line description for the LLM. Shown in the system prompt. */
  description: string;
  /** Optional longer guidance — shown to the LLM when this tool is non-obvious. */
  guidance?: string;
  /** Parameter schema. Empty {} for nullary tools. */
  params: P;
  /**
   * For backward compatibility with single-string payloads
   * (<<<ACTION:select_node:USA_GRID>>>). When the payload contains
   * no `=`, it is routed into this param.
   */
  legacyParam?: keyof P & string;
  /**
   * Handler — receives validated params and a context object. Returns
   * either a result string directly (sync, the common case) or a
   * Promise resolving to one (for handlers that need to run async
   * work — e.g. `solve_interdiction` awaits `solveInterdictionAsync`
   * so the copilot path doesn't block the UI for the full minimax
   * solve). The executor handles both; sync handlers don't need any
   * changes.
   */
  handler: (params: InferParams<P>, ctx: ToolContext) => string | Promise<string>;
}

// ─── Registry ───────────────────────────────────────────────────

const REGISTRY = new Map<string, Tool<ParamShape>>();

export function defineTool<P extends ParamShape>(tool: Tool<P>): Tool<P> {
  if (REGISTRY.has(tool.name)) {
    // Re-registration is allowed (e.g. HMR in dev). Last write wins.
    REGISTRY.set(tool.name, tool as unknown as Tool<ParamShape>);
  } else {
    REGISTRY.set(tool.name, tool as unknown as Tool<ParamShape>);
  }
  return tool;
}

export function getTool(name: string): Tool<ParamShape> | undefined {
  return REGISTRY.get(name);
}

export function getAllTools(): Tool<ParamShape>[] {
  return Array.from(REGISTRY.values());
}

/** Test-only: clear the registry. Production code should never call this. */
export function __resetRegistryForTests(): void {
  REGISTRY.clear();
}

// ─── Wire format parsing ────────────────────────────────────────

// k=v,k=v is the kv separator (comma). Arrays inside a value use `|`.
// Bare payloads (no `=`) are passed through as legacy single-string.

export interface ParsedActionTag {
  /** The full <<<ACTION:...>>> match. */
  raw: string;
  /** Tool name (between first and second colon). */
  name: string;
  /** Raw payload text (after the second colon). May be empty. */
  payload: string;
}

const ACTION_REGEX = /<<<ACTION:(\w+):?(.*?)>>>/g;

export function parseActionTags(text: string): ParsedActionTag[] {
  const tags: ParsedActionTag[] = [];
  // Reset regex state — it's stateful with /g flag.
  ACTION_REGEX.lastIndex = 0;
  let match;
  while ((match = ACTION_REGEX.exec(text)) !== null) {
    tags.push({ raw: match[0], name: match[1], payload: match[2] ?? "" });
  }
  return tags;
}

export function stripActionTags(text: string): string {
  return text.replace(ACTION_REGEX, "").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Parse a `k=v,k=v` payload into a flat string map. A bare payload
 * (no `=`) returns `{ _legacy: payload }` — the caller maps that
 * onto the tool's `legacyParam`.
 */
export function parseKvPayload(payload: string): Record<string, string> {
  const trimmed = payload.trim();
  if (trimmed === "") return {};
  if (!trimmed.includes("=")) return { _legacy: trimmed };

  const out: Record<string, string> = {};
  for (const pair of trimmed.split(",")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const k = pair.slice(0, eq).trim();
    const v = pair.slice(eq + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

// ─── Validation + coercion ──────────────────────────────────────

export type CoerceResult<P extends ParamShape> =
  | { ok: true; params: InferParams<P> }
  | { ok: false; error: string };

function coerceParam(
  name: string,
  schema: ParamSchema,
  raw: string | undefined,
): { ok: true; value: unknown } | { ok: false; error: string } {
  // Missing value
  if (raw === undefined || raw === "") {
    if ("default" in schema && schema.default !== undefined) {
      return { ok: true, value: schema.default };
    }
    if (schema.required) {
      return { ok: false, error: `Missing required param: ${name}` };
    }
    return { ok: true, value: schema.type === "string[]" ? [] : undefined };
  }

  switch (schema.type) {
    case "string":
      return { ok: true, value: raw };
    case "string[]": {
      // `|` is the array separator inside a value. Comma is reserved
      // for the kv separator at the payload level. Empty entries are
      // dropped so trailing/leading separators don't matter.
      const items = raw
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);
      return { ok: true, value: items };
    }
    case "number": {
      const n = Number(raw);
      if (Number.isNaN(n)) return { ok: false, error: `Param ${name}: "${raw}" is not a number` };
      const clamped = Math.min(schema.max ?? Infinity, Math.max(schema.min ?? -Infinity, n));
      return { ok: true, value: clamped };
    }
    case "enum":
      if (!schema.values.includes(raw)) {
        return { ok: false, error: `Param ${name}: "${raw}" not in [${schema.values.join("|")}]` };
      }
      return { ok: true, value: raw };
    case "boolean": {
      const lc = raw.toLowerCase();
      if (lc === "true" || lc === "1" || lc === "yes") return { ok: true, value: true };
      if (lc === "false" || lc === "0" || lc === "no") return { ok: true, value: false };
      return { ok: false, error: `Param ${name}: "${raw}" is not a boolean` };
    }
  }
}

export function coerceAndValidate<P extends ParamShape>(
  shape: P,
  raw: Record<string, string>,
  legacyParam: keyof P & string | undefined,
): CoerceResult<P> {
  // If we got a legacy single-string payload, rewrite it onto the
  // designated legacyParam. Tools without a legacyParam ignore it.
  const kv = { ...raw };
  if ("_legacy" in kv && legacyParam !== undefined) {
    kv[legacyParam] = kv._legacy;
  }
  delete kv._legacy;

  const out: Record<string, unknown> = {};
  for (const key of Object.keys(shape) as (keyof P & string)[]) {
    const schema = shape[key];
    const result = coerceParam(key, schema, kv[key]);
    if (!result.ok) return { ok: false, error: result.error };
    out[key] = result.value;
  }
  return { ok: true, params: out as InferParams<P> };
}

// ─── Execution ──────────────────────────────────────────────────

const defaultContext: ToolContext = {
  getStore: () => useApexStore.getState(),
};

export interface ExecutionResult {
  displayText: string;
  toolResults: string[];
}

/**
 * Structured per-call trace. One of these is produced for every
 * <<<ACTION:...>>> tag the LLM emitted. Designed to land in
 * Supabase as a row in tool_calls[] — the field shape mirrors the
 * jsonb structure described in supabase-copilot-traces.sql.
 */
export interface ToolCallTrace {
  /** Tool name (e.g. "isolate_nodes"). */
  name: string;
  /** Validated, coerced params — what the handler actually saw. */
  params: Record<string, unknown>;
  /** Human-readable result string returned by the handler. */
  result: string;
  /** Error message if the handler threw or validation failed; null on success. */
  error: string | null;
  /** Wall-clock duration of the handler call. */
  latency_ms: number;
}

export interface TracedExecutionResult extends ExecutionResult {
  /** One entry per parsed action tag, in source order. */
  toolCalls: ToolCallTrace[];
}

/**
 * Top-level entry point: parse all <<<ACTION:...>>> tags from an
 * LLM response, validate each, run handlers, and return the cleaned
 * display text plus the list of human-readable tool results.
 *
 * Async because `Tool.handler` may return a Promise — `solve_interdiction`
 * is the current real case (awaits `solveInterdictionAsync` so the copilot
 * path stays non-blocking even on a Hormuz-sized solve). Sync handlers
 * resolve immediately and pay no extra cost.
 *
 * Back-compat shape — discards the structured trace data. Use
 * `executeActionsWithTrace` when you want the trace for logging.
 */
export async function executeActions(
  text: string,
  ctx: ToolContext = defaultContext,
): Promise<ExecutionResult> {
  const { displayText, toolResults } = await executeActionsWithTrace(text, ctx);
  return { displayText, toolResults };
}

/**
 * Same as `executeActions`, but also returns structured per-call trace
 * data (params, result, error, latency_ms) for each tag. SystemCopilot
 * uses this to build a TurnTrace and POST it to `/api/copilot/trace`.
 *
 * Tags execute sequentially (`await` in a `for` loop, not `Promise.all`)
 * because handlers are allowed to mutate the same store — running two
 * in parallel would risk last-write-wins on dependent state mutations.
 * If a future tool needs concurrency it can opt in by itself.
 */
export async function executeActionsWithTrace(
  text: string,
  ctx: ToolContext = defaultContext,
): Promise<TracedExecutionResult> {
  const tags = parseActionTags(text);
  const displayText = stripActionTags(text);
  const toolResults: string[] = [];
  const toolCalls: ToolCallTrace[] = [];

  for (const tag of tags) {
    const traced = await executeTagWithTrace(tag, ctx);
    toolResults.push(traced.result);
    toolCalls.push(traced);
  }

  return { displayText, toolResults, toolCalls };
}

/** Execute a single parsed action tag. Exported for tests. */
export async function executeTag(tag: ParsedActionTag, ctx: ToolContext = defaultContext): Promise<string> {
  return (await executeTagWithTrace(tag, ctx)).result;
}

/**
 * Execute a single tag and return both the result string and the
 * structured trace. Used by `executeActionsWithTrace`; exported for
 * targeted unit tests that want to inspect timing/error semantics.
 *
 * Awaits the handler so async tools (currently `solve_interdiction`)
 * resolve before we measure latency and build the trace. Sync handlers
 * still resolve in microtask time — no behavioural change for them.
 */
export async function executeTagWithTrace(
  tag: ParsedActionTag,
  ctx: ToolContext = defaultContext,
): Promise<ToolCallTrace> {
  const start = performanceNow();
  const tool = REGISTRY.get(tag.name);
  if (!tool) {
    return {
      name: tag.name,
      params: {},
      result: `Unknown action: ${tag.name}`,
      error: `Unknown action: ${tag.name}`,
      latency_ms: Math.round(performanceNow() - start),
    };
  }

  const kv = parseKvPayload(tag.payload);
  const validated = coerceAndValidate(tool.params, kv, tool.legacyParam);
  if (!validated.ok) {
    return {
      name: tag.name,
      params: kv,
      result: `${tag.name}: ${validated.error}`,
      error: validated.error,
      latency_ms: Math.round(performanceNow() - start),
    };
  }

  try {
    const result = await tool.handler(validated.params, ctx);
    return {
      name: tag.name,
      params: validated.params as Record<string, unknown>,
      result,
      error: null,
      latency_ms: Math.round(performanceNow() - start),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      name: tag.name,
      params: validated.params as Record<string, unknown>,
      result: `${tag.name} failed: ${msg}`,
      error: msg,
      latency_ms: Math.round(performanceNow() - start),
    };
  }
}

// performance.now() in browsers + Node 16+; fall back to Date.now()
// in obscure runtimes (Cloudflare Workers etc) for safety.
function performanceNow(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

// ─── Prompt rendering ───────────────────────────────────────────

/** Render one param's signature for the system prompt. */
function renderParamSignature(name: string, schema: ParamSchema): string {
  let typeStr: string;
  switch (schema.type) {
    case "string":
      typeStr = "string";
      break;
    case "string[]":
      typeStr = "list (use | between items)";
      break;
    case "number":
      typeStr =
        schema.min !== undefined || schema.max !== undefined
          ? `number (${schema.min ?? "..."}–${schema.max ?? "..."})`
          : "number";
      break;
    case "enum":
      typeStr = schema.values.join("|");
      break;
    case "boolean":
      typeStr = "true|false";
      break;
  }
  const req = schema.required ? "" : "?";
  const desc = schema.description ? ` — ${schema.description}` : "";
  return `${name}${req}=<${typeStr}>${desc}`;
}

/**
 * Render the system-prompt section listing all registered tools.
 * Replaces the hand-written `=== COPILOT ACTIONS ===` block in
 * copilot-context.ts.
 */
export function renderToolsForPrompt(): string {
  const lines: string[] = [];
  lines.push("=== COPILOT ACTIONS ===");
  lines.push("Emit action tags to control the platform. Format:");
  lines.push("  <<<ACTION:name:key=value,key=value>>>");
  lines.push("Inside a value, use `|` to separate list items (ids=A|B|C).");
  lines.push("Single-arg actions accept a bare payload (<<<ACTION:select_node:USA_GRID>>>).");
  lines.push("");
  lines.push("Available actions:");

  const tools = getAllTools();
  for (const tool of tools) {
    const params = Object.entries(tool.params);
    if (params.length === 0) {
      lines.push(`  ${tool.name} — ${tool.description}`);
    } else {
      const sig = params.map(([n, s]) => renderParamSignature(n, s)).join(", ");
      lines.push(`  ${tool.name}:${sig} — ${tool.description}`);
    }
    if (tool.guidance) {
      for (const line of tool.guidance.split("\n")) {
        lines.push(`    ${line}`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Render tools as Anthropic-tool-use-compatible JSON (for the
 * eventual native-tool-use migration). Not used in this PR but
 * proves the schema shape converts cleanly.
 */
export function renderToolsAsJsonSchema(): Array<{
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required: string[] };
}> {
  return getAllTools().map((tool) => {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [name, schema] of Object.entries(tool.params)) {
      properties[name] = paramToJsonSchema(schema);
      if (schema.required) required.push(name);
    }
    return {
      name: tool.name,
      description: tool.description + (tool.guidance ? `\n\n${tool.guidance}` : ""),
      input_schema: { type: "object", properties, required },
    };
  });
}

function paramToJsonSchema(schema: ParamSchema): Record<string, unknown> {
  switch (schema.type) {
    case "string":
      return { type: "string", description: schema.description };
    case "string[]":
      return { type: "array", items: { type: "string" }, description: schema.description };
    case "number":
      return { type: "number", minimum: schema.min, maximum: schema.max, description: schema.description };
    case "enum":
      return { type: "string", enum: schema.values, description: schema.description };
    case "boolean":
      return { type: "boolean", description: schema.description };
  }
}
