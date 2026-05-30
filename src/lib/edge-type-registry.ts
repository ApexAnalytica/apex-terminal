/**
 * Edge-TYPE registry — the single source of truth for how each edge
 * type is PRESENTED (color, label, dash, motion, arrow, prose) across
 * every canvas surface (3D / 2D / Map), the EdgeInspector, the per-type
 * visibility toggle strip, and the encoding legend.
 *
 * WHY a registry (vs the closed `EdgeType` union it replaces):
 * before this, the four built-in types' color / label / dash were
 * duplicated as hardcoded ternaries / switches in five files. Adding a
 * domain type (T1D `metabolic`, finance `contagion`, …) was impossible
 * without editing every one of them, and the literals had already
 * drifted — `flow` fell through to the cyan "directed" default in both
 * EdgeInspector and the 2D tooltip. This module centralizes the
 * contract so:
 *   - changing a type's color is a one-line edit here, and
 *   - a domain can `registerEdgeType(...)` a brand-new type that
 *     immediately renders + appears in the toggle strip, with no
 *     renderer edits.
 *
 * Design decisions (the three open questions from the backlog):
 *   1. `flow` does NOT get a dedicated `capacity` field on CausalEdge.
 *      Capacity stays overloaded into `weight` until a flow-capacity
 *      use case demands the split — YAGNI, consistent with deferring
 *      the constants-tuning pass.
 *   2. The registry IS runtime-discoverable: it ships seeded with the
 *      four built-ins, but `registerEdgeType` lets an importer / domain
 *      module add types at runtime. Lookups never throw on an unknown
 *      type — they fall back to a neutral slate meta so a custom type
 *      always renders rather than crashing a canvas.
 *   3. Per-renderer GLYPH mapping lives HERE for the shared contract
 *      (color / label / dashed / arrow / animates-at-rest). Fine-grained
 *      per-renderer animation nuance that genuinely differs (3D's
 *      temporal-particle vs flow-whoosh cadence) stays local to the
 *      renderer — the `animated` flag only says "this type carries a
 *      steady at-rest motion cue", not how each surface draws it.
 *
 * Distinct from `edge-provenance-registry.ts` (#465): that catalogs
 * SOURCES (where an edge's weight / confidence came from); this catalogs
 * the type TAXONOMY (what kind of relationship the edge encodes).
 */

import type { BuiltinEdgeType, EdgeType } from "@/lib/types";

export interface EdgeTypeMeta {
  /** The discriminator stored on `CausalEdge.type`. */
  id: string;
  /**
   * Inspector / tooltip label, uppercase to match the existing
   * aesthetic (TEMPORAL / CONFOUNDED / DIRECTED).
   */
  label: string;
  /** Short label for the per-type visibility toggle strip in DAGOverlay. */
  chipLabel: string;
  /** Canvas color (hex). Kept in lockstep across 3D / 2D / Map. */
  color: string;
  /** Render dashed (latent / no-direct-link relationship). */
  dashed: boolean;
  /**
   * Carries a steady at-rest motion cue — 3D particle / whoosh, 2D
   * marching-ants, Map particles. This flag only declares THAT the
   * type animates at rest; HOW each surface draws it stays local to
   * the renderer.
   */
  animated: boolean;
  /** Draw an arrowhead at the target (directional edge). */
  arrow: boolean;
  /** One-line plain-prose explainer for the legend / tooltip. */
  description: string;
}

/**
 * Neutral fallback color for an unregistered type — matches the slate
 * `default` the 3D renderer used for unknown edge types before this
 * registry existed.
 */
const UNKNOWN_EDGE_COLOR = "#42466a";

/**
 * The four built-in edge types. Colors are the canonical canvas hues —
 * a regression test locks these exact values so a future edit can't
 * silently shift a canvas color.
 */
