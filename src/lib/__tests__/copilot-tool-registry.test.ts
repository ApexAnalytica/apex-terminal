import { describe, it, expect, beforeEach } from "vitest";
import {
  defineTool,
  parseActionTags,
  parseKvPayload,
  coerceAndValidate,
  executeTag,
  executeActions,
  renderToolsForPrompt,
  renderToolsAsJsonSchema,
  __resetRegistryForTests,
  type ToolContext,
  type ParamShape,
} from "@/lib/copilot/tool-registry";
import type { ApexState } from "@/stores/useApexStore";
import type { CausalGraph, CausalNode } from "@/lib/types";
import { makeNode, makeEdge, makeGraph } from "./fixtures/graph-fixtures";

// ─── Mock context ───────────────────────────────────────────────

interface StoreSpy {
  setSelectedNode: { calls: (string | null)[] };
  setSelectedNodes: { calls: string[][] };
  setIsolateSelection: { calls: boolean[] };
  graph: CausalGraph;
  selectedNodes: string[];
  isolateSelection: boolean;
}

function makeMockContext(graph: CausalGraph): { ctx: ToolContext; spy: StoreSpy } {
  const spy: StoreSpy = {
    setSelectedNode: { calls: [] },
    setSelectedNodes: { calls: [] },
    setIsolateSelection: { calls: [] },
    graph,
    selectedNodes: [],
    isolateSelection: false,
  };

  const fakeStore = {
    graphData: graph,
    selectedNodes: spy.selectedNodes,
    isolateSelection: spy.isolateSelection,
    setSelectedNode: (id: string | null) => spy.setSelectedNode.calls.push(id),
    setSelectedNodes: (ids: string[]) => {
      spy.setSelectedNodes.calls.push(ids);
      spy.selectedNodes = ids;
    },
    setIsolateSelection: (on: boolean) => {
      spy.setIsolateSelection.calls.push(on);
      spy.isolateSelection = on;
    },
  } as unknown as ApexState;

  return { ctx: { getStore: () => fakeStore }, spy };
}

// ─── Parser tests ───────────────────────────────────────────────

describe("parseActionTags", () => {
  it("extracts a single bare action tag", () => {
    const tags = parseActionTags("Hello <<<ACTION:select_node:USA_GRID>>> world.");
    expect(tags).toHaveLength(1);
    expect(tags[0]).toMatchObject({ name: "select_node", payload: "USA_GRID" });
  });

  it("extracts multiple tags from one response", () => {
    const tags = parseActionTags("<<<ACTION:add_shock:TAIWAN>>> then <<<ACTION:set_module:pearl>>>");
    expect(tags).toHaveLength(2);
    expect(tags.map((t) => t.name)).toEqual(["add_shock", "set_module"]);
  });

  it("handles a payload-less tag (nullary action)", () => {
    const tags = parseActionTags("<<<ACTION:reset_severed>>>");
    expect(tags).toHaveLength(1);
    expect(tags[0]).toMatchObject({ name: "reset_severed", payload: "" });
  });
});

describe("parseKvPayload", () => {
  it("parses a single k=v pair", () => {
    expect(parseKvPayload("budget=3")).toEqual({ budget: "3" });
  });

  it("parses multiple k=v pairs separated by commas", () => {
    expect(parseKvPayload("budget=3,mode=edge")).toEqual({ budget: "3", mode: "edge" });
  });

  it("preserves a bare payload as _legacy for back-compat", () => {
    expect(parseKvPayload("USA_GRID")).toEqual({ _legacy: "USA_GRID" });
  });

  it("returns empty for an empty payload", () => {
    expect(parseKvPayload("")).toEqual({});
    expect(parseKvPayload("   ")).toEqual({});
  });

  it("trims whitespace inside k=v", () => {
    expect(parseKvPayload(" budget = 3 , mode = edge ")).toEqual({ budget: "3", mode: "edge" });
  });
});

// ─── Coercion tests ─────────────────────────────────────────────

