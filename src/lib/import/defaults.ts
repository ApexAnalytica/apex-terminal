import {
  CausalNode,
  CausalEdge,
  NodeCategory,
  EdgeType,
  OmegaFragilityProfile,
} from "@/lib/types";
import { RawNode, RawEdge } from "./types";

const VALID_CATEGORIES: NodeCategory[] = [
  "manufacturing",
  "infrastructure",
  "economic",
  "finance",
  "energy",
  "geopolitical",
  "communications",
  "agriculture",
];

const VALID_EDGE_TYPES: EdgeType[] = ["directed", "confounded", "temporal"];
const VALID_DISCOVERY_SOURCES = ["DCD", "PCMCI+", "FCI", "merged"] as const;

function titleCase(s: string): string {
  return s
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

const DEFAULT_OMEGA: OmegaFragilityProfile = {
  composite: 5.0,
  substitutionFriction: 5.0,
  downstreamLoad: 5.0,
  cascadingVoltage: 5.0,
  existentialTailWeight: 5.0,
};

export function applyNodeDefaults(raw: RawNode, index: number): CausalNode {
  const id = raw.id ?? `imported_node_${index}`;
  const label = raw.label ?? titleCase(id);
  const shortLabel = raw.shortLabel ?? label.slice(0, 3).toUpperCase();

  const category: NodeCategory = VALID_CATEGORIES.includes(
    raw.category as NodeCategory
  )
    ? (raw.category as NodeCategory)
    : "infrastructure";

  const discoverySource = VALID_DISCOVERY_SOURCES.includes(
    raw.discoverySource as (typeof VALID_DISCOVERY_SOURCES)[number]
  )
    ? (raw.discoverySource as CausalNode["discoverySource"])
    : "merged";

  const rawOmega = raw.omegaFragility ?? {};
  const omegaFragility: OmegaFragilityProfile = {
    composite: clamp(rawOmega.composite ?? DEFAULT_OMEGA.composite, 0, 10),
    substitutionFriction: clamp(
      rawOmega.substitutionFriction ?? DEFAULT_OMEGA.substitutionFriction,
      0,
      10
    ),
    downstreamLoad: clamp(
      rawOmega.downstreamLoad ?? DEFAULT_OMEGA.downstreamLoad,
      0,
      10
    ),
    cascadingVoltage: clamp(
      rawOmega.cascadingVoltage ?? DEFAULT_OMEGA.cascadingVoltage,
      0,
      10
    ),
    existentialTailWeight: clamp(
      rawOmega.existentialTailWeight ?? DEFAULT_OMEGA.existentialTailWeight,
      0,
      10
    ),
  };

  return {
    id,
    label,
    shortLabel,
    category,
    omegaFragility,
    globalConcentration: raw.globalConcentration ?? "Unknown",
    replacementTime: raw.replacementTime ?? "Unknown",
    physicalConstraint: raw.physicalConstraint,
    domain: raw.domain ?? "Imported",
    discoverySource,
    isConfounded: raw.isConfounded ?? false,
    isRestricted: raw.isRestricted ?? false,
  };
}

export function applyEdgeDefaults(raw: RawEdge, index: number): CausalEdge {
  const type: EdgeType = VALID_EDGE_TYPES.includes(raw.type as EdgeType)
    ? (raw.type as EdgeType)
    : "directed";

  return {
    id: raw.id ?? `imported_edge_${index}`,
    source: raw.source ?? "",
    target: raw.target ?? "",
    weight: clamp(raw.weight ?? 0.5, 0, 1),
    lag: raw.lag ?? 0,
    type,
    confidence: clamp(raw.confidence ?? 0.5, 0, 1),
    isInconsistent: raw.isInconsistent ?? false,
    physicalMechanism: raw.physicalMechanism ?? "imported relationship",
  };
}
