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
 * The catalog is intentionally EMPTY in the PR that introduces this
 * mechanism. The per-domain audit populates `CATALOGS` (and tags edges with
 * refs) as a follow-up — no change to this module's logic is required for
 * that, only data. Keeping the two PRs separate keeps the mechanism review
 * clean and avoids shipping any unverified citation as part of the plumbing.
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
 * The catalog, grouped by domain for authoring clarity. EMPTY until the
 * per-domain provenance audit populates it. Example shape (for the audit
 * PR — not live data):
 *
 *   t1d: [
 *     {
 *       id: "dcct-1993",
 *       domain: "t1d",
 *       kind: "literature",
 *       citation: "DCCT Research Group, N Engl J Med 1993;329:977-986",
 *       note: "Intensive glycemic control vs complications — landmark RCT",
 *     },
 *   ],
 */
const CATALOGS: Record<string, EdgeProvenanceEntry[]> = {};

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
