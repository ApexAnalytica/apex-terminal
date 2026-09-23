import { describe, it, expect } from "vitest";
import { summarize, type AnalyticsInputRow } from "@/lib/copilot/analytics";

function row(overrides: Partial<AnalyticsInputRow> = {}): AnalyticsInputRow {
  return {
    created_at: "2026-05-09T10:00:00Z",
    conversation_id: "c1",
    tool_calls: [],
    model_provider: "gemini",
    model_id: "gemini-2.5-flash",
    ...overrides,
  };
}

function tc(name: string, latency_ms: number, error: string | null = null) {
  return { name, latency_ms, error };
}

describe("summarize", () => {
  it("returns zeros + nulls on empty input", () => {
    const s = summarize([]);
    expect(s).toEqual({
      total_turns: 0,
      total_tool_calls: 0,
      distinct_conversations: 0,
      earliest_at: null,
      latest_at: null,
      by_tool: [],
      by_model: [],
    });
  });

  it("counts turns, tool calls, and distinct conversations", () => {
    const s = summarize([
      row({ conversation_id: "c1", tool_calls: [tc("a", 10), tc("b", 20)] }),
      row({ conversation_id: "c1", tool_calls: [tc("a", 30)] }),
      row({ conversation_id: "c2", tool_calls: [] }),
    ]);
    expect(s.total_turns).toBe(3);
    expect(s.total_tool_calls).toBe(3);
    expect(s.distinct_conversations).toBe(2);
  });

  it("picks the earliest + latest created_at correctly", () => {
    const s = summarize([
      row({ created_at: "2026-05-09T12:00:00Z" }),
      row({ created_at: "2026-05-08T08:00:00Z" }),
      row({ created_at: "2026-05-09T11:00:00Z" }),
    ]);
    expect(s.earliest_at).toBe("2026-05-08T08:00:00Z");
    expect(s.latest_at).toBe("2026-05-09T12:00:00Z");
  });

  it("aggregates per-tool counts, sorted desc by count", () => {
    const s = summarize([
      row({ tool_calls: [tc("popular", 10), tc("popular", 20), tc("rare", 5)] }),
      row({ tool_calls: [tc("popular", 30)] }),
    ]);
    expect(s.by_tool.map((t) => t.name)).toEqual(["popular", "rare"]);
    expect(s.by_tool[0].count).toBe(3);
    expect(s.by_tool[1].count).toBe(1);
  });

  it("computes mean / p50 / p95 latency correctly for a tool", () => {
    const s = summarize([
      row({
        tool_calls: [
          tc("solve", 100),
          tc("solve", 200),
          tc("solve", 300),
          tc("solve", 400),
          tc("solve", 500),
        ],
      }),
    ]);
    const stat = s.by_tool[0];
    expect(stat.name).toBe("solve");
    expect(stat.mean_latency_ms).toBe(300);
    expect(stat.p50_latency_ms).toBe(300);
    // p95 with 5 samples (indices 0..4): (5-1)*0.95 = 3.8 → between 400 and 500
    // linear interp: 400 + 0.8 * (500 - 400) = 480. Float-tolerant.
    expect(stat.p95_latency_ms).toBeCloseTo(480, 8);
  });

  it("computes error_count + error_rate per tool", () => {
    const s = summarize([
      row({
        tool_calls: [
          tc("flaky", 50, null),
          tc("flaky", 50, "oops"),
          tc("flaky", 50, "again"),
          tc("flaky", 50, null),
        ],
      }),
    ]);
    const stat = s.by_tool[0];
    expect(stat.count).toBe(4);
    expect(stat.error_count).toBe(2);
    expect(stat.error_rate).toBe(0.5);
  });

  it("groups by (provider, model_id) pair, sorted desc by count", () => {
    const s = summarize([
      row({ model_provider: "gemini", model_id: "gemini-2.5-flash" }),
      row({ model_provider: "gemini", model_id: "gemini-2.5-flash" }),
      row({ model_provider: "anthropic", model_id: "claude-sonnet-4-20250514" }),
      row({ model_provider: "gemini", model_id: "gemini-2.5-pro" }),
    ]);
    expect(s.by_model).toEqual([
      { provider: "gemini", model_id: "gemini-2.5-flash", count: 2 },
      { provider: "anthropic", model_id: "claude-sonnet-4-20250514", count: 1 },
      { provider: "gemini", model_id: "gemini-2.5-pro", count: 1 },
    ]);
  });

  it("falls back to '?' for missing provider / model_id", () => {
    const s = summarize([row({ model_provider: null, model_id: null })]);
    expect(s.by_model[0]).toEqual({ provider: "?", model_id: "?", count: 1 });
  });

  it("treats a row with no tool_calls as a valid turn (just no tool stats)", () => {
    const s = summarize([row({ tool_calls: [] })]);
    expect(s.total_turns).toBe(1);
    expect(s.total_tool_calls).toBe(0);
    expect(s.by_tool).toEqual([]);
  });
});