const BUILTIN_EDGE_TYPES: Record<BuiltinEdgeType, EdgeTypeMeta> = {
  directed: {
    id: "directed",
    label: "DIRECTED",
    chipLabel: "CAUSAL",
    color: "#00e5ff",
    dashed: false,
    animated: false,
    arrow: true,
    description: "Direct cause: A → B. Arrowed.",
  },
  temporal: {
    id: "temporal",
    label: "TEMPORAL",
    chipLabel: "TEMP",
    color: "#ffab00",
    dashed: false,
    animated: true,
    arrow: true,
    description:
      "Lag-correlation: A leads B by some delay. Particles flow source → target.",
  },
  confounded: {
    id: "confounded",
    label: "CONFOUNDED",
    chipLabel: "CONF",
    color: "#ff6d00",
    dashed: true,
    animated: false,
    arrow: false,
    description:
      "A and B share a hidden common cause, no direct link. Dashed to flag the latent variable.",
  },
  flow: {
    id: "flow",
    label: "FLOW",
    chipLabel: "FLOW",
    color: "#1de9b6",
    dashed: false,
    animated: true,
    arrow: true,
    description:
      "Directed transmission of material / capital / signal through the network. Distinct from CAUSAL (a claim of cause) and TEMPORAL (a lag correlation) — flow means stuff is actually moving along this edge.",
  },
};

/**
 * Mutable registry, seeded with the built-ins. A `Map` (not a plain
 * Record) so lookups are honestly typed `EdgeTypeMeta | undefined` and
 * the unknown-key fallback is type-checked rather than relying on
 * `noUncheckedIndexedAccess`.
 */
const REGISTRY = new Map<string, EdgeTypeMeta>(
  Object.entries(BUILTIN_EDGE_TYPES),
);

/** The built-in type ids, frozen. The "closed core" every surface ships with. */
export const BUILTIN_EDGE_TYPE_IDS: readonly BuiltinEdgeType[] = Object.freeze(
  Object.keys(BUILTIN_EDGE_TYPES) as BuiltinEdgeType[],
);

/** True if `id` has a registered presentation (built-in or domain-added). */
export function isEdgeTypeRegistered(id: string): boolean {
  return REGISTRY.has(id);
}

/**
 * Presentation meta for an unregistered type. Neutral slate, id-derived
 * labels — enough to render a custom domain type that hasn't called
 * `registerEdgeType`, instead of crashing.
 */
function fallbackMeta(type: string): EdgeTypeMeta {
  const label = (type || "unknown").toUpperCase();
  return {
    id: type,
    label,
    chipLabel: label.slice(0, 4),
    color: UNKNOWN_EDGE_COLOR,
    dashed: false,
    animated: false,
    arrow: true,
    description: `Custom edge type "${type}". No presentation registered — rendered with the neutral fallback.`,
  };
}

/**
 * Resolve a type id to its presentation meta. Never throws: an
 * unregistered id returns a neutral fallback so a custom domain type
 * always renders. This is the function every renderer / inspector
 * calls instead of switching on `edge.type` literals.
 */
export function getEdgeTypeMeta(type: EdgeType | string): EdgeTypeMeta {
  return REGISTRY.get(type) ?? fallbackMeta(type);
}

/**
 * Every registered type's meta, in registration order (built-ins first).
 * Drives the per-type visibility toggle strip + the encoding legend, so
 * a newly-registered domain type appears in both with no UI edits.
 */
export function getAllEdgeTypeMeta(): EdgeTypeMeta[] {
  return [...REGISTRY.values()];
}

/**
 * Register a domain-specific edge type at runtime. Throws on a duplicate
 * id (including the built-ins) so a domain can't silently clobber the
 * shared core — mirrors `buildProvenanceIndex`'s dup-id guard. Check
 * `isEdgeTypeRegistered` first if a re-register is legitimate (e.g. HMR).
 */
export function registerEdgeType(meta: EdgeTypeMeta): void {
  if (REGISTRY.has(meta.id)) {
    throw new Error(
      `registerEdgeType: edge type "${meta.id}" is already registered. ` +
        `Built-ins (${BUILTIN_EDGE_TYPE_IDS.join(", ")}) cannot be overridden; ` +
        `check isEdgeTypeRegistered() before re-registering a custom type.`,
    );
  }
  REGISTRY.set(meta.id, meta);
}
