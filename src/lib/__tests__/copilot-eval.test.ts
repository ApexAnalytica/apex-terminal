// ─── Eval harness — assertion + scoring tests ──────────────────
//
// We don't unit-test runner.ts here because it requires an API
// key + live LLM call. assertions.ts is pure logic and is the
// piece we need to be confident about.

import { describe, it, expect } from "vitest";
import {
  matchParam,
  toolCallMatches,
  checkResponseText,
  checkToolCalls,
  evaluateCase,
} from "@/lib/copilot/eval/assertions";
import type { TestCase, ObservedToolCall } from "@/lib/copilot/eval/types";

// ─── matchParam ─────────────────────────────────────────────────

describe("matchParam", () => {
  it("matches RegExp against string values", () => {
    expect(matchParam("energy infrastructure", /energy/i)).toBe(true);
    expect(matchParam("financial", /energy/i)).toBe(false);
  });

  it("requires regex target to be a string", () => {
    expect(matchParam(42, /\d+/)).toBe(false);
    expect(matchParam(undefined, /any/)).toBe(false);
  });

  it("matches strings exactly", () => {
    expect(matchParam("pearl", "pearl")).toBe(true);
    expect(matchParam("Pearl", "pearl")).toBe(false);
  });

  it("matches numbers", () => {
    expect(matchParam(3, 3)).toBe(true);
    expect(matchParam("3", 3)).toBe(false);
  });

  it("includes() matches substrings", () => {
    expect(matchParam("USA_GRID_2024", { includes: "GRID" })).toBe(true);
    expect(matchParam("USA_OIL", { includes: "GRID" })).toBe(false);
  });

  it("array_includes() matches array element", () => {
    expect(matchParam(["energy-systems", "finance"], { array_includes: "energy-systems" })).toBe(true);
    expect(matchParam(["finance"], { array_includes: "energy-systems" })).toBe(false);
    expect(matchParam("not-an-array", { array_includes: "x" })).toBe(false);
  });
});

// ─── toolCallMatches ────────────────────────────────────────────

describe("toolCallMatches", () => {
  it("requires the name to match exactly", () => {
    const call: ObservedToolCall = { name: "isolate_nodes", params: { query: "energy" }, result: "" };
    expect(toolCallMatches(call, { name: "isolate_nodes" })).toBe(true);
    expect(toolCallMatches(call, { name: "set_domains" })).toBe(false);
  });

  it("requires every param matcher to pass", () => {
    const call: ObservedToolCall = {
      name: "solve_interdiction",
      params: { budget: 3, mode: "edge" },
      result: "",
    };
    expect(
      toolCallMatches(call, {
        name: "solve_interdiction",
        params_match: { budget: 3, mode: "edge" },
      }),
    ).toBe(true);
    expect(
      toolCallMatches(call, {
        name: "solve_interdiction",
        params_match: { budget: 3, mode: "node" },
      }),
    ).toBe(false);
  });

  it("passes when no params_match is given (name-only check)", () => {
    const call: ObservedToolCall = { name: "compare_nodes", params: { ids: ["A", "B"] }, result: "" };
    expect(toolCallMatches(call, { name: "compare_nodes" })).toBe(true);
  });
});

// ─── checkResponseText ──────────────────────────────────────────

describe("checkResponseText", () => {
  it("required regex must match", () => {
    const r = checkResponseText("USA Power Grid is critical.", [/USA/], undefined);
    expect(r).toHaveLength(1);
    expect(r[0].passed).toBe(true);
  });

  it("required regex that doesn't match fails", () => {
    const r = checkResponseText("hello world", [/USA/], undefined);
    expect(r[0].passed).toBe(false);
  });

  it("forbidden regex must NOT match", () => {
    const r = checkResponseText("USA Power Grid is critical.", undefined, [/cannot/i]);
    expect(r).toHaveLength(1);
    expect(r[0].passed).toBe(true);
  });

  it("forbidden regex that matches fails", () => {
    const r = checkResponseText("I cannot answer that.", undefined, [/cannot/i]);
    expect(r[0].passed).toBe(false);
  });
});

// ─── checkToolCalls ─────────────────────────────────────────────

const baseCase: TestCase = {
  id: "test",
  description: "test",
  user_message: "irrelevant",
  graph_fixture: "geopolitical_main",
};

describe("checkToolCalls", () => {
  it("any-of: passes when any accepted assertion matches a call", () => {
    const calls: ObservedToolCall[] = [
      { name: "set_domains", params: { domains: ["energy-systems"] }, result: "" },
    ];
    const r = checkToolCalls(calls, {
      ...baseCase,
      accepted_tool_calls: [
        { name: "isolate_nodes", params_match: { query: /energy/i } },
        { name: "set_domains", params_match: { domains: { array_includes: "energy-systems" } } },
      ],
    });
    expect(r).toHaveLength(1);
    expect(r[0].passed).toBe(true);
  });

  it("fails when no accepted assertion matches", () => {
    const calls: ObservedToolCall[] = [{ name: "stop_replay", params: {}, result: "" }];
    const r = checkToolCalls(calls, {
      ...baseCase,
      accepted_tool_calls: [{ name: "isolate_nodes" }],
    });
    expect(r[0].passed).toBe(false);
  });

  it("forbid_tool_calls: passes when no calls were emitted", () => {
    const r = checkToolCalls([], { ...baseCase, forbid_tool_calls: true });
    expect(r[0].passed).toBe(true);
  });

  it("forbid_tool_calls: fails when any call was emitted", () => {
    const calls: ObservedToolCall[] = [{ name: "select_node", params: { node: "X" }, result: "" }];
    const r = checkToolCalls(calls, { ...baseCase, forbid_tool_calls: true });
    expect(r[0].passed).toBe(false);
  });

  it("no expectations + no calls = no assertion records (vacuous pass)", () => {
    const r = checkToolCalls([], baseCase);
    expect(r).toHaveLength(0);
  });
});

// ─── evaluateCase end-to-end ────────────────────────────────────

describe("evaluateCase", () => {
  it("aggregates tool-call + response-text assertions", () => {
    const r = evaluateCase(
      {
        ...baseCase,
        accepted_tool_calls: [{ name: "isolate_nodes" }],
        required_in_response: [/energy/i],
        forbidden_in_response: [/cannot/i],
      },
      {
        display_text: "Filtered to energy nodes.",
        tool_calls: [{ name: "isolate_nodes", params: { query: "energy" }, result: "" }],
      },
    );
    expect(r).toHaveLength(3); // 1 tool-call + 1 required + 1 forbidden
    expect(r.every((a) => a.passed)).toBe(true);
  });

  it("flags individual failures with diagnostic detail", () => {
    const r = evaluateCase(
      {
        ...baseCase,
        accepted_tool_calls: [{ name: "isolate_nodes" }],
        required_in_response: [/energy/i],
      },
      {
        display_text: "I cannot help with that.",
        tool_calls: [],
      },
    );
    const failures = r.filter((a) => !a.passed);
    expect(failures.length).toBe(2);
    expect(failures[0].observed).toMatch(/no tool calls/i);
    expect(failures[1].observed).toMatch(/not found/);
  });
});
