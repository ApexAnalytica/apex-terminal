// ─── Eval Assertions ────────────────────────────────────────────
//
// Pure functions that compare an observed model response against a
// TestCase's assertions and emit AssertionResult records. No I/O,
// no side effects — testable in isolation.

import type {
  AssertionResult,
  ObservedToolCall,
  ParamMatcher,
  TestCase,
  ToolCallAssertion,
} from "./types";

// ─── Param matching ─────────────────────────────────────────────

/**
 * True if `value` matches the matcher predicate. Used per-param
 * inside a ToolCallAssertion.
 */
export function matchParam(value: unknown, matcher: ParamMatcher): boolean {
  if (matcher instanceof RegExp) {
    return typeof value === "string" && matcher.test(value);
  }
  if (typeof matcher === "string") return value === matcher;
  if (typeof matcher === "number") return value === matcher;
  if ("includes" in matcher) {
    return typeof value === "string" && value.includes(matcher.includes);
  }
  if ("array_includes" in matcher) {
    return Array.isArray(value) && value.includes(matcher.array_includes);
  }
  return false;
}

/** True if every param matcher in the assertion passes against the call. */
export function toolCallMatches(
  call: ObservedToolCall,
  assertion: ToolCallAssertion,
): boolean {
  if (call.name !== assertion.name) return false;
  if (!assertion.params_match) return true;
  for (const [key, matcher] of Object.entries(assertion.params_match)) {
    if (!matchParam(call.params[key], matcher)) return false;
  }
  return true;
}

// ─── Response text ──────────────────────────────────────────────

export function checkResponseText(
  text: string,
  required: RegExp[] | undefined,
  forbidden: RegExp[] | undefined,
): AssertionResult[] {
  const out: AssertionResult[] = [];
  for (const re of required ?? []) {
    out.push({
      label: `response contains ${re}`,
      passed: re.test(text),
      expected: `match ${re}`,
      observed: re.test(text) ? "matched" : "not found",
    });
  }
  for (const re of forbidden ?? []) {
    out.push({
      label: `response does NOT contain ${re}`,
      passed: !re.test(text),
      expected: `no match for ${re}`,
      observed: re.test(text) ? `matched (forbidden): ${truncate(text, 80)}` : "not present",
    });
  }
  return out;
}

// ─── Tool-call assertions ───────────────────────────────────────

export function checkToolCalls(
  calls: ObservedToolCall[],
  testCase: TestCase,
): AssertionResult[] {
  const out: AssertionResult[] = [];

  if (testCase.forbid_tool_calls) {
    out.push({
      label: "no tool calls expected",
      passed: calls.length === 0,
      expected: "0 tool calls",
      observed: calls.length === 0
        ? "no tool calls"
        : `${calls.length} tool call(s): ${calls.map((c) => c.name).join(", ")}`,
    });
    return out;
  }

  const accepted = testCase.accepted_tool_calls ?? [];
  if (accepted.length === 0) {
    // No expectations — pass by default.
    return out;
  }

  // Find the first call that matches any accepted assertion. We
  // accept any one match because some prompts have multiple
  // legitimate answers (isolate_nodes vs set_domains for "show me
  // energy").
  const matchedAssertion = accepted.find((assertion) =>
    calls.some((call) => toolCallMatches(call, assertion)),
  );

  out.push({
    label: "tool call matches one of the accepted shapes",
    passed: matchedAssertion !== undefined,
    expected: accepted
      .map((a) => `${a.name}(${formatParamMatchers(a.params_match)})`)
      .join("  |  "),
    observed: calls.length === 0
      ? "no tool calls emitted"
      : calls.map((c) => `${c.name}(${formatParams(c.params)})`).join(", "),
  });

  return out;
}

// ─── Aggregate over a single test case ─────────────────────────

export function evaluateCase(
  testCase: TestCase,
  observed: { display_text: string; tool_calls: ObservedToolCall[] },
): AssertionResult[] {
  return [
    ...checkToolCalls(observed.tool_calls, testCase),
    ...checkResponseText(
      observed.display_text,
      testCase.required_in_response,
      testCase.forbidden_in_response,
    ),
  ];
}

// ─── Internal helpers ───────────────────────────────────────────

function formatParamMatchers(matchers: Record<string, ParamMatcher> | undefined): string {
  if (!matchers) return "";
  return Object.entries(matchers)
    .map(([k, m]) => `${k}=${formatMatcher(m)}`)
    .join(",");
}

function formatMatcher(m: ParamMatcher): string {
  if (m instanceof RegExp) return m.toString();
  if (typeof m === "string") return JSON.stringify(m);
  if (typeof m === "number") return String(m);
  if ("includes" in m) return `includes(${JSON.stringify(m.includes)})`;
  if ("array_includes" in m) return `array_includes(${JSON.stringify(m.array_includes)})`;
  return "?";
}

function formatParams(params: Record<string, unknown>): string {
  return Object.entries(params)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(",");
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
