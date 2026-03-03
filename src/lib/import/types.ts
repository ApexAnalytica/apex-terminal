import { CausalNode, CausalEdge } from "@/lib/types";

// ─── Raw parsed data (before validation/defaults) ────────────────

export interface RawNode {
  id?: string;
  label?: string;
  shortLabel?: string;
  category?: string;
  domain?: string;
  discoverySource?: string;
  omegaFragility?: Partial<{
    composite: number;
    substitutionFriction: number;
    downstreamLoad: number;
    cascadingVoltage: number;
    existentialTailWeight: number;
  }>;
  globalConcentration?: string;
  replacementTime?: string;
  physicalConstraint?: string;
  isConfounded?: boolean;
  isRestricted?: boolean;
  [key: string]: unknown;
}

export interface RawEdge {
  id?: string;
  source?: string;
  target?: string;
  weight?: number;
  lag?: number;
  type?: string;
  confidence?: number;
  isInconsistent?: boolean;
  physicalMechanism?: string;
  [key: string]: unknown;
}

// ─── Parsed output from format parsers ───────────────────────────

export type ImportFormat = "csv" | "json" | "graphml" | "dot";

export interface ParsedGraph {
  nodes: RawNode[];
  edges: RawEdge[];
  format: ImportFormat;
  warnings: string[];
}

// ─── Validation ──────────────────────────────────────────────────

export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  severity: ValidationSeverity;
  row: number; // -1 for graph-level issues
  entity: "node" | "edge" | "graph";
  field?: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean; // true if zero errors (warnings OK)
  issues: ValidationIssue[];
  resolvedNodes: CausalNode[];
  resolvedEdges: CausalEdge[];
}

// ─── Merge ───────────────────────────────────────────────────────

export interface MergeResult {
  addedNodes: number;
  addedEdges: number;
  skippedNodes: string[];
  skippedEdges: string[];
}

// ─── UI State ────────────────────────────────────────────────────

export type ImportStep = "select" | "preview" | "confirm";
