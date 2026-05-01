// @vitest-environment node
// Tests Next.js server-side API routes which import Node built-ins (crypto).
// happy-dom externalizes those as browser stubs and the route module fails to
// load in Vercel's build env.
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/discovery/run/route";
import { GET } from "@/app/api/discovery/algorithms/route";
import type { Cohort } from "../cohort-types";

// ─── Helpers ──────────────────────────────────────────────────────────

function reqJson(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/discovery/run", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

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
    const res = await GET();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { algorithms: { id: string; version: string }[] };
    expect(Array.isArray(data.algorithms)).toBe(true);
    expect(data.algorithms.find((a) => a.id === "lag-correlation")).toBeDefined();
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
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
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
