import { describe, it, expect } from "vitest";
import {
  buildProvenanceIndex,
  resolveEdgeSourceWith,
  validateEdgeProvenanceRefs,
  getEdgeProvenanceEntry,
  getEdgeProvenanceCatalog,
  allEdgeProvenanceEntries,
  type EdgeProvenanceEntry,
} from "../edge-provenance-registry";
import { DEFAULT_AUTHOR_SOURCE } from "../edge-provenance";
import type { EdgeAttributeSource } from "../types";

// Real graph datasets — used by the forward-looking guard test that asserts
// every edge ref in shipped data resolves. Trivially passes today (no edge
// carries a ref yet) and becomes a real typo-guard once the audit lands.
import { MAIN_GRAPH } from "../graph-data";
import { ATHENA_GRAPH, BRIDGE_EDGES } from "../athena-graph-data";
import { T1D_GRAPH } from "../t1d-graph-data";
import { VX880_GRAPH } from "../t1d-vx880-graph-data";

// ─── Fixtures ─────────────────────────────────────────────────────────

const FIXTURE: Record<string, EdgeProvenanceEntry[]> = {
  t1d: [
    {
      id: "fixture-dcct",
      domain: "t1d",
      kind: "literature",
      citation: "Fixture DCCT citation",
      note: "test entry",
    },
  ],
  geopolitical: [
    {
      id: "fixture-eia",
      domain: "geopolitical",
      kind: "literature",
      citation: "Fixture EIA citation",
    },
  ],
};

// ─── buildProvenanceIndex ───────────────────────────────────────────────

describe("buildProvenanceIndex", () => {
  it("flattens a multi-domain catalog into an id-keyed index", () => {
    const index = buildProvenanceIndex(FIXTURE);
    expect(index.size).toBe(2);
    expect(index.get("fixture-dcct")?.domain).toBe("t1d");
    expect(index.get("fixture-eia")?.domain).toBe("geopolitical");
  });

  it("throws on a duplicate id across domains", () => {
    const dup: Record<string, EdgeProvenanceEntry[]> = {
      a: [{ id: "collide", domain: "a", kind: "literature" }],
      b: [{ id: "collide", domain: "b", kind: "regression" }],
    };
    expect(() => buildProvenanceIndex(dup)).toThrow(/Duplicate edge-provenance id "collide"/);
  });

  it("handles an empty catalog", () => {
    const index = buildProvenanceIndex({});
    expect(index.size).toBe(0);
  });
});

// ─── resolveEdgeSourceWith (precedence) ─────────────────────────────────

describe("resolveEdgeSourceWith", () => {
  const index = buildProvenanceIndex(FIXTURE);

  it("returns the inline source when present (inline wins over ref)", () => {
    const inline: EdgeAttributeSource = {
      kind: "regression",
      rSquared: 0.82,
    };
    const out = resolveEdgeSourceWith(index, inline, "fixture-dcct");
    expect(out).toBe(inline);
    expect(out.kind).toBe("regression");
  });

  it("expands a registry ref when no inline source is given", () => {
    const out = resolveEdgeSourceWith(index, undefined, "fixture-dcct");
    expect(out.kind).toBe("literature");
    expect(out.citation).toBe("Fixture DCCT citation");
  });

  it("strips the registry bookkeeping fields from the resolved source", () => {
    const out = resolveEdgeSourceWith(index, undefined, "fixture-dcct");
    expect("id" in out).toBe(false);
    expect("domain" in out).toBe(false);
  });

  it("falls back to author for an unresolved ref (no throw)", () => {
    const out = resolveEdgeSourceWith(index, undefined, "does-not-exist");
    expect(out).toBe(DEFAULT_AUTHOR_SOURCE);
    expect(out.kind).toBe("author");
  });

  it("falls back to author when neither inline nor ref is given", () => {
    const out = resolveEdgeSourceWith(index, undefined, undefined);
    expect(out.kind).toBe("author");
  });
});

// ─── validateEdgeProvenanceRefs ─────────────────────────────────────────

describe("validateEdgeProvenanceRefs", () => {
  const index = buildProvenanceIndex(FIXTURE);

  it("returns [] when every ref resolves", () => {
    const missing = validateEdgeProvenanceRefs(
      ["fixture-dcct", "fixture-eia", undefined],
      index,
    );
    expect(missing).toEqual([]);
  });

  it("returns the unresolved refs only", () => {
    const missing = validateEdgeProvenanceRefs(
      ["fixture-dcct", "typo-ref", undefined, "another-typo"],
      index,
    );
    expect(missing).toEqual(["typo-ref", "another-typo"]);
  });
});

// ─── Live registry accessors (catalog is empty until the audit) ─────────

describe("live registry", () => {
  it("is empty in the mechanism PR — undefined lookups, empty lists", () => {
    expect(getEdgeProvenanceEntry("anything")).toBeUndefined();
    expect(getEdgeProvenanceCatalog("t1d")).toEqual([]);
    expect(allEdgeProvenanceEntries()).toEqual([]);
  });
});

// ─── Forward-looking guard over real shipped graph data ─────────────────

describe("real graph data ref integrity", () => {
  it("every edge weight/confidence ref in shipped data resolves", () => {
    const allEdges = [
      ...MAIN_GRAPH.edges,
      ...ATHENA_GRAPH.edges,
      ...BRIDGE_EDGES,
      ...T1D_GRAPH.edges,
      ...VX880_GRAPH.edges,
    ];
    const refs = allEdges.flatMap((e) => [
      e.weightSourceRef,
      e.confidenceSourceRef,
    ]);
    // Passes trivially today (no edge carries a ref). Becomes a real guard
    // as the per-domain audit tags edges — a typo'd ref fails here.
    expect(validateEdgeProvenanceRefs(refs)).toEqual([]);
  });
});
