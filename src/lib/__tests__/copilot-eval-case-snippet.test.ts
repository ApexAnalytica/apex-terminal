import { describe, it, expect } from "vitest";
import {
  buildCaseSnippet,
  defaultFormFromTrace,
} from "@/lib/copilot/eval/case-snippet";
import type { ObservedToolCall } from "@/lib/copilot/eval/types";

// ─── defaultFormFromTrace ───────────────────────────────────────

describe("defaultFormFromTrace", () => {
  it("slugifies the user message into the id", () => {
    const form = defaultFormFromTrace({
      user_message: "Show me only the energy stuff!",
      tool_calls: [],
    });
    expect(form.id).toBe("show_me_only_the_energy_stuff");
  });

  it("falls back to 'untitled_case' on empty / non-alpha input", () => {
    expect(defaultFormFromTrace({ user_message: null, tool_calls: [] }).id).toBe(
      "untitled_case",
    );
    expect(defaultFormFromTrace({ user_message: "!?@#$", tool_calls: [] }).id).toBe(
      "untitled_case",
    );
  });

  it("sets forbid_tool_calls=true when no tools were emitted", () => {
    const form = defaultFormFromTrace({ user_message: "hi", tool_calls: [] });
    expect(form.forbid_tool_calls).toBe(true);
  });

  it("sets forbid_tool_calls=false when tools were emitted", () => {
    const form = defaultFormFromTrace({
      user_message: "show me energy",
      tool_calls: [tc("isolate_nodes", { query: "energy" })],
    });
    expect(form.forbid_tool_calls).toBe(false);
  });

  it("derives tags from tool names — single tool", () => {
    const form = defaultFormFromTrace({
      user_message: "isolate nodes",
      tool_calls: [tc("isolate_nodes", { query: "x" })],
    });
    expect(form.tags).toContain("isolate_nodes");
  });

  it("uses 'multi-tool' tag when multiple tools fired", () => {
    const form = defaultFormFromTrace({
      user_message: "do both",
      tool_calls: [tc("a", {}), tc("b", {})],
    });
    expect(form.tags).toContain("multi-tool");
  });
});

// ─── buildCaseSnippet ───────────────────────────────────────────

describe("buildCaseSnippet", () => {
  it("emits a complete TestCase literal for a tool-emitting trace", () => {
    const snippet = buildCaseSnippet(
      {
        user_message: "show me only the energy stuff",
        tool_calls: [tc("isolate_nodes", { query: "energy" })],
      },
      {
        id: "isolate_energy",
        description: "User wants only energy nodes visible.",
        graph_fixture: "geopolitical_main",
        tags: "tool-selection, filtering",
      },
    );
    expect(snippet).toContain('id: "isolate_energy"');
    expect(snippet).toContain('user_message: "show me only the energy stuff"');
    expect(snippet).toContain('graph_fixture: "geopolitical_main"');
    expect(snippet).toContain("accepted_tool_calls:");
    expect(snippet).toContain('name: "isolate_nodes"');
    expect(snippet).toContain('query: { includes: "energy" }');
    expect(snippet).toContain('tags: ["tool-selection", "filtering"]');
  });

  it("emits forbid_tool_calls and skips accepted_tool_calls when forbid is set", () => {
    const snippet = buildCaseSnippet(
      { user_message: "what is omega-fragility?", tool_calls: [] },
      {
        id: "qa_omega",
        description: "Definitional question.",
        graph_fixture: "geopolitical_main",
        forbid_tool_calls: true,
      },
    );
    expect(snippet).toContain("forbid_tool_calls: true");
    expect(snippet).not.toContain("accepted_tool_calls:");
  });

  it("renders required and forbidden response regexes correctly", () => {
    const snippet = buildCaseSnippet(
      { user_message: "x", tool_calls: [] },
      {
        id: "test",
        description: "test",
        graph_fixture: "geopolitical_main",
        required_in_response: "energy\ngrid",
        forbidden_in_response: "cannot|refuse",
      },
    );
    expect(snippet).toMatch(/required_in_response: \[\/energy\/i, \/grid\/i\]/);
    expect(snippet).toContain("forbidden_in_response: [/cannot|refuse/i]");
  });

  it("respects pre-flagged regex literals (e.g. /pattern/g) verbatim", () => {
    const snippet = buildCaseSnippet(
      { user_message: "x", tool_calls: [] },
      {
        id: "test",
        description: "test",
        graph_fixture: "geopolitical_main",
        required_in_response: "/Ω.{0,40}fragility/i",
      },
    );
    expect(snippet).toContain("required_in_response: [/Ω.{0,40}fragility/i]");
  });

  it("uses array_includes for array params and exact match for numbers", () => {
    const snippet = buildCaseSnippet(
      {
        user_message: "x",
        tool_calls: [tc("solve_interdiction", { budget: 3, mode: "edge" }), tc("set_domains", { domains: ["energy-systems", "finance"] })],
      },
      { id: "t", description: "t", graph_fixture: "geopolitical_main" },
    );
    expect(snippet).toContain("budget: 3");
    expect(snippet).toContain('mode: { includes: "edge" }');
    expect(snippet).toContain('domains: { array_includes: "energy-systems" }');
  });

  it("emits a name-only assertion when the tool has no params", () => {
    const snippet = buildCaseSnippet(
      { user_message: "x", tool_calls: [tc("start_replay", {})] },
      { id: "t", description: "t", graph_fixture: "geopolitical_main" },
    );
    expect(snippet).toMatch(/{ name: "start_replay" }/);
    expect(snippet).not.toContain("params_match");
  });

  it("escapes quotes correctly in user_message", () => {
    const snippet = buildCaseSnippet(
      { user_message: 'he said "hello"', tool_calls: [] },
      { id: "t", description: "t", graph_fixture: "geopolitical_main" },
    );
    // JSON.stringify produces \"…\" — so the literal in the snippet
    // ends up as user_message: "he said \"hello\""
    expect(snippet).toContain('user_message: "he said \\"hello\\""');
  });
});

// ─── Helpers ────────────────────────────────────────────────────

function tc(name: string, params: Record<string, unknown>): ObservedToolCall {
  return { name, params, result: "" };
}
