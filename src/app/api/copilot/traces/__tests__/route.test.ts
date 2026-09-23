// @vitest-environment node
//
// Tests for GET /api/copilot/traces. We mock @/lib/supabase/server
// at the module level — the route never touches a real Supabase
// instance during tests. This validates:
//   - Anonymous callers get an empty list, not a 401
//   - Authenticated callers get filtered rows
//   - Bad limits clamp to safe range
//   - Server-client init failures return 503

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mock the supabase server client ───────────────────────────
//
// The route does: supabase.from("copilot_traces").select(...).order(...).limit(N)
// The mock's select/order both return the same chainable object, and
// limit resolves the final promise.

let mockUser: { id: string } | null = null;
let mockRows: unknown[] = [];
let mockError: { message: string } | null = null;
let mockClientThrows: boolean = false;
let lastFromCalledWith: string | undefined;
let lastLimitCalledWith: number | undefined;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    if (mockClientThrows) throw new Error("supabase client init failed");
    return {
      auth: {
        getUser: async () => ({ data: { user: mockUser } }),
      },
      from: (table: string) => {
        lastFromCalledWith = table;
        const chain = {
          select: () => chain,
          order: () => chain,
          limit: (n: number) => {
            lastLimitCalledWith = n;
            return Promise.resolve({ data: mockRows, error: mockError });
          },
        };
        return chain;
      },
    };
  },
}));

// Import AFTER the mock is registered.
const { GET } = await import("@/app/api/copilot/traces/route");

// ─── Helpers ────────────────────────────────────────────────────

function req(url = "http://localhost/api/copilot/traces"): NextRequest {
  return new NextRequest(url, { method: "GET" });
}

beforeEach(() => {
  mockUser = null;
  mockRows = [];
  mockError = null;
  mockClientThrows = false;
  lastFromCalledWith = undefined;
  lastLimitCalledWith = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ──────────────────────────────────────────────────────

describe("GET /api/copilot/traces", () => {
  it("returns empty list (200) for anonymous callers — never 401", async () => {
    mockUser = null;
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { traces: unknown[] };
    expect(body.traces).toEqual([]);
  });

  it("returns rows for authenticated callers", async () => {
    mockUser = { id: "user-1" };
    mockRows = [
      {
        id: "t1",
        created_at: "2026-05-08T00:00:00Z",
        conversation_id: "c1",
        turn_index: 0,
        user_message: "hello",
        assistant_message: "hi",
        display_text: "hi",
        tool_calls: [],
        model_provider: "gemini",
        model_id: "gemini-2.5-flash",
        dataset: null,
        active_module: "spirtes",
      },
    ];
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { traces: { id: string }[] };
    expect(body.traces).toHaveLength(1);
    expect(body.traces[0].id).toBe("t1");
    expect(lastFromCalledWith).toBe("copilot_traces");
  });

  it("clamps the limit to MAX_LIMIT (200)", async () => {
    mockUser = { id: "user-1" };
    await GET(req("http://localhost/api/copilot/traces?limit=999"));
    expect(lastLimitCalledWith).toBe(200);
  });

  it("clamps a negative or zero limit to a minimum of 1", async () => {
    mockUser = { id: "user-1" };
    await GET(req("http://localhost/api/copilot/traces?limit=0"));
    expect(lastLimitCalledWith).toBe(1);
    await GET(req("http://localhost/api/copilot/traces?limit=-5"));
    expect(lastLimitCalledWith).toBe(1);
  });

  it("falls back to default limit (50) when ?limit is missing or non-numeric", async () => {
    mockUser = { id: "user-1" };
    await GET(req("http://localhost/api/copilot/traces"));
    expect(lastLimitCalledWith).toBe(50);
    await GET(req("http://localhost/api/copilot/traces?limit=abc"));
    expect(lastLimitCalledWith).toBe(50);
  });

  it("returns 503 when the supabase server client fails to init", async () => {
    mockClientThrows = true;
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(req());
    expect(res.status).toBe(503);
    consoleSpy.mockRestore();
  });

  it("returns 500 when the select itself errors", async () => {
    mockUser = { id: "user-1" };
    mockError = { message: "boom" };
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(req());
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/Failed to load traces/);
    consoleSpy.mockRestore();
  });
});
