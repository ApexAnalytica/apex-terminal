// @vitest-environment node
// Tests Next.js server-side API routes which import Node built-ins (crypto).
// happy-dom externalizes those as browser stubs and the route module fails to
// load in Vercel's build env.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/discovery/run/route";
import { GET } from "@/app/api/discovery/algorithms/route";
import {
  setAuthClientForTesting,
  generateApiKey,
  API_KEY_HEADER,
} from "../api-key-auth";
import type { Cohort } from "../cohort-types";

// ─── Helpers ──────────────────────────────────────────────────────────

// Auth fake: a Supabase client mock that accepts any valid-shape key
// as a known customer. Routes are gated by requireApiKey(req); tests
// inject this so the auth check passes without a real DB. See
// api-key-auth.test.ts for the standalone auth-module coverage.
function makeAcceptingAuthClient() {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: {
      id: "test-key-id",
      customer_id: "test-customer",
      key_prefix: "apx_live_TestPfx",
      scopes: ["discovery:read", "discovery:write"],
      revoked_at: null,
    },
    error: null,
  });
  const updateThenable = {
    then: (
      resolve: () => void,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _reject?: (e: unknown) => void,
    ) => {
      resolve();
      return { catch: () => {} };
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queryBuilder: any = {
    select: () => queryBuilder,
    eq: () => queryBuilder,
    maybeSingle,
    update: () => ({ eq: () => updateThenable }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: vi.fn().mockReturnValue(queryBuilder) } as any;
}

// One key generated for the whole file. The auth mock above returns
// the same fixed customer for any well-formed key, so the actual
// bytes don't matter as long as it passes the prefix-length check.
const TEST_KEY = generateApiKey().key;

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { [API_KEY_HEADER]: TEST_KEY, ...extra };
}

function reqJson(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/discovery/run", {
    method: "POST",
    body: JSON.stringify(body),
    headers: authHeaders({ "content-type": "application/json" }),
  });
}

beforeEach(() => {
  setAuthClientForTesting(makeAcceptingAuthClient());
});
afterEach(() => {
  setAuthClientForTesting(null);
});

