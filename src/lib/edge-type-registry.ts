// Single source of truth for how each edge TYPE is encoded — visually and
// semantically — across the four canvas surfaces (CausalDAG2D / DAGEdge3D /
// CausalDAGMap / CausalDAGRelief) and the shared EdgeInspector.
//
// Before this registry every surface hardcoded its own `edge.type → color`
// switch. They drifted: the actual edge-draw paths learned `flow` (teal,
// shipped #439) but several *secondary* sites — EdgeInspector and the 2D
// in-canvas edge tooltip — never got the case and silently fell through to
// "directed"/cyan. So a flow edge rendered teal on the canvas yet showed up
// as DIRECTED in the inspector. Centralising the type→encoding map here kills
// that drift class: a new type is described once and every surface reads it.
//
// Convention mirrors `criticality-registry.ts`: a closed `Record<EdgeType,…>`
// keyed by the union (so internal call sites stay compile-time exhaustive),
// plus accessors. See `resolveEdgeTypeMeta` / `registerEdgeType` at the bottom
// for the forward-compatible path to runtime-declared domain types — the union
// itself stays CLOSED in this PR (see NOTE).

import type { EdgeType } from "./types";

export type EdgeAnimationCadence = "none" | "standard" | "fast";

export interface EdgeTypeMeta {
  /** The type key. `string` (not `EdgeType`) so runtime-registered custom
   *  types from importers fit the same shape — see `registerEdgeType`. */
  type: string;
  /** Hex stroke / particle color. Kept in lockstep across all surfaces. */
  color: string;
  /** UPPERCASE label shown in EdgeInspector + legends. */
  label: string;
  /** One-line semantic description — what the edge asserts. */
  description: string;
  /** Dashed line = latent / no direct link (confounded). Solid otherwise. */
  dashed: boolean;
  /** Arrowhead on the target node. Causal claims + transmission carry one;
   *  a confounder (common cause, no direction) does not. */
  arrow: boolean;
  /**
   * Canonical motion cue: does this type animate a travelling particle?
   * `temporal` = lag, `flow` = material transport.
   *
   * DESCRIPTIVE in this PR. Renderers read `.color/.label/.dashed/.arrow`
   * today; `.animated` + `.animationCadence` document the *intended* motion
   * encoding so it lives with the rest of the type's spec. 3D already
   * animates flow; the 2D marching-ants + Map teal-particle wiring lands
   * with #483 — at which point those renderers read `.animated` here rather
   * than re-deriving it. Kept now so the registry is the whole truth.
   */
  animated: boolean;
  /** Relative particle cadence when animated. `flow` runs faster than
   *  `temporal` (material moving vs. a lagged correlation). */
  animationCadence: EdgeAnimationCadence;
}

// ─── Built-in types (closed, exhaustive over the EdgeType union) ─────────
// Values transcribed verbatim from the pre-registry switches so the
// migration is byte-for-byte behavior-preserving on every surface.
const REGISTRY: Record<EdgeType, EdgeTypeMeta> = {
  directed: {
    type: "directed",
    color: "#00e5ff", // cyan
    label: "DIRECTED",
    description: "Direct causal claim: A → B.",
    dashed: false,
    arrow: true,
    animated: false,
    animationCadence: "none",
  },
  temporal: {
    type: "temporal",
    color: "#ffab00", // amber
    label: "TEMPORAL",
    description: "Lag-correlation — A leads B with a delay.",
    dashed: false,
    arrow: true,
    animated: true,
    animationCadence: "standard",
  },
  confounded: {
    type: "confounded",
    color: "#ff6d00", // orange
    label: "CONFOUNDED",
    description: "Latent common cause — no direct link.",
    dashed: true,
    arrow: false,
    animated: false,
    animationCadence: "none",
  },
  flow: {
    type: "flow",
    color: "#1de9b6", // teal-green
    label: "FLOW",
    description:
      "Directed transmission of material / capital / signal — stuff is actually moving here.",
    dashed: false,
    arrow: true,
    animated: true,
    animationCadence: "fast",
  },
};

// Runtime-registered custom types (importer-declared). Empty until a dataset
// declares one via `registerEdgeType`. Kept separate from REGISTRY so the
// built-ins remain a closed, exhaustive Record for compile-time safety.
const CUSTOM_REGISTRY = new Map<string, EdgeTypeMeta>();

// Neutral fallback for an unrecognised type string. Mirrors graph-color.ts's
// default grey so an unknown edge degrades gracefully instead of throwing or
// masquerading as a real type.
const DEFAULT_EDGE_TYPE_META: EdgeTypeMeta = {
  type: "unknown",
  color: "#5a5e72",
  label: "UNKNOWN",
  description: "Unrecognised edge type — rendered with neutral defaults.",
  dashed: false,
  arrow: true,
  animated: false,
  animationCadence: "none",
};

/**
 * Type-safe accessor for the built-in types. `edge.type` is `EdgeType`, so
 * every current call site uses this — exhaustive, never undefined.
 */
export function getEdgeTypeMeta(type: EdgeType): EdgeTypeMeta {
  return REGISTRY[type];
}

/**
 * Loose accessor for a raw type string (e.g. an importer reading a CSV/JSON
 * column). Precedence: built-in > custom-registered > neutral default. Never
 * throws — unknown strings degrade to `DEFAULT_EDGE_TYPE_META`.
 */
export function resolveEdgeTypeMeta(type: string): EdgeTypeMeta {
  return (
    REGISTRY[type as EdgeType] ??
    CUSTOM_REGISTRY.get(type) ??
    DEFAULT_EDGE_TYPE_META
  );
}

/**
 * Forward-compat hook: register a runtime/importer-declared edge type so the
 * surfaces can render it without the type being part of the closed `EdgeType`
 * union. Throws on a key that collides with a built-in (you can't silently
 * shadow `flow`), mirroring `buildProvenanceIndex`'s dup-id guard.
 *
 * NOTE: opening the `EdgeType` union itself to `string` is the *documented
 * next step* (backlog 1b.3) — it's deferred so this PR keeps compile-time
 * exhaustiveness on the four built-ins and so new type *semantics* clear
 * Dr. Pita sign-off first. Until then importers route through this hook +
 * `resolveEdgeTypeMeta`.
 */
export function registerEdgeType(meta: EdgeTypeMeta): void {
  if (meta.type in REGISTRY) {
    throw new Error(
      `registerEdgeType: "${meta.type}" collides with a built-in edge type — pick a distinct key.`
    );
  }
  CUSTOM_REGISTRY.set(meta.type, meta);
}

/** All built-in types, plus any runtime-registered custom types. */
export function getAllEdgeTypeMeta(): EdgeTypeMeta[] {
  return [...Object.values(REGISTRY), ...CUSTOM_REGISTRY.values()];
}

/** The built-in four only — stable, ordered, excludes custom registrations.
 *  Handy for legends that should show the canonical taxonomy. */
export function getBuiltinEdgeTypeMeta(): EdgeTypeMeta[] {
  return Object.values(REGISTRY);
}

/** Test/teardown helper — drop all runtime-registered custom types. */
export function __clearCustomEdgeTypes(): void {
  CUSTOM_REGISTRY.clear();
}
