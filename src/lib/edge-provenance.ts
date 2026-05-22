/**
 * Edge-attribute provenance helpers.
 *
 * The PR-#383-era graph had `weight` and `confidence` on every edge as
 * hand-authored round numbers (0.8, 0.6, ...). Nothing told the analyst
 * where those numbers came from — author judgment, a literature point
 * estimate, a regression fit, a discovery-algorithm output, or a Tarski
 * derivation. This module is the central read path for that provenance:
 *
 *   - `resolveEdgeAttributeSource(source)` normalises an optional
 *     `EdgeAttributeSource` to a concrete one (missing ≡ author).
 *     Callers never have to handle the undefined case themselves.
 *   - `EDGE_SOURCE_LABEL` / `EDGE_SOURCE_COLOR` / `EDGE_SOURCE_DESCRIPTION`
 *     are display tables consumed by EdgeInspector so the rendering
 *     stays consistent across views if/when other surfaces (NodeInspector
 *     edge cards, copilot prose, future audit screens) want to show the
 *     same badge.
 *
 * Per-domain audit work (T1D → NEJM citations, AI Safety → dissertation
 * patches, Saudi energy → literature point estimates) happens in
 * follow-up PRs that just *populate* the new fields — no code change in
 * this module is required for that.
 */

import type {
  EdgeAttributeSource,
  EdgeAttributeSourceKind,
} from "@/lib/types";

/**
 * The "no provenance recorded" default. Returned by
 * `resolveEdgeAttributeSource` whenever the underlying edge field is
 * absent. Frozen so callers can't accidentally mutate the shared
 * sentinel across the graph.
 */
export const DEFAULT_AUTHOR_SOURCE: Readonly<EdgeAttributeSource> =
  Object.freeze({ kind: "author" });

/**
 * Resolve an optional source to a concrete one. Existing edges without
 * the field present resolve to `{kind:"author"}` — backfill happens at
 * read time, not as a schema migration, so we don't have to touch every
 * edge entry in `graph-data.ts` to ship the type.
 */
export function resolveEdgeAttributeSource(
  source: EdgeAttributeSource | undefined,
): EdgeAttributeSource {
  return source ?? DEFAULT_AUTHOR_SOURCE;
}

/**
 * Short label shown in the EdgeInspector badge. Uppercase to match
 * the existing label aesthetic on the inspector (TEMPORAL, CONFOUNDED,
 * DIRECTED).
 */
export const EDGE_SOURCE_LABEL: Record<EdgeAttributeSourceKind, string> = {
  author: "AUTHOR",
  literature: "LITERATURE",
  regression: "REGRESSION",
  discovery: "DISCOVERY",
  tarski: "TARSKI",
};

/**
 * Badge accent color. Choices:
 *  - author     muted gray — signals "not externally validated; needs audit"
 *  - literature green — published source
 *  - regression cyan — data-driven fit (matches `directed` edge color)
 *  - discovery  violet — algorithm output (matches χ★ color from PR #329)
 *  - tarski     amber — axiom-verified (matches `temporal` edge color)
 *
 * Reuses existing palette tokens where possible so the inspector
 * doesn't accidentally introduce a sixth canvas color.
 */
export const EDGE_SOURCE_COLOR: Record<EdgeAttributeSourceKind, string> = {
  author: "#8a8f9c",
  literature: "#3ddc97",
  regression: "#00e5ff",
  discovery: "#7B68EE",
  tarski: "#ffab00",
};

/**
 * One-line explainer rendered under the provenance block when the
 * analyst expands it (or just as a tooltip on the badge). Plain prose,
 * no jargon — this is the answer to "what does AUTHOR mean here?"
 */
export const EDGE_SOURCE_DESCRIPTION: Record<EdgeAttributeSourceKind, string> =
  {
    author:
      "Hand-set during graph construction. Not yet externally validated — flagged for audit.",
    literature: "Point estimate from a published source.",
    regression: "Fit from a regression on real data observed for this network.",
    discovery:
      "Output of a structure-learning run (SPIRTES / FCI / NOTEARS / …).",
    tarski: "Derived from an axiom check or proof trace.",
  };

/**
 * Convenience: true if there's any context worth rendering beyond the
 * kind label (citation, estimator, R², free-text note). EdgeInspector
 * uses this to decide whether to expand into the full provenance block
 * or just show the inline badge.
 *
 * String fields use a non-empty check so a placeholder `citation: ""`
 * doesn't produce an empty-row badge in the inspector. The numeric
 * `rSquared` uses a presence check (typeof === "number") so a 0 fit
 * is still surfaced — a regression that explained nothing is itself a
 * finding worth showing.
 */
export function hasProvenanceDetail(source: EdgeAttributeSource): boolean {
  if (typeof source.rSquared === "number") return true;
  if (source.citation && source.citation.length > 0) return true;
  if (source.estimator && source.estimator.length > 0) return true;
  if (source.note && source.note.length > 0) return true;
  return false;
}