function fixtureCohort(opts: {
  nSubjects: number;
  nSteps: number;
  trueLag: number;
  coupling: number;
  noise: number;
  seed: number;
}): Cohort {
  const { nSubjects, nSteps, trueLag, coupling, noise, seed } = opts;
  let state = seed >>> 0;
  const rand = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return ((state >>> 8) / 0xffffff) * 2 - 1;
  };
  const subjects = Array.from({ length: nSubjects }, (_, si) => {
    const x = new Array<number>(nSteps);
    const y = new Array<number>(nSteps);
    x[0] = rand();
    for (let i = 1; i < nSteps; i++) x[i] = 0.6 * x[i - 1] + 0.4 * rand();
    for (let i = 0; i < nSteps; i++) {
      const xLagged = i >= trueLag ? x[i - trueLag] : 0;
      y[i] = coupling * xLagged + noise * rand();
    }
    const measurements = [];
    for (let i = 0; i < nSteps; i++) {
      measurements.push({ variableId: "x", t: i * 300, value: x[i] });
      measurements.push({ variableId: "y", t: i * 300, value: y[i] });
    }
    return { id: `s-${si}`, measurements };
  });
  return {
    id: "api-test-cohort",
    label: "api test",
    source: {
      adapter: "test",
      adapterVersion: "0",
      ingestedAt: "2026-04-29T00:00:00Z",
      containsPHI: false,
    },
    variables: [
      { id: "x", label: "X", kind: "continuous", cadenceSeconds: 300 },
      { id: "y", label: "Y", kind: "continuous", cadenceSeconds: 300 },
    ],
    subjects,
    timeAxis: { zeroConvention: "session-start", displayUnit: "seconds" },
    metadata: { description: "test", accessTier: "public" },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("GET /api/discovery/algorithms", () => {
  it("returns the catalog with at least lag-correlation registered", async () => {
    const res = await GET(
      new Request("http://localhost/api/discovery/algorithms", {
        headers: authHeaders(),
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { algorithms: { id: string; version: string }[] };
    expect(Array.isArray(data.algorithms)).toBe(true);
    expect(data.algorithms.find((a) => a.id === "lag-correlation")).toBeDefined();
  });

  it("returns 401 when the API key header is missing", async () => {
    const res = await GET(
      new Request("http://localhost/api/discovery/algorithms"),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string; reason: string };
    expect(body.error).toBe("unauthorized");
    expect(body.reason).toBe("missing-header");
  });
});

describe("POST /api/discovery/run", () => {
  it("returns a DiscoveryRun on a valid coupled cohort", async () => {
    const cohort = fixtureCohort({
      nSubjects: 4,
      nSteps: 200,
      trueLag: 2,
      coupling: 0.7,
      noise: 0.4,
      seed: 17,
    });
    const res = await POST(
      reqJson({ cohort, algorithm: { id: "lag-correlation" } }),
    );
    expect(res.status).toBe(200);
    const run = (await res.json()) as {
      id: string;
      status: string;
      algorithm: { id: string; version: string };
      cohortId: string;
      result: { edges: { source: string; target: string; lag?: number }[] };
    };
    expect(run.status).toBe("succeeded");
    expect(run.algorithm.id).toBe("lag-correlation");
    expect(run.cohortId).toBe("api-test-cohort");
    // Recovers the true x → y edge.
    const xToY = run.result.edges.find(
      (e) => e.source === "x" && e.target === "y",
    );
    expect(xToY).toBeDefined();
  });

  it("rejects bodies whose cohort.source.containsPHI is not literal false", async () => {
    const cohort = fixtureCohort({
      nSubjects: 4,
      nSteps: 100,
      trueLag: 1,
      coupling: 0.5,
      noise: 0.4,
      seed: 1,
    });
    const tampered = {
      ...cohort,
      source: { ...cohort.source, containsPHI: true as unknown as false },
    };
    const res = await POST(
      reqJson({ cohort: tampered, algorithm: { id: "lag-correlation" } }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/containsPHI/);
  });

  it("returns 404 with hint for unknown algorithm id", async () => {
    const cohort = fixtureCohort({
      nSubjects: 2,
      nSteps: 60,
      trueLag: 1,
      coupling: 0.5,
      noise: 0.4,
      seed: 2,
    });
    const res = await POST(
      reqJson({ cohort, algorithm: { id: "bogus-algorithm" } }),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string; hint: string };
    expect(body.error).toMatch(/unknown algorithm/);
    expect(body.hint).toMatch(/algorithms/);
  });

  it("returns 400 for malformed JSON body", async () => {
    const req = new NextRequest("http://localhost/api/discovery/run", {
      method: "POST",
      body: "{ not json",
      headers: authHeaders({ "content-type": "application/json" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 401 when the API key header is missing on POST /run", async () => {
    const req = new NextRequest("http://localhost/api/discovery/run", {
      method: "POST",
      body: JSON.stringify({ algorithm: { id: "lag-correlation" } }),
      headers: { "content-type": "application/json" }, // intentional: no API key
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when algorithm.id is missing", async () => {
    const res = await POST(
      reqJson({ cohort: {}, algorithm: { params: {} } }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/algorithm\.id/);
  });

  it("honours algorithm param overrides", async () => {
    const cohort = fixtureCohort({
      nSubjects: 3,
      nSteps: 200,
      trueLag: 2,
      coupling: 0.6,
      noise: 0.4,
      seed: 9,
    });
    const res = await POST(
      reqJson({
        cohort,
        algorithm: {
          id: "lag-correlation",
          params: { alpha: 0.001, minAbsR: 0.5 }, // very strict
        },
      }),
    );
    expect(res.status).toBe(200);
    const run = (await res.json()) as {
      params: Record<string, unknown>;
      result: { edges: unknown[] };
    };
    expect(run.params.alpha).toBe(0.001);
    expect(run.params.minAbsR).toBe(0.5);
  });
});
