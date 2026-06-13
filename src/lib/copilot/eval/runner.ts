// ─── Eval Runner ────────────────────────────────────────────────
//
// Executes a TestCase[] against an LLM and returns EvalResult[].
//
// Why call streamText directly instead of /api/copilot:
//   - No server required to run evals (just an API key + tsx)
//   - Tests model behavior, not the route handler. The route is
//     thin — its real work is delegating to streamText with the
//     same prompt + tool registry the eval uses.
//
// Limitations of this first cut:
//   - Single shot per case (no statistical sampling for stability)
//   - No native tool_use yet — relies on the existing text-tag
//     wire format. Models that don't follow it will fail.
//   - No token-count / cost capture (the SDK exposes usage on
//     finishReason but we leave that for a follow-up).

import { streamText, convertToModelMessages, type LanguageModel, type UIMessage } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LLMProvider } from "@/lib/llm-providers";
import type { ApexState } from "@/stores/useApexStore";
import { COPILOT_SYSTEM_PROMPT } from "../system-prompt";
import { executeActionsWithTrace } from "../tool-registry";
// Side-effect import: registers all built-in tools.
import "../tools";
import { serializeGraphContext } from "../../copilot-context";
import { wrapUntrusted } from "../../security/untrusted-context";
import { evaluateCase } from "./assertions";
import type { EvalReport, EvalResult, ObservedToolCall, TestCase } from "./types";
import { buildFixture } from "./cases/seed";

// ─── Public API ─────────────────────────────────────────────────

export interface RunEvalOptions {
  cases: TestCase[];
  provider: LLMProvider;
  model: string;
  apiKey: string;
  /** Lower temperature → more deterministic. Default 0. */
  temperature?: number;
  /** Per-case console line. Default: human-readable progress. */
  onCaseComplete?: (result: EvalResult) => void;
}

export async function runEval(opts: RunEvalOptions): Promise<EvalReport> {
  const results: EvalResult[] = [];
  const ranAt = new Date().toISOString();

  for (const testCase of opts.cases) {
    const result = await runCase(testCase, opts);
    results.push(result);
    opts.onCaseComplete?.(result);
  }

  const passed = results.filter((r) => r.passed).length;
  const errored = results.filter((r) => r.error !== undefined).length;
  const meanLatency =
    results.length > 0
      ? results.reduce((s, r) => s + r.latency_ms, 0) / results.length
      : 0;

  return {
    model_provider: opts.provider,
    model_id: opts.model,
    total: results.length,
    passed,
    failed: results.length - passed,
    errored,
    pass_rate: results.length > 0 ? passed / results.length : 0,
    mean_latency_ms: meanLatency,
    results,
    ran_at: ranAt,
  };
}

// ─── Per-case execution ─────────────────────────────────────────

async function runCase(testCase: TestCase, opts: RunEvalOptions): Promise<EvalResult> {
  const start = Date.now();
  const graph = buildFixture(testCase.graph_fixture);

  const systemContext = serializeGraphContext(graph, {
    selectedNode: null,
    severedEdges: [],
    shocks: [],
    interventionMode: false,
    interventionTarget: null,
  });
  const fullSystem = `${COPILOT_SYSTEM_PROMPT}\n\n--- LIVE GRAPH CONTEXT ---\n${wrapUntrusted(systemContext)}`;

  const userMessage: UIMessage = {
    id: "u-1",
    role: "user",
    parts: [{ type: "text", text: testCase.user_message }],
  };

  let rawAssistantMessage = "";
  let error: string | undefined;

  try {
    const result = streamText({
      model: resolveModel(opts.provider, opts.model, opts.apiKey),
      system: fullSystem,
      messages: await convertToModelMessages([userMessage]),
      temperature: opts.temperature ?? 0,
    });

    for await (const delta of result.textStream) {
      rawAssistantMessage += delta;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const latencyMs = Date.now() - start;

  // Parse tool calls + display text via the same registry the
  // production code uses. The stub store has just enough surface
  // for handlers to read graphData / shocks / severedEdges and
  // no-op on setters. Eval-time mutations don't carry over
  // between cases — we only need the {name, params, result}
  // structure, not the side effects.
  const stubStore = {
    graphData: graph,
    shocks: [] as ApexState["shocks"],
    severedEdges: [] as string[],
  } as unknown as ApexState;
  const { displayText, toolCalls } = await executeActionsWithTrace(rawAssistantMessage, {
    getStore: () => stubStore,
  });

  const observedToolCalls: ObservedToolCall[] = toolCalls.map((tc) => ({
    name: tc.name,
    params: tc.params,
    result: tc.result,
  }));

  const assertions = error
    ? []
    : evaluateCase(testCase, { display_text: displayText, tool_calls: observedToolCalls });

  const passed = !error && assertions.every((a) => a.passed);

  return {
    case_id: testCase.id,
    case_description: testCase.description,
    passed,
    assertions,
    observed: {
      display_text: displayText,
      tool_calls: observedToolCalls,
      raw_assistant_message: rawAssistantMessage,
    },
    latency_ms: latencyMs,
    model_provider: opts.provider,
    model_id: opts.model,
    error,
  };
}

// ─── Provider → model adapter (mirrors /api/copilot) ──────────

function resolveModel(provider: LLMProvider, model: string, apiKey: string): LanguageModel {
  switch (provider) {
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(model || "claude-sonnet-4-20250514");
    }
    case "gemini": {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(model || "gemini-2.5-flash");
    }
    case "ollama":
      throw new Error(
        "Ollama eval provider not wired yet — run evals against gemini or anthropic for now",
      );
  }
}

// ─── Console printer ───────────────────────────────────────────

/** Render a one-line summary for a result, suitable for streaming console output. */
export function formatResultLine(result: EvalResult): string {
  const status = result.error ? "ERR" : result.passed ? "PASS" : "FAIL";
  const dot = result.error ? "💥" : result.passed ? "✓" : "✗";
  return `  ${dot} [${status}] ${result.case_id} — ${result.latency_ms}ms${result.error ? ` (${result.error})` : ""}`;
}

/** Render a full report for end-of-run summary. */
export function formatReport(report: EvalReport): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`=== EVAL REPORT — ${report.model_provider} / ${report.model_id} ===`);
  lines.push(`Ran at:        ${report.ran_at}`);
  lines.push(`Total:         ${report.total}`);
  lines.push(`Passed:        ${report.passed} (${(report.pass_rate * 100).toFixed(1)}%)`);
  lines.push(`Failed:        ${report.failed}`);
  lines.push(`Errored:       ${report.errored}`);
  lines.push(`Mean latency:  ${report.mean_latency_ms.toFixed(0)}ms`);
  lines.push("");

  for (const r of report.results) {
    lines.push(formatResultLine(r));
    if (!r.passed && !r.error) {
      for (const a of r.assertions.filter((x) => !x.passed)) {
        lines.push(`      ⤷ ${a.label}`);
        lines.push(`         expected: ${a.expected}`);
        lines.push(`         observed: ${a.observed}`);
      }
    }
  }
  lines.push("");
  return lines.join("\n");
}
