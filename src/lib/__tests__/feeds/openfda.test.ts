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
