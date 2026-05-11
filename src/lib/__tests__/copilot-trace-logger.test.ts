import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  defineTool,
  executeTagWithTrace,
  executeActionsWithTrace,
  __resetRegistryForTests,
  type ToolCallTrace,
} from "@/lib/copilot/tool-registry";
import { hashPrompt, newConversationId, logTurnTrace, resolveActiveDataset } from "@/lib/copilot/trace-logger";
import type { ApexState } from "@/stores/useApexStore";

// ─── Registry trace shape ───────────────────────────────────────

describe("executeTagWithTrace — structured trace shape", () => {
  beforeEach(() => __resetRegistryForTests());

  it("returns name + validated params + result + null error + latency on success", () => {
    defineTool({
      name: "select_node",
      description: "test",
      params: { node: { type: "string", required: true } },
      legacyParam: "node",
      handler: () => "Selected node: USA_GRID",
    });

    const trace = executeTagWithTrace(
      { name: "select_node", payload: "USA_GRID", raw: "" },
      { getStore: () => ({}) as ApexState },
    );

    expect(trace.name).toBe("select_node");
    expect(trace.params).toEqual({ node: "USA_GRID" });
    expect(trace.result).toBe("Selected node: USA_GRID");
    expect(trace.error).toBeNull();
    expect(typeof trace.latency_ms).toBe("number");
    expect(trace.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it("populates error when validation fails", () => {
    defineTool({
      name: "needs_arg",
      description: "test",
      params: { x: { type: "string", required: true } },
      handler: () => "ok",
    });

    const trace = executeTagWithTrace(
      { name: "needs_arg", payload: "", raw: "" },
      { getStore: () => ({}) as ApexState },
    );

    expect(trace.error).toMatch(/Missing required/);
    expect(trace.result).toMatch(/Missing required/);
  });

  it("populates error when handler throws", () => {
    defineTool({
      name: "boom",
      description: "test",
      params: {},
      handler: () => {
        throw new Error("kaboom");
      },
    });

    const trace = executeTagWithTrace(
      { name: "boom", payload: "", raw: "" },
      { getStore: () => ({}) as ApexState },
    );

    expect(trace.error).toBe("kaboom");
    expect(trace.result).toMatch(/boom failed: kaboom/);
  });

  it("emits a trace per parsed tag from executeActionsWithTrace", () => {
    defineTool({
      name: "a",
      description: "",
      params: {},
      handler: () => "did a",
    });
    defineTool({
      name: "b",
      description: "",
      params: { v: { type: "string", required: true } },
      legacyParam: "v",
      handler: ({ v }) => `did b with ${v}`,
    });

    const text = "Hello <<<ACTION:a>>> middle <<<ACTION:b:hi>>> end";
    const result = executeActionsWithTrace(text, { getStore: () => ({}) as ApexState });

    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls[0]).toMatchObject<Partial<ToolCallTrace>>({
      name: "a",
      params: {},
      error: null,
    });
    expect(result.toolCalls[1]).toMatchObject<Partial<ToolCallTrace>>({
      name: "b",
      params: { v: "hi" },
      error: null,
    });
    expect(result.displayText).toBe("Hello  middle  end");
  });
});

// ─── hashPrompt + newConversationId ─────────────────────────────

describe("hashPrompt", () => {
  it("is deterministic", () => {
    expect(hashPrompt("hello world")).toBe(hashPrompt("hello world"));
  });

  it("changes when input changes (collision-resistant for short strings)", () => {
    expect(hashPrompt("hello world")).not.toBe(hashPrompt("hello world!"));
    expect(hashPrompt("a")).not.toBe(hashPrompt("b"));
  });

  it("returns a hex string", () => {
    expect(hashPrompt("anything")).toMatch(/^[0-9a-f]+$/);
  });
});

describe("newConversationId", () => {
  it("returns a non-empty string", () => {
    const id = newConversationId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");
  });

  it("is unique across calls", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newConversationId()));
    expect(ids.size).toBe(50);
  });
});

// ─── logTurnTrace fail-safe ─────────────────────────────────────

describe("logTurnTrace — fail-safe semantics", () => {
  const validTrace = {
    conversation_id: "cv_test",
    turn_index: 0,
    user_message: "hi",
    assistant_message: "hello",
    display_text: "hello",
    tool_calls: [],
    model_provider: "gemini",
    model_id: "gemini-2.5-pro",
    system_prompt_hash: "abc",
    system_prompt_size: 100,
    dataset: null,
    active_module: "spirtes",
    selected_node: null,
    active_shock_count: 0,
  };

  it("returns true on a 200 response", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true } as Response);
    vi.stubGlobal("fetch", fetchSpy);

    const result = await logTurnTrace(validTrace);
    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/copilot/trace",
      expect.objectContaining({ method: "POST" }),
    );

    vi.unstubAllGlobals();
  });

  it("returns false (does not throw) on a 500 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response));
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await logTurnTrace(validTrace);
    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("returns false (does not throw) when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await logTurnTrace(validTrace);
    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("posts the trace as JSON in the request body", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true } as Response);
    vi.stubGlobal("fetch", fetchSpy);

    await logTurnTrace(validTrace);
    const callArgs = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect(callArgs.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.parse(callArgs.body as string)).toEqual(validTrace);

    vi.unstubAllGlobals();
  });
});

// ─── resolveActiveDataset ───────────────────────────────────────

describe("resolveActiveDataset", () => {
  const cards = [
    { id: "energy-systems", dataset: "main" },
    { id: "fx-stress", dataset: "main" },
    { id: "defense-supply", dataset: "athena" },
    { id: "t1d-mech", dataset: "t1d" },
    { id: "vx880-trial", dataset: "vx880" },
  ];

  it("returns null when no domains are selected", () => {
    expect(resolveActiveDataset([], cards)).toBeNull();
  });

  it("returns 'main' for a generic geopolitical selection", () => {
    expect(resolveActiveDataset(["energy-systems", "fx-stress"], cards)).toBe("main");
  });

  it("returns the only dataset when one domain is selected", () => {
    expect(resolveActiveDataset(["t1d-mech"], cards)).toBe("t1d");
  });

  it("prefers t1d > vx880 > athena > main when domains span datasets", () => {
    // t1d wins over vx880 wins over athena wins over main
    expect(
      resolveActiveDataset(["energy-systems", "vx880-trial", "t1d-mech"], cards),
    ).toBe("t1d");
    expect(
      resolveActiveDataset(["energy-systems", "defense-supply", "vx880-trial"], cards),
    ).toBe("vx880");
    expect(
      resolveActiveDataset(["energy-systems", "defense-supply"], cards),
    ).toBe("athena");
  });

  it("returns null if every selected id is unknown", () => {
    expect(resolveActiveDataset(["does-not-exist"], cards)).toBeNull();
  });

  it("falls back to the first dataset for unrecognized dataset values", () => {
    const customCards = [{ id: "future-domain", dataset: "future-dataset" }];
    expect(resolveActiveDataset(["future-domain"], customCards)).toBe("future-dataset");
  });
});
