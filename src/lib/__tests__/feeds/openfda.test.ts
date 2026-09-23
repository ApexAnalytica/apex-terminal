import { describe, it, expect } from "vitest";
import {
  OPENFDA_QUERIES,
  buildOpenFdaUrl,
  mockOpenFdaFeed,
  parseOpenFdaResponse,
} from "@/lib/feeds/openfda";
import { openFdaProvider } from "@/lib/feeds/providers/openfda";
import { makeNode } from "../fixtures/graph-fixtures";

describe("buildOpenFdaUrl", () => {
  it("builds an OpenFDA event URL with year-window receivedate filter", () => {
    const cfg = OPENFDA_QUERIES.find((q) => q.id === "tzield")!;
    const url = buildOpenFdaUrl(cfg);
    expect(url).toContain("api.fda.gov/drug/event.json");
    expect(url).toContain("TZIELD");
    expect(url).toContain("receivedate");
    expect(url).toContain("limit=1");
  });

  // Regression: a `+` in the Lucene search string form-encodes to `%2B`
  // on the wire, which the upstream parser sees as a literal `+`
  // character (not a space). Lucene then chokes on `+TO+` instead of
  // ` TO ` and returns HTTP 500. We use spaces; `URLSearchParams` form-
  // encodes them as `+` on the wire, which OpenFDA correctly decodes
  // back to spaces. This test pins the contract so a well-meaning
  // future edit ("let's use + to avoid spaces in URLs") doesn't break
  // the upstream parse.
  it("encodes Lucene operator separators as wire-`+` (form-space), not wire-`%2B`", () => {
    const cfg = OPENFDA_QUERIES.find((q) => q.id === "tzield")!;
    const url = buildOpenFdaUrl(cfg);
    // The receivedate range MUST contain `+TO+` on the wire (URL-form
    // for ` TO ` — server decodes back to spaces), NOT `%2BTO%2B`
    // (which would decode to literal `+TO+`, breaking the Lucene parse).
    // URLSearchParams also encodes `[` `]` and `:` so we match against
    // the percent-encoded form of the surrounding bracket range.
    expect(url).toMatch(/receivedate%3A%5B\d{8}\+TO\+\d{8}%5D/);
    // And it MUST NOT contain `%2BTO%2B` anywhere — that would be the
    // bug we're guarding against.
    expect(url).not.toContain("%2BTO%2B");
    // Same for AND between clauses.
    expect(url).toContain("+AND+");
    expect(url).not.toContain("%2BAND%2B");
  });

  it("TZIELD search uses OR not + between brand and generic name clauses", () => {
    const cfg = OPENFDA_QUERIES.find((q) => q.id === "tzield")!;
    // The Lucene operator MUST be `OR` (separated by spaces, encoded to
    // wire-`+`). `+` between two clauses inside parens means BOTH must
    // match in Lucene, which is the opposite of what we want for the
    // brand-OR-generic-name fallback.
    expect(cfg.search).toContain(" OR ");
    expect(cfg.search).not.toMatch(/"[\w+]+\+patient/);
  });
});

describe("parseOpenFdaResponse", () => {
  const cfg = OPENFDA_QUERIES.find((q) => q.id === "tzield")!;

  it("returns the meta.results.total as the value", () => {
    const obs = parseOpenFdaResponse({ meta: { results: { total: 47 } } }, cfg);
    expect(obs).not.toBeNull();
    expect(obs!.value).toBe(47);
    expect(obs!.unit).toBe("rpts");
    expect(obs!.source).toContain("FAERS");
  });

  it("returns null when total is missing or non-numeric", () => {
    expect(parseOpenFdaResponse({}, cfg)).toBeNull();
    expect(parseOpenFdaResponse({ meta: {} }, cfg)).toBeNull();
    expect(parseOpenFdaResponse({ meta: { results: {} } }, cfg)).toBeNull();
    expect(parseOpenFdaResponse({ meta: { results: { total: "x" } } }, cfg)).toBeNull();
  });
});

describe("mockOpenFdaFeed", () => {
  it("emits one observation per registered query, all tagged (mock)", () => {
    const feed = mockOpenFdaFeed();
    expect(feed.observations).toHaveLength(OPENFDA_QUERIES.length);
    for (const obs of feed.observations) {
      expect(obs.source).toContain("(mock");
    }
  });
});

describe("openFdaProvider.matchPayload", () => {
  it("attaches an indicator signal to T1D drug nodes whose label matches", () => {
    const nodes = [
      makeNode({ id: "tep", label: "Teplizumab (anti-CD3)" }),
      makeNode({ id: "neutral", label: "Some other asset" }),
    ];
    const feed = mockOpenFdaFeed();
    const batch = openFdaProvider.matchPayload(feed, nodes);

    expect(batch.providerId).toBe("openfda");
    expect(batch.signalKinds).toEqual(["indicator"]);
    const matchedIds = batch.updates.map((u) => u.nodeId);
    expect(matchedIds).toContain("tep");
    expect(matchedIds).not.toContain("neutral");
  });

  it("emits no event when no nodes match", () => {
    const feed = mockOpenFdaFeed();
    const batch = openFdaProvider.matchPayload(feed, [makeNode({ id: "x", label: "Generic" })]);
    expect(batch.updates).toHaveLength(0);
    expect(batch.event).toBeUndefined();
  });
});
