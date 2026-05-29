/**
 * Edge-provenance registry — a per-domain catalog of reusable, named
 * `EdgeAttributeSource` entries.
 *
 * Before this module, the only way to attach provenance to an edge was to
 * type an inline `EdgeAttributeSource` object on `edge.weightSource` /
 * `edge.confidenceSource` in the domain graph-data files. That works, but
 * the per-domain audit (T1D → DCCT/NEJM, geopolitical-energy → IEA/EIA)
 * would re-type the same citation across dozens of edges — no single source
 * of truth, and a typo in one copy silently diverges from the others.
 *
 * The registry fixes that: a citation is authored ONCE as a catalog entry
 * with a stable `id`, and edges reference it via `weightSourceRef` /
 * `confidenceSourceRef`. The resolver expands the ref at read time.
 *
 * Resolution precedence (see `resolveEdgeSource`):
 *   1. inline `weightSource` object        — author override, wins
 *   2. `weightSourceRef` → catalog entry   — the registry path
 *   3. `{kind:"author"}` backfill          — nothing recorded
 *
 * The mechanism shipped with an EMPTY catalog; the per-domain audit
 * populates `CATALOGS` (and tags edges with refs) domain by domain — no
 * change to this module's logic is required for that, only data. The `t1d`
 * domain is the first audited (DCCT/EDIC, TrialNet TN-10, FORWARD-101,
 * TIR↔HbA1c consensus); every entry is a real, verifiable publication, all
 * DOIs cross-checked against the repo's own vetted source-of-truth in
 * research/scripts/build_t1d_timeseries.py. Other domains (geopolitical
 * energy, AI-safety, the VX-880 companion graph) land in later passes.
 *
 * Honesty note: a `literature` entry asserts that the *relationship* (sign +
 * approximate magnitude) of an edge is grounded in the cited source. The
 * exact edge `weight`/`confidence` scalar remains an author calibration onto
 * the network's [-1,1] / [0,1] scale — each entry's `note` says so plainly,
 * so the inspector never implies a number was lifted verbatim from a paper.
 *
 * Convention matches `criticality-registry.ts` (static const dict + pure
 * accessors) rather than a runtime `register()` call, so the full catalog is
 * statically analysable and tree-shakes predictably.
 */

import type { EdgeAttributeSource } from "@/lib/types";
import { DEFAULT_AUTHOR_SOURCE } from "@/lib/edge-provenance";

/**
 * A catalog entry: an `EdgeAttributeSource` plus the registry bookkeeping
 * fields (`id`, `domain`). The extra fields are stripped before the source
 * is handed to the display layer so `id`/`domain` never leak into the UI.
 */
export interface EdgeProvenanceEntry extends EdgeAttributeSource {
  /** Stable id referenced from CausalEdge.weightSourceRef / confidenceSourceRef. */
  id: string;
  /**
   * Owning domain (e.g. "t1d", "geopolitical", "finance"). Organizational
   * only — resolution is by global `id`, so a ref doesn't need to know which
   * domain it came from. Use "shared" for cross-domain sources.
   */
  domain: string;
}

/**
 * The catalog, grouped by domain for authoring clarity. Populated one domain
 * at a time by the per-domain provenance audit. `t1d` is the first audited
 * domain; see the module header for the honesty convention on `literature`
 * entries (relationship grounded in source; scalar is author calibration).
 */
