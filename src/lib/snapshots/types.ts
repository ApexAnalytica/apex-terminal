// ─── System State Snapshot ─────────────────────────────────────
// The structured "data frame" produced by Claude compute and
// validated by Tarski before reaching the store / Gemini copilot.

export interface SnapshotNode {
  id: string;
  omega: number;
  fragility: number;
  isActivated: boolean;
}

export interface SnapshotEdge {
  id: string;
  weight: number;
  probability: number;
  isSevered: boolean;
}

export interface SpirtesOutput {
  density: number;
  lambdaMax: number;
  isStable: boolean;
}

export interface ParetoOutput {
  omegaBuffer: number;
  status: string;
  criticalityEstimate: number;
}

export interface PearlOutput {
  interventionCount: number;
  severedEdges: string[];
}

export type TarskiValidationStatus = "PENDING" | "PASSED" | "VIOLATIONS_FOUND";

export interface TarskiViolation {
  axiomId: string;
  edgeId?: string;
  nodeId?: string;
  detail: string;
}

export interface TarskiValidationResult {
  status: TarskiValidationStatus;
  violations: TarskiViolation[];
  checkedAt: string;
}

export interface SystemStateSnapshot {
  version: 1;
  timestamp: string; // ISO-8601
  graph: {
    nodes: SnapshotNode[];
    edges: SnapshotEdge[];
  };
  engineOutputs: {
    spirtes: SpirtesOutput | null;
    pareto: ParetoOutput | null;
    pearl: PearlOutput | null;
  };
  tarskiValidation: TarskiValidationResult;
  metadata: {
    epochCount: number;
    shockCount: number;
    activeModule: string;
  };
}
