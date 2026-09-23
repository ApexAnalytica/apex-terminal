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
    // t1d (6) + vx880 (4) + geo_energy (10) + ai_safety (7) = 27; un-audited
    // domains resolve to an empty catalog.
    expect(allEdgeProvenanceEntries().length).toBe(27);
    expect(getEdgeProvenanceCatalog("finance")).toEqual([]);
  });
});

describe("live registry — vx880 audit", () => {
  // The four vx880-OWNED entries. The vx880 graph additionally reuses two
  // t1d-domain ids cross-domain (reichman-nejm-2025, vigersky-2019) — those
  // are asserted by the cross-domain reuse test below, not counted here.
  const VX880_IDS = [
    "shapiro-edmonton-2000",
    "hering-cit07-2016",
    "ryan-2005",
    "hla-dr-islet-2023",
  ];

  it("exposes the audited vx880 catalog as 4 cited literature entries", () => {
    const catalog = getEdgeProvenanceCatalog("vx880");
    expect(catalog.length).toBe(4);
    expect(catalog.map((e) => e.id).sort()).toEqual([...VX880_IDS].sort());
    for (const entry of catalog) {
      expect(entry.domain).toBe("vx880");
      expect(entry.kind).toBe("literature");
      expect(entry.citation).toBeTruthy();
    }
  });

  it("resolves each audited vx880 id to its entry", () => {
    for (const id of VX880_IDS) {
      expect(getEdgeProvenanceEntry(id)?.id).toBe(id);
    }
  });

  it("the vx880 graph reuses t1d-domain entries cross-domain by global id", () => {
    // The registry's headline feature: an edge in one domain references a
    // citation authored in another. These two ids live under domain "t1d" yet
    // are tagged on vx880 edges (e6 → reichman, e19 → vigersky).
    for (const id of ["reichman-nejm-2025", "vigersky-2019"]) {
      expect(getEdgeProvenanceEntry(id)?.domain).toBe("t1d");
    }
    const vx880Refs = new Set(
      VX880_GRAPH.edges
        .flatMap((e) => [e.weightSourceRef, e.confidenceSourceRef])
        .filter((r): r is string => Boolean(r)),
    );
    expect(vx880Refs.has("reichman-nejm-2025")).toBe(true);
    expect(vx880Refs.has("vigersky-2019")).toBe(true);
  });
});

describe("live registry — geo_energy audit", () => {
  // The geopolitical-energy → US-macro pass-through leg: six `regression`
  // entries whose weight IS an empirically fitted long-run multiplier
  // (research/macro/output/*.json), two EIA chokepoint `literature` facts that
  // ground source-share / confidence, and two academic `literature` anchors
  // for the DXY channels that were too noisy to identify on the synthetic proxy.
  const GEO_REGRESSION_IDS = [
    "imf-fuel-energy-ardl",
    "imf-wheat-food-ardl",
    "imf-industrial-inputs-allcommodity-ardl",
    "imf-ironore-industrial-inputs-ardl",
    "dxy-allcommodity-ardl",
    "dxy-em-fx-ardl",
  ];
  const GEO_LITERATURE_IDS = [
    "eia-hormuz-chokepoint",
    "eia-abqaiq-2019",
    "dxy-real-rate-literature",
    "em-dollar-funding-literature",
  ];

  it("exposes the audited geo_energy catalog as 6 regression + 4 literature entries", () => {
    const catalog = getEdgeProvenanceCatalog("geo_energy");
    expect(catalog.length).toBe(10);
    expect(catalog.map((e) => e.id).sort()).toEqual(
      [...GEO_REGRESSION_IDS, ...GEO_LITERATURE_IDS].sort(),
    );
    for (const entry of catalog) {
      expect(entry.domain).toBe("geo_energy");
      expect(entry.citation).toBeTruthy();
    }
  });

  it("kinds split correctly: the empirical channels are regression, the anchors are literature", () => {
    for (const id of GEO_REGRESSION_IDS) {
      expect(getEdgeProvenanceEntry(id)?.kind).toBe("regression");
    }
    for (const id of GEO_LITERATURE_IDS) {
      expect(getEdgeProvenanceEntry(id)?.kind).toBe("literature");
    }
  });

  it("the synthetic-DXY caveat is carried in every DXY-driven entry's note", () => {
    // Honesty constraint: no synthetic input may ship unlabelled. Each DXY
    // channel must flag that the driver is a reconstructed basket proxy.
    for (const id of ["dxy-allcommodity-ardl", "dxy-em-fx-ardl"]) {
      expect(getEdgeProvenanceEntry(id)?.note?.toLowerCase()).toContain(
        "synthetic",
      );
    }
  });
});