const CATALOGS: Record<string, EdgeProvenanceEntry[]> = {
  t1d: [
    {
      // DCCT — the landmark T1D glycemic-control RCT. Grounds the
      // glycemia → microvascular-complication edges (retinopathy + nephropathy).
      id: "dcct-1993",
      domain: "t1d",
      kind: "literature",
      citation:
        "DCCT Research Group. N Engl J Med 1993;329:977-986. doi:10.1056/NEJM199309303291401",
      note:
        "Landmark RCT (n=1,441): intensive glycemic control cut retinopathy ~76% and " +
        "early nephropathy (albuminuria) ~50% vs conventional therapy. Grounds the sign " +
        "and approximate magnitude of the glycemic-control → complication edges; the edge " +
        "weight itself is an author calibration to the [-1,1] scale.",
    },
    {
      // EDIC — the observational follow-up of the DCCT cohort that established
      // the durable "metabolic memory" / legacy effect. Grounds the long-lagged
      // HbA1c → complication temporal edges (lag measured in years).
      id: "edic-legacy",
      domain: "t1d",
      kind: "literature",
      citation:
        "DCCT/EDIC Research Group; Nathan DM et al. N Engl J Med 2005;353:2643-2653. doi:10.1056/NEJMoa052187",
      note:
        "EDIC follow-up of the DCCT cohort — the 'metabolic memory'/legacy effect: early " +
        "glycemic control determines complication risk decades later. Grounds the multi-year " +
        "lagged HbA1c → complication edges; lag and direction are literature-derived, weight is calibrated.",
    },
    {
      // TrialNet TN-10 — teplizumab onset-delay RCT. Grounds the
      // teplizumab → C-peptide preservation edge.
      id: "herold-nejm-2019",
      domain: "t1d",
      kind: "literature",
      citation:
        "Herold KC et al. N Engl J Med 2019;381:603-613. doi:10.1056/NEJMoa1902226",
      note:
        "TrialNet TN-10: a single 14-day teplizumab course delayed Stage-3 T1D onset by a " +
        "median ~2 years vs placebo, with preserved C-peptide. Grounds the teplizumab → " +
        "C-peptide edge.",
    },
    {
      // TN-10 immunological follow-up — anti-CD3 mechanism on islet-reactive
      // CD8+ effectors. Grounds the teplizumab → CD8-Teff edge.
      id: "perdigoto-stm-2021",
      domain: "t1d",
      kind: "literature",
      citation:
        "Perdigoto AL et al. Sci Transl Med 2021. doi:10.1126/scitranslmed.abc8980",
      note:
        "TN-10 immunological follow-up: anti-CD3 drives partial exhaustion/anergy of " +
        "islet-reactive CD8+ T effectors — the mechanism behind the teplizumab → CD8-Teff edge.",
    },
    {
      // Vertex FORWARD-101 (zimislecel/VX-880) — stem-cell-derived islet
      // engraftment. Grounds the SC-β → β-mass restoration edge (low confidence:
      // early phase, n=12).
      id: "reichman-nejm-2025",
      domain: "t1d",
      kind: "literature",
      citation:
        "Reichman et al. N Engl J Med 2025. doi:10.1056/NEJMoa2506549",
      note:
        "Vertex FORWARD-101 (zimislecel, full-dose cohort n=12): stem-cell-derived islet " +
        "engraftment restored endogenous insulin, with 83% insulin-independent at 1 year. " +
        "Early-phase, small n — hence the edge's deliberately low confidence.",
    },
    {
      // TIR↔HbA1c published relationship + international consensus. Grounds the
      // real-world-TIR → population-HbA1c edge (near-mathematical coupling →
      // high confidence).
      id: "vigersky-2019",
      domain: "t1d",
      kind: "literature",
      citation:
        "Vigersky RA, McMahon C. Diabetes Technol Ther 2019;21(2):81-85. doi:10.1089/dia.2018.0310; " +
        "consensus: Battelino T et al. Diabetes Care 2019;42(8):1593-1603. doi:10.2337/dci19-0028",
      note:
        "Published TIR↔HbA1c relationship — a near-mathematical coupling via time-averaged " +
        "glucose. Grounds the high confidence on the real-world-TIR → population-HbA1c edge.",
    },
  ],
};

/**
 * Build an id → entry index from a catalog map. Pure — separated from the
 * live index so tests can exercise it with fixtures.
 *
 * Throws on a duplicate id across the whole catalog: ids are the global
 * resolution key, so a collision would make resolution order-dependent and
 * silently shadow one citation with another. Better to fail loudly at module
 * load (and in the audit author's test run) than to mis-attribute an edge.
 */
