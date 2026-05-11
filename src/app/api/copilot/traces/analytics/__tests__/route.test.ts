// @vitest-environment node
//
// Tests for GET /api/copilot/traces/analytics. Mocks the supabase
// server client at the module level. Validates:
//   - Anonymous → empty summary (200), never 401
//   - Authenticated → rows pass through summarize() and the
//     shape comes back as expected
//   - Limit clamps to safe bounds (1 ≤ limit ≤ 5000)
//   - Server-client init failures return 503
//   - Postgres errors return 500

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import type { AnalyticsSummary } from "@/lib/copilot/analytics";

// ─── Mock the supabase server client ───────────────────────────

let mockUser: { id: string } | null = null;
let mockRows: unknown[] = [];
let mockError: { message: string } | null = null;
let mockClientThrows = false;
let lastLimitCalledWith: number | undefined;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    if (mockClientThrows) throw new Error("supabase client init failed");
    return {
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
      from: () => {
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

// Import AFTER the mock.
const { GET } = await import("@/app/api/copilot/traces/analytics/route");

function req(url = "http://localhost/api/copilot/traces/analytics"): NextRequest {
  return new NextRequest(url, { method: "GET" });
}

beforeEach(() => {
  mockUser = null;
  mockRows = [];
  mockError = null;
  mockClientThrows = false;
  lastLimitCalledWith = undefined;
});

afterEach(() => vi.restoreAllMocks());

// ─── Tests ──────────────────────────────────────────────────────

describe("GET /api/copilot/traces/analytics", () => {
  it("returns an empty summary (200) for anonymous callers", async () => {
    mockUser = null;
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { summary: AnalyticsSummary };
    expect(body.summary.total_turns).toBe(0);
    expect(body.summary.by_tool).toEqual([]);
    expect(body.summary.by_model).toEqual([]);
  });

  it("aggregates rows through summarize() and returns the shape", async () => {
    mockUser = { id: "u1" };
    mockRows = [
      {
        created_at: "2026-05-09T10:00:00Z",
        conversation_id: "c1",
        tool_calls: [
          { name: "isolate_nodes", latency_ms: 12, error: null },
          { name: "explain_node", latency_ms: 30, error: null },
        ],
        model_provider: "gemini",
        model_id: "gemini-2.5-flash",
      },
      {
        created_at: "2026-05-09T10:01:00Z",
        conversation_id: "c1",
        tool_calls: [{ name: "isolate_nodes", latency_ms: 8, error: null }],
        model_provider: "gemini",
        model_id: "gemini-2.5-flash",
      },
    ];
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { summary: AnalyticsSummary };
    expect(body.summary.total_turns).toBe(2);
    expect(body.summary.total_tool_calls).toBe(3);
    expect(body.summary.distinct_conversations).toBe(1);
    expect(body.summary.by_tool[0].name).toBe("isolate_nodes");
    expect(body.summary.by_tool[0].count).toBe(2);
  });

  it("clamps a too-large limit to MAX_LIMIT (5000)", async () => {
    mockUser = { id: "u1" };
    await GET(req("http://localhost/api/copilot/traces/analytics?limit=99999"));
    expect(lastLimitCalledWith).toBe(5000);
  });

  it("clamps a non-positive limit to 1", async () => {
    mockUser = { id: "u1" };
    await GET(req("http://localhost/api/copilot/traces/analytics?limit=0"));
    expect(lastLimitCalledWith).toBe(1);
    await GET(req("http://localhost/api/copilot/traces/analytics?limit=-5"));
    expect(lastLimitCalledWith).toBe(1);
  });

  it("falls back to the default limit (1000) when ?limit is absent or non-numeric", async () => {
    mockUser = { id: "u1" };
    await GET(req());
    expect(lastLimitCalledWith).toBe(1000);
    await GET(req("http://localhost/api/copilot/traces/analytics?limit=abc"));
    expect(lastLimitCalledWith).toBe(1000);
  });

  it("returns 503 when the supabase server client fails to init", async () => {
    mockClientThrows = true;
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(req());
    expect(res.status).toBe(503);
    consoleSpy.mockRestore();
  });

  it("returns 500 when the select itself errors", async () => {
    mockUser = { id: "u1" };
    mockError = { message: "boom" };
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(req());
    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });
});
