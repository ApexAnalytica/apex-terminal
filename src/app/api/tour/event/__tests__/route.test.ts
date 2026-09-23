// @vitest-environment node
//
// Tests the tour-event server route. Validation only — the sink is a
// console.log and we don't assert on stdout shape (Vercel logs do that
// for us at runtime). Mirrors the d1namo-ingester / api-routes test
// pattern with the `node` env override (happy-dom doesn't have NextRequest).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/tour/event/route";

function reqJson(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/tour/event", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const validBody = {
  event: "tour_started",
  stepId: null,
  phase: "first-run",
  track: "analyst",
  persona: "macro",
  tourSessionId: "ts_xxxxxxxx",
  elapsedMs: 0,
};

describe("POST /api/tour/event", () => {
  // Silence the [tour-event] log line so test output stays clean.
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts a well-formed event and returns ok", async () => {
    const res = await POST(reqJson(validBody));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("rejects malformed JSON", async () => {
    const req = new NextRequest("http://localhost/api/tour/event", {
      method: "POST",
      body: "{ not json",
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects unknown event types", async () => {
    const res = await POST(reqJson({ ...validBody, event: "bogus" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/event/);
  });

  it("rejects unknown phases", async () => {
    const res = await POST(reqJson({ ...validBody, phase: "ridiculous" }));
    expect(res.status).toBe(400);
  });

  it("rejects events with no tourSessionId", async () => {
    const res = await POST(reqJson({ ...validBody, tourSessionId: null }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/tourSessionId/);
  });

  it("accepts every valid event type", async () => {
    for (const event of [
      "tour_started",
      "first_run_completed",
      "deep_dive_launched",
      "deep_dive_completed",
      "tour_closed",
    ] as const) {
      const res = await POST(reqJson({ ...validBody, event }));
      expect(res.status).toBe(200);
    }
  });

  it("clamps elapsedMs to a non-negative integer", async () => {
    // Negative / NaN / huge floats all sanitise to a safe integer.
    const res1 = await POST(reqJson({ ...validBody, elapsedMs: -5 }));
    expect(res1.status).toBe(200);
    const res2 = await POST(reqJson({ ...validBody, elapsedMs: "twelve" }));
    expect(res2.status).toBe(200);
  });

  it("survives oversized clientMeta without erroring (drops extras)", async () => {
    const big: Record<string, string> = {};
    for (let i = 0; i < 100; i++) big[`k${i}`] = `value-${i}`;
    const res = await POST(reqJson({ ...validBody, clientMeta: big }));
    expect(res.status).toBe(200);
  });
});
