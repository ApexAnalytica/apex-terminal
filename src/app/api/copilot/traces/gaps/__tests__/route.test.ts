// @vitest-environment node
//
// Tests for GET /api/copilot/traces/gaps. Mocks the supabase server
// client at the module level. Validates anonymous → empty report,
// authenticated → rows pass through analyzeCapabilityGaps(), limit
// clamping, and the 503 / 500 error paths.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import type { CapabilityGapReport } from "@/lib/copilot/capability-gaps";

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

const { GET } = await import("@/app/api/copilot/traces/gaps/route");

function req(url = "http://localhost/api/copilot/traces/gaps"): NextRequest {
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

describe("GET /api/copilot/traces/gaps", () => {
  it("returns an empty report (200) for anonymous callers", async () => {
    mockUser = null;
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { report: CapabilityGapReport };
    expect(body.report.total_turns).toBe(0);
    expect(body.report.explicit_refusals).toEqual([]);
    expect(body.report.suspected_gaps).toEqual([]);
  });

  it("runs rows through analyzeCapabilityGaps() and returns the shape", async () => {
    mockUser = { id: "u1" };
    mockRows = [
      {
        created_at: "2026-06-04T10:00:00Z",
        conversation_id: "c1",
        user_message: "export the graph as a PDF",
        display_text: "I can't do that yet — no control wired into me for that.",
        tool_calls: [],
      },
      {
        created_at: "2026-06-04T10:01:00Z",
        conversation_id: "c1",
        user_message: "hide the trade edges",
        display_text: "Here's some prose instead.",
        tool_calls: [],
      },
      {
        created_at: "2026-06-04T10:02:00Z",
        conversation_id: "c1",
        user_message: "switch to pearl",
        display_text: "done",
        tool_calls: [{ name: "set_module" }],
      },
    ];
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { report: CapabilityGapReport };
    expect(body.report.total_turns).toBe(3);
    expect(body.report.turns_with_tools).toBe(1);
    expect(body.report.explicit_refusal_count).toBe(1);
    expect(body.report.suspected_gap_count).toBe(1);
  });

  it("clamps a too-large limit to MAX_LIMIT (5000)", async () => {
    mockUser = { id: "u1" };
    await GET(req("http://localhost/api/copilot/traces/gaps?limit=99999"));
    expect(lastLimitCalledWith).toBe(5000);
  });

  it("falls back to the default limit (1000) when ?limit is absent", async () => {
    mockUser = { id: "u1" };
    await GET(req());
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