describe("coerceAndValidate", () => {
  it("validates a required string", () => {
    const shape = { node: { type: "string", required: true } } as const satisfies ParamShape;
    expect(coerceAndValidate(shape, { node: "USA_GRID" }, undefined).ok).toBe(true);
    const missing = coerceAndValidate(shape, {}, undefined);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toMatch(/Missing required/);
  });

  it("routes the legacy payload onto the designated legacyParam", () => {
    const shape = { node: { type: "string", required: true } } as const satisfies ParamShape;
    const result = coerceAndValidate(shape, { _legacy: "USA_GRID" }, "node");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.params.node).toBe("USA_GRID");
  });

  it("splits string[] on `|` (not `,`)", () => {
    const shape = { ids: { type: "string[]" } } as const satisfies ParamShape;
    const result = coerceAndValidate(shape, { ids: "A|B|C" }, undefined);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.params.ids).toEqual(["A", "B", "C"]);
  });

  it("clamps numbers to declared min/max", () => {
    const shape = {
      budget: { type: "number", min: 1, max: 10, required: true },
    } as const satisfies ParamShape;
    const tooHigh = coerceAndValidate(shape, { budget: "999" }, undefined);
    expect(tooHigh.ok).toBe(true);
    if (tooHigh.ok) expect(tooHigh.params.budget).toBe(10);
    const tooLow = coerceAndValidate(shape, { budget: "0" }, undefined);
    expect(tooLow.ok).toBe(true);
    if (tooLow.ok) expect(tooLow.params.budget).toBe(1);
  });

  it("applies a default when the param is missing", () => {
    const shape = {
      budget: { type: "number", default: 3 },
      mode: { type: "enum", values: ["edge", "node"] as const, default: "edge" },
    } as const satisfies ParamShape;
    const result = coerceAndValidate(shape, {}, undefined);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.budget).toBe(3);
      expect(result.params.mode).toBe("edge");
    }
  });

  it("rejects enum values outside the declared set", () => {
    const shape = {
      mode: { type: "enum", values: ["edge", "node"] as const, required: true },
    } as const satisfies ParamShape;
    const bad = coerceAndValidate(shape, { mode: "purple" }, undefined);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/not in/);
  });
});

// ─── Registry + execution ───────────────────────────────────────

describe("registry — defineTool / executeTag", () => {
  beforeEach(() => {
    __resetRegistryForTests();
  });

  it("returns 'Unknown action' for an unregistered name", () => {
    const result = executeTag(
      { name: "nope", payload: "", raw: "" },
      { getStore: () => ({}) as ApexState },
    );
    expect(result).toMatch(/Unknown action: nope/);
  });

  it("rejects invalid params with a clear error before invoking the handler", () => {
    let called = false;
    defineTool({
      name: "select_node",
      description: "test",
      params: { node: { type: "string", required: true } },
      legacyParam: "node",
      handler: () => {
        called = true;
        return "ok";
      },
    });
    const result = executeTag(
      { name: "select_node", payload: "", raw: "" },
      { getStore: () => ({}) as ApexState },
    );
    expect(result).toMatch(/Missing required/);
    expect(called).toBe(false);
  });

  it("dispatches to the handler with typed params on a happy path", () => {
    let received: { node?: string } | null = null;
    defineTool({
      name: "select_node",
      description: "test",
      params: { node: { type: "string", required: true } },
      legacyParam: "node",
      handler: (params) => {
        received = params;
        return "selected";
      },
    });
    const result = executeTag(
      { name: "select_node", payload: "USA_GRID", raw: "" },
      { getStore: () => ({}) as ApexState },
    );
    expect(result).toBe("selected");
    expect(received).toEqual({ node: "USA_GRID" });
  });

  it("catches handler exceptions and returns a readable error", () => {
    defineTool({
      name: "boom",
      description: "test",
      params: {},
      handler: () => {
        throw new Error("kaboom");
      },
    });
    const result = executeTag(
      { name: "boom", payload: "", raw: "" },
      { getStore: () => ({}) as ApexState },
    );
    expect(result).toMatch(/boom failed: kaboom/);
  });
});

// ─── End-to-end on built-in tools ───────────────────────────────

