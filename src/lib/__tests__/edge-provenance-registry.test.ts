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

// Real graph datasets — used by the guard test that asserts every edge ref in
// shipped data resolves. The t1d audit has tagged 8 edges with real refs, so
// this is now a live typo-guard (and asserted non-vacuous below).
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

// ─── Live registry accessors (t1d audited; other domains pending) ──────

describe("live registry — t1d audit", () => {
  const T1D_IDS = [
    "dcct-1993",
    "edic-legacy",
    "herold-nejm-2019",
    "perdigoto-stm-2021",
    "reichman-nejm-2025",
    "vigersky-2019",
  ];

  it("exposes the audited t1d catalog as 6 cited literature entries", () => {
    const catalog = getEdgeProvenanceCatalog("t1d");
    expect(catalog.length).toBe(6);
    expect(catalog.map((e) => e.id).sort()).toEqual([...T1D_IDS].sort());
    for (const entry of catalog) {
      expect(entry.domain).toBe("t1d");
      expect(entry.kind).toBe("literature");
      expect(entry.citation).toBeTruthy();
    }
  });

  it("resolves each audited id to its entry; unknown ids stay undefined", () => {
    for (const id of T1D_IDS) {
      expect(getEdgeProvenanceEntry(id)?.id).toBe(id);
    }
    expect(getEdgeProvenanceEntry("does-not-exist")).toBeUndefined();
  });

  it("only the audited domains populate the live index", () => {
    // allEdgeProvenanceEntries flattens every populated domain. Today that's
    // t1d only; un-audited domains resolve to an empty catalog.
    expect(allEdgeProvenanceEntries().length).toBe(6);
    expect(getEdgeProvenanceCatalog("geopolitical")).toEqual([]);
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
    // No ref in shipped data may dangle — a typo'd ref fails here.
    expect(validateEdgeProvenanceRefs(refs)).toEqual([]);
  });

  it("the t1d audit tagged real edges (guard is non-vacuous)", () => {
    // The integrity test above is only meaningful if real refs exist. The
    // t1d audit tagged 8 edges, each carrying both a weight + confidence ref.
    const t1dRefs = T1D_GRAPH.edges
      .flatMap((e) => [e.weightSourceRef, e.confidenceSourceRef])
      .filter((r): r is string => Boolean(r));
    expect(t1dRefs.length).toBe(16);
    expect(validateEdgeProvenanceRefs(t1dRefs)).toEqual([]);
  });
});
