// @vitest-environment node
//
// Tests for GET /api/discovery/runs and GET /api/discovery/runs/[id].
// Uses the persistence layer's setServiceClientForTesting hook to swap
// in a fake Supabase client. Verifies:
//   - 503 when persistence unavailable (stub env)
//   - 200 + run on hit
//   - 404 on miss
//   - list endpoint with filters and limit validation

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as GET_BY_ID } from "@/app/api/discovery/runs/[id]/route";
import { GET as GET_LIST } from "@/app/api/discovery/runs/route";
import { setServiceClientForTesting } from "../persistence";

// ─── Helpers ──────────────────────────────────────────────────────────

function makeFakeRow(id = "run-X") {
  return {
    id,
    cohort_id: "c1",
    cohort_source_hash: "h",
    algorithm_id: "lag-correlation",
    algorithm_version: "0.1.0",
    params: {},
    started_at: "2026-05-02T00:00:00Z",
    completed_at: "2026-05-02T00:00:01Z",
    status: "succeeded" as const,
    error: null,
    result: { variables: ["x"], edges: [] },
  };
}

function makeFakeServiceClient(opts: {
  getResult?: { data: unknown; error: unknown };
  listResult?: { data: unknown[]; error: unknown };
} = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queryBuilder: any = {
    select() { return queryBuilder; },
    eq() { return queryBuilder; },
    order() { return queryBuilder; },
    limit() {
      return Promise.resolve(opts.listResult ?? { data: [], error: null });
    },
    maybeSingle() {
      return Promise.resolve(opts.getResult ?? { data: null, error: null });
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: vi.fn().mockReturnValue(queryBuilder) } as any;
}

beforeEach(() => setServiceClientForTesting(null));
afterEach(() => setServiceClientForTesting(null));

// ─── Tests ────────────────────────────────────────────────────────────

describe("GET /api/discovery/runs/[id]", () => {
  it("503 when persistence unavailable", async () => {
    const res = await GET_BY_ID(new Request("http://localhost/api/discovery/runs/x"), {
      params: Promise.resolve({ id: "x" }),
    });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/unavailable/);
  });

  it("200 + DiscoveryRun on hit", async () => {
    setServiceClientForTesting(
      makeFakeServiceClient({
        getResult: { data: makeFakeRow("run-Z"), error: null },
      }),
    );
    const res = await GET_BY_ID(new Request("http://localhost/api/discovery/runs/run-Z"), {
      params: Promise.resolve({ id: "run-Z" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; cohortId: string };
    expect(body.id).toBe("run-Z");
    expect(body.cohortId).toBe("c1");
  });

  it("404 on miss", async () => {
    setServiceClientForTesting(
      makeFakeServiceClient({
        getResult: { data: null, error: null },
      }),
    );
    const res = await GET_BY_ID(new Request("http://localhost/api/discovery/runs/nope"), {
      params: Promise.resolve({ id: "nope" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/discovery/runs", () => {
  it("503 when persistence unavailable", async () => {
    const res = await GET_LIST(new NextRequest("http://localhost/api/discovery/runs"));
    expect(res.status).toBe(503);
  });

  it("200 + empty list when no runs", async () => {
    setServiceClientForTesting(
      makeFakeServiceClient({ listResult: { data: [], error: null } }),
    );
    const res = await GET_LIST(new NextRequest("http://localhost/api/discovery/runs"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runs: unknown[]; count: number };
    expect(body.count).toBe(0);
    expect(body.runs).toEqual([]);
  });

  it("200 + mapped runs when populated", async () => {
    setServiceClientForTesting(
      makeFakeServiceClient({
        listResult: {
          data: [makeFakeRow("run-1"), makeFakeRow("run-2")],
          error: null,
        },
      }),
    );
    const res = await GET_LIST(new NextRequest("http://localhost/api/discovery/runs"));
    const body = (await res.json()) as {
      runs: { id: string; cohortId: string }[];
      count: number;
    };
    expect(body.count).toBe(2);
    expect(body.runs[0].id).toBe("run-1");
    expect(body.runs[1].id).toBe("run-2");
  });

  it("400 on invalid limit param", async () => {
    setServiceClientForTesting(
      makeFakeServiceClient({ listResult: { data: [], error: null } }),
    );
    const res = await GET_LIST(
      new NextRequest("http://localhost/api/discovery/runs?limit=999"),
    );
    expect(res.status).toBe(400);
  });

  it("accepts cohortId + algorithmId + limit query params", async () => {
    setServiceClientForTesting(
      makeFakeServiceClient({ listResult: { data: [], error: null } }),
    );
    const res = await GET_LIST(
      new NextRequest(
        "http://localhost/api/discovery/runs?cohortId=c1&algorithmId=pcmci-linear&limit=20",
      ),
    );
    expect(res.status).toBe(200);
  });
});