describe("built-in tools — wired via the registry", () => {
  // We import the tool definitions for their side effect (registration).
  // beforeEach below does NOT reset because we want the real registrations.

  it("isolate_nodes filters by free-text query", async () => {
    await import("@/lib/copilot/tools");
    const graph = buildSampleGraph();
    const { ctx, spy } = makeMockContext(graph);

    const result = executeTag(
      { name: "isolate_nodes", payload: "query=energy", raw: "" },
      ctx,
    );
    expect(result).toMatch(/Isolated 2 nodes/);
    expect(spy.setIsolateSelection.calls).toEqual([true]);
    expect(spy.setSelectedNodes.calls[0]?.sort()).toEqual(["GRID_USA", "OIL_TX"]);
  });

  it("isolate_nodes filters by explicit ids using `|` separator", async () => {
    await import("@/lib/copilot/tools");
    const graph = buildSampleGraph();
    const { ctx, spy } = makeMockContext(graph);

    const result = executeTag(
      { name: "isolate_nodes", payload: "ids=GRID_USA|FAB_TW", raw: "" },
      ctx,
    );
    expect(result).toMatch(/Isolated 2 nodes/);
    expect(spy.setSelectedNodes.calls[0]?.sort()).toEqual(["FAB_TW", "GRID_USA"]);
    expect(spy.setIsolateSelection.calls).toEqual([true]);
  });

  it("isolate_nodes with no matches reports the failure and does NOT toggle isolation", async () => {
    await import("@/lib/copilot/tools");
    const graph = buildSampleGraph();
    const { ctx, spy } = makeMockContext(graph);

    const result = executeTag(
      { name: "isolate_nodes", payload: "query=nonexistent_topic", raw: "" },
      ctx,
    );
    expect(result).toMatch(/No nodes matched/);
    expect(spy.setIsolateSelection.calls).toEqual([]);
    expect(spy.setSelectedNodes.calls).toEqual([]);
  });

  it("isolate_nodes errors when neither query nor ids is provided", async () => {
    await import("@/lib/copilot/tools");
    const graph = buildSampleGraph();
    const { ctx, spy } = makeMockContext(graph);

    const result = executeTag({ name: "isolate_nodes", payload: "", raw: "" }, ctx);
    expect(result).toMatch(/provide either query=/);
    expect(spy.setIsolateSelection.calls).toEqual([]);
  });

  it("reset_isolation clears both selection and isolation flag", async () => {
    await import("@/lib/copilot/tools");
    const graph = buildSampleGraph();
    const { ctx, spy } = makeMockContext(graph);

    executeTag({ name: "reset_isolation", payload: "", raw: "" }, ctx);
    expect(spy.setIsolateSelection.calls).toEqual([false]);
    expect(spy.setSelectedNodes.calls).toEqual([[]]);
  });

  it("select_node still works with the legacy single-string payload", async () => {
    await import("@/lib/copilot/tools");
    const graph = buildSampleGraph();
    const { ctx, spy } = makeMockContext(graph);

    const result = executeTag({ name: "select_node", payload: "GRID_USA", raw: "" }, ctx);
    expect(result).toMatch(/Selected node/);
    expect(spy.setSelectedNode.calls).toEqual(["GRID_USA"]);
  });

  it("executeActions strips tags from displayText and runs each handler", async () => {
    await import("@/lib/copilot/tools");
    const graph = buildSampleGraph();
    const { ctx } = makeMockContext(graph);

    const text = "Focus on the energy stuff. <<<ACTION:isolate_nodes:query=energy>>>";
    const { displayText, toolResults } = executeActions(text, ctx);
    expect(displayText).toBe("Focus on the energy stuff.");
    expect(toolResults).toHaveLength(1);
    expect(toolResults[0]).toMatch(/Isolated 2 nodes/);
  });
});

// ─── System-prompt rendering ────────────────────────────────────

describe("renderToolsForPrompt", () => {
  it("includes every registered tool with its description", async () => {
    await import("@/lib/copilot/tools");
    const rendered = renderToolsForPrompt();
    expect(rendered).toContain("=== COPILOT ACTIONS ===");
    expect(rendered).toContain("isolate_nodes");
    expect(rendered).toContain("reset_isolation");
    expect(rendered).toContain("select_node");
    expect(rendered).toContain("solve_interdiction");
  });

  it("documents the kv + `|` wire format for the LLM", async () => {
    await import("@/lib/copilot/tools");
    const rendered = renderToolsForPrompt();
    expect(rendered).toContain("key=value");
    expect(rendered).toContain("|");
  });
});

describe("renderToolsAsJsonSchema (proves MCP/Anthropic-compat)", () => {
  it("emits a JSON-Schema input_schema for each tool", async () => {
    await import("@/lib/copilot/tools");
    const schemas = renderToolsAsJsonSchema();
    const isolate = schemas.find((s) => s.name === "isolate_nodes");
    expect(isolate).toBeDefined();
    expect(isolate!.input_schema.type).toBe("object");
    expect(isolate!.input_schema.properties).toHaveProperty("query");
    expect(isolate!.input_schema.properties).toHaveProperty("ids");
  });
});

// ─── Helpers ────────────────────────────────────────────────────

function buildSampleGraph(): CausalGraph {
  const nodes: CausalNode[] = [
    makeNode({ id: "GRID_USA", label: "USA Power Grid", category: "energy", domain: "Energy" }),
    makeNode({ id: "OIL_TX", label: "TX Oil Pipeline", category: "energy", domain: "Energy" }),
    makeNode({ id: "FAB_TW", label: "TSMC Fab", category: "manufacturing", domain: "Semiconductors" }),
    makeNode({ id: "BANK_NY", label: "NY Clearing Bank", category: "finance", domain: "Finance" }),
  ];
  const edges = [
    makeEdge({ id: "e1", source: "GRID_USA", target: "FAB_TW" }),
    makeEdge({ id: "e2", source: "OIL_TX", target: "FAB_TW" }),
  ];
  return makeGraph(nodes, edges);
}