describe("live registry — ai_safety audit", () => {
  // The AI-safety / IDS continual-learning leg (Ghauri 2025 D.Eng., Ch 5-8).
  // Two honestly-distinct grounding tiers: three dataset→attack entries cite
  // PUBLIC, web-verifiable IDS benchmarks (CICIDS-2017, UNSW-NB15, AWID3); four
  // `ghauri-*` entries cite the dissertation's own architecture (NOT
  // independently web-verifiable) and point at the in-repo implementation.
  const AI_DATASET_IDS = [
    "cicids-2017-dataset",
    "unsw-nb15-dataset",
    "awid3-dataset",
  ];
  const AI_DISSERTATION_IDS = [
    "ghauri-gat-continual-ids",
    "ghauri-bes-leading-indicator",
    "ghauri-bes-replay-selection",
    "ghauri-replay-forgetting-reduction",
  ];

  it("exposes the audited ai_safety catalog as 3 dataset + 4 dissertation entries", () => {
    const catalog = getEdgeProvenanceCatalog("ai_safety");
    expect(catalog.length).toBe(7);
    expect(catalog.map((e) => e.id).sort()).toEqual(
      [...AI_DATASET_IDS, ...AI_DISSERTATION_IDS].sort(),
    );
    for (const entry of catalog) {
      expect(entry.domain).toBe("ai_safety");
      expect(entry.citation).toBeTruthy();
    }
  });

  it("public IDS datasets are literature; the one quantitative dissertation result is regression", () => {
    for (const id of AI_DATASET_IDS) {
      expect(getEdgeProvenanceEntry(id)?.kind).toBe("literature");
    }
    // Three dissertation entries assert a relationship (literature); only the
    // migrated PR #391 replay→GAT seed is a quantitative fit (regression).
    expect(getEdgeProvenanceEntry("ghauri-gat-continual-ids")?.kind).toBe(
      "literature",
    );
    expect(getEdgeProvenanceEntry("ghauri-bes-leading-indicator")?.kind).toBe(
      "literature",
    );
    expect(getEdgeProvenanceEntry("ghauri-bes-replay-selection")?.kind).toBe(
      "literature",
    );
    const forgetting = getEdgeProvenanceEntry(
      "ghauri-replay-forgetting-reduction",
    );
    expect(forgetting?.kind).toBe("regression");
    expect(forgetting?.rSquared).toBe(0.51);
  });

  it("every dissertation entry carries the 'not independently web-verified' honesty caveat", () => {
    // Honesty constraint: the Ghauri D.Eng. dissertation is a single-author
    // source we cannot web-verify, so each note must flag that AND point at the
    // in-repo implementation (src/lib/discovery/*) as the checkable grounding.
    for (const id of AI_DISSERTATION_IDS) {
      const note = getEdgeProvenanceEntry(id)?.note?.toLowerCase();
      expect(note).toContain("not independently web-verified");
      expect(note).toContain("src/lib/discovery");
    }
  });

  it("the AWID3 entry flags that the node's 'H23Q' label is not a published benchmark", () => {
    // The graph node is named ais_awid_h23q, but the citable public dataset is
    // AWID3; H23Q is the dissertation's working subset name, not a benchmark.
    expect(
      getEdgeProvenanceEntry("awid3-dataset")?.note?.toLowerCase(),
    ).toContain("not a published benchmark");
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

  it("the vx880 audit tagged real edges (guard is non-vacuous)", () => {
    // The vx880 audit tagged 5 edges, each carrying both a weight + confidence
    // ref → 10 ref slots. Note e11 deliberately splits the two across separate
    // sources (weight ← shapiro-edmonton-2000, confidence ← hering-cit07-2016).
    const vx880Refs = VX880_GRAPH.edges
      .flatMap((e) => [e.weightSourceRef, e.confidenceSourceRef])
      .filter((r): r is string => Boolean(r));
    expect(vx880Refs.length).toBe(10);
    expect(validateEdgeProvenanceRefs(vx880Refs)).toEqual([]);
  });

  it("the geo_energy audit tagged real MAIN_GRAPH edges (guard is non-vacuous)", () => {
    // The geo-energy audit tagged 16 main-graph edges (P1 energy ×5, P2 food
    // ×4, P4 sovereign ×3, DXY loop ×4), each carrying both a weight +
    // confidence ref → 32 ref slots. The Abqaiq/Hormuz P1 edges and both DXY→EM
    // edges deliberately split weight (the empirical channel fit) from
    // confidence (an EIA chokepoint fact / dollar-funding literature anchor).
    // Scoped to geo_energy-resolved refs so the ai_safety leg (also tagged in
    // MAIN_GRAPH) doesn't inflate the counts.
    const geoEdges = MAIN_GRAPH.edges.filter(
      (e) =>
        e.weightSourceRef &&
        getEdgeProvenanceEntry(e.weightSourceRef)?.domain === "geo_energy",
    );
    const geoRefs = geoEdges
      .flatMap((e) => [e.weightSourceRef, e.confidenceSourceRef])
      .filter((r): r is string => Boolean(r));
    expect(geoRefs.length).toBe(32);
    expect(validateEdgeProvenanceRefs(geoRefs)).toEqual([]);
    // The split-axis edges actually use distinct weight vs confidence sources.
    const splitAxisCount = geoEdges.filter(
      (e) =>
        e.weightSourceRef &&
        e.confidenceSourceRef &&
        e.weightSourceRef !== e.confidenceSourceRef,
    ).length;
    expect(splitAxisCount).toBe(4);
  });

  it("the ai_safety audit tagged real MAIN_GRAPH edges (guard is non-vacuous)", () => {
    // The AI-safety leg tagged 18 main-graph pipeline edges (9 dataset→attack,
    // 3 dataset→GAT, scheduler→GAT, GAT→attention, attention→buffer, buffer→GAT,
    // GAT→eval, eval→buffer), each carrying both a weight + confidence ref → 36
    // ref slots. The 3 dataset→GAT edges and the eval→buffer loop split weight
    // (dissertation architecture / selection rule) from confidence (the
    // web-verifiable corpus / the forgetting-reduction result) → 4 split-axis.
    // The 3 cross-domain cascade bridges (ddos→telecom, ddos→latency,
    // mitm→banking) are left UNTAGGED — no verifiable cascade-magnitude source.
    const aiEdges = MAIN_GRAPH.edges.filter(
      (e) =>
        e.weightSourceRef &&
        getEdgeProvenanceEntry(e.weightSourceRef)?.domain === "ai_safety",
    );
    const aiRefs = aiEdges
      .flatMap((e) => [e.weightSourceRef, e.confidenceSourceRef])
      .filter((r): r is string => Boolean(r));
    expect(aiRefs.length).toBe(36);
    expect(validateEdgeProvenanceRefs(aiRefs)).toEqual([]);
    const splitAxisCount = aiEdges.filter(
      (e) =>
        e.weightSourceRef &&
        e.confidenceSourceRef &&
        e.weightSourceRef !== e.confidenceSourceRef,
    ).length;
    expect(splitAxisCount).toBe(4);
  });

  it("the two PR #391 inline seeds were migrated to registry refs (no inline source survives)", () => {
    // attention→buffer and buffer→GAT used to carry inline weightSource objects;
    // the audit replaced them with registry refs (verbatim claims). Assert the
    // inline source is gone and the regression seed's rSquared survived intact.
    const seedEdges = MAIN_GRAPH.edges.filter((e) =>
      [
        "ais_attention_layer__ais_replay_buffer",
        "ais_replay_buffer__ais_gat",
      ].includes(e.id),
    );
    expect(seedEdges.length).toBe(2);
    for (const e of seedEdges) {
      expect(e.weightSource).toBeUndefined();
      expect(e.confidenceSource).toBeUndefined();
      expect(e.weightSourceRef).toBeTruthy();
    }
    const buffer2gat = seedEdges.find(
      (e) => e.id === "ais_replay_buffer__ais_gat",
    )!;
    expect(getEdgeProvenanceEntry(buffer2gat.weightSourceRef!)?.rSquared).toBe(
      0.51,
    );
  });
});