export function buildProvenanceIndex(
  catalogs: Record<string, EdgeProvenanceEntry[]>,
): Map<string, EdgeProvenanceEntry> {
  const index = new Map<string, EdgeProvenanceEntry>();
  for (const [domain, entries] of Object.entries(catalogs)) {
    for (const entry of entries) {
      if (index.has(entry.id)) {
        const existing = index.get(entry.id)!;
        throw new Error(
          `Duplicate edge-provenance id "${entry.id}" (in domain "${domain}"; ` +
            `already registered under domain "${existing.domain}"). ` +
            `Provenance ids must be globally unique.`,
        );
      }
      index.set(entry.id, entry);
    }
  }
  return index;
}

/** Live index, built once at module load from the static catalog. */
const INDEX: Map<string, EdgeProvenanceEntry> = buildProvenanceIndex(CATALOGS);

/** Look up a catalog entry by id. Undefined if the id isn't registered. */
export function getEdgeProvenanceEntry(
  id: string,
): EdgeProvenanceEntry | undefined {
  return INDEX.get(id);
}

/** All entries for one domain, in authoring order. Empty array if none. */
export function getEdgeProvenanceCatalog(
  domain: string,
): readonly EdgeProvenanceEntry[] {
  return CATALOGS[domain] ?? [];
}

/** Every registered entry across all domains. */
export function allEdgeProvenanceEntries(): readonly EdgeProvenanceEntry[] {
  return [...INDEX.values()];
}

/**
 * Strip the registry-only bookkeeping fields, leaving a plain
 * `EdgeAttributeSource` suitable for the display layer.
 */
function toAttributeSource(entry: EdgeProvenanceEntry): EdgeAttributeSource {
  const { id: _id, domain: _domain, ...source } = entry;
  void _id;
  void _domain;
  return source;
}

/**
 * Resolve an (inline, ref) pair against a given index. Pure — the bound
 * `resolveEdgeSource` below uses the live index; tests inject fixtures.
 *
 * Precedence: inline object > registry ref > author backfill. A ref that
 * doesn't resolve falls through to the backfill rather than throwing — a
 * stale ref on an edge should degrade to "AUTHOR / not validated", not crash
 * the inspector. (`validateEdgeProvenanceRefs` is the loud guard for catching
 * stale refs in a test, where failing fast is the right call.)
 */
export function resolveEdgeSourceWith(
  index: Map<string, EdgeProvenanceEntry>,
  inline: EdgeAttributeSource | undefined,
  ref: string | undefined,
): EdgeAttributeSource {
  if (inline) return inline;
  if (ref) {
    const entry = index.get(ref);
    if (entry) return toAttributeSource(entry);
  }
  return DEFAULT_AUTHOR_SOURCE;
}

/**
 * Resolve an edge attribute's provenance against the live registry. This is
 * the call EdgeInspector (and any future provenance surface) makes.
 */
export function resolveEdgeSource(
  inline: EdgeAttributeSource | undefined,
  ref: string | undefined,
): EdgeAttributeSource {
  return resolveEdgeSourceWith(INDEX, inline, ref);
}

/**
 * Return the subset of refs in `refs` that don't resolve against a given
 * index. Intended for a test that scans the real graph data once the audit
 * tags edges with refs — an unresolved ref is almost always a typo. Returns
 * `[]` when everything resolves (the current state: no edge carries a ref
 * yet, so this trivially passes and becomes a real guard as the audit lands).
 */
export function validateEdgeProvenanceRefs(
  refs: ReadonlyArray<string | undefined>,
  index: Map<string, EdgeProvenanceEntry> = INDEX,
): string[] {
  const missing: string[] = [];
  for (const ref of refs) {
    if (ref && !index.has(ref)) missing.push(ref);
  }
  return missing;
}
