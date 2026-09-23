// ─── Eval Harness Types ─────────────────────────────────────────
//
// The eval harness grades the copilot's behavior against a known
// set of (input, expected_outcome) pairs. Run a TestCase[] against
// a model, get an EvalResult[]. Aggregate to compare models.
//
// Shape goals:
//   - One test case can have MULTIPLE acceptable tool calls
//     (e.g. "show me energy" can validly hit isolate_nodes OR
//     set_domains). The first match wins.
//   - Response-text assertions are positive (must contain) and
//     negative (must NOT contain). Both regex.
//   - We capture latency + token counts (when provider exposes
//     them) so we can compare cost/perf across models, not just
//     correctness.

// ─── Test case definition ───────────────────────────────────────

/**
 * A single test case. The runner sends `user_message` to the
 * model with the platform's normal system prompt + tool registry,
 * then grades the response against the assertions below.
 */
export interface TestCase {
  /** Stable id for slicing / referencing in reports. */
  id: string;
  /** One-line description shown in console output. */
  description: string;
  /** The user's chat message to send. */
  user_message: string;
  /**
   * The graph fixture to use for the system prompt. Different
   * cases need different graphs (energy-vs-semiconductors test
   * needs both domains present, etc).
   */
  graph_fixture: GraphFixtureName;
  /**
   * Tool-call assertions. The model PASSES if any one of these
   * matches the actual tool call. Empty array = no tool call
   * required (and zero tool calls counts as pass).
   */
  accepted_tool_calls?: ToolCallAssertion[];
  /**
   * If true, the test fails when the model emits ANY tool call.
   * Use for plain Q&A tests where tool use would be wrong.
   */
  forbid_tool_calls?: boolean;
  /** Regexes that must appear in the displayed response text. */
  required_in_response?: RegExp[];
  /** Regexes that must NOT appear in the displayed response text. */
  forbidden_in_response?: RegExp[];
  /**
   * Tags for filtering / reporting (e.g. "tool-selection",
   * "refusal", "multi-step"). Free-form.
   */
  tags?: string[];
}

/**
 * A description of an acceptable tool call. The actual call must
 * match `name` exactly and pass every `params_match` predicate.
 *
 * Param values can be matched in three ways:
 *   - RegExp: tested against the stringified param value
 *   - "<string>:includes": substring check
 *   - { domains_includes: "x" }: array contains element
 */
export interface ToolCallAssertion {
  name: string;
  /** Predicate-per-param matchers. All must pass. */
  params_match?: Record<string, ParamMatcher>;
}

export type ParamMatcher =
  | RegExp
  | string
  | number
  | { includes: string }
  | { array_includes: string };

/**
 * Names of fixture graphs the runner knows how to build. Adding a
 * new fixture means extending `buildFixture` in cases/seed.ts.
 */
export type GraphFixtureName = "geopolitical_main" | "small_energy" | "empty";

// ─── Eval result ────────────────────────────────────────────────

export interface EvalResult {
  case_id: string;
  case_description: string;
  passed: boolean;
  /** Per-assertion outcomes for diff/debugging. */
  assertions: AssertionResult[];
  /** What the model actually emitted (for debugging failures). */
  observed: {
    display_text: string;
    tool_calls: ObservedToolCall[];
    /** Raw assistant message including action tags. */
    raw_assistant_message: string;
  };
  /** Wall-clock duration of the LLM call. */
  latency_ms: number;
  /** Provider/model used so per-model rollups are easy. */
  model_provider: string;
  model_id: string;
  /** Set if the call itself errored (network, auth, etc). */
  error?: string;
}

export interface AssertionResult {
  /** Human-readable label, e.g. "tool_call matches isolate_nodes" */
  label: string;
  passed: boolean;
  /** What was expected. */
  expected: string;
  /** What was observed. */
  observed: string;
}

export interface ObservedToolCall {
  name: string;
  params: Record<string, unknown>;
  result: string;
}

// ─── Aggregate report ───────────────────────────────────────────

export interface EvalReport {
  model_provider: string;
  model_id: string;
  total: number;
  passed: number;
  failed: number;
  errored: number;
  pass_rate: number;
  mean_latency_ms: number;
  /** Per-case results in order. */
  results: EvalResult[];
  /** ISO timestamp when the eval ran. */
  ran_at: string;
}
