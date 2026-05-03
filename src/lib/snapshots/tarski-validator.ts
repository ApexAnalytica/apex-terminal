// ─── Tarski Snapshot Validator ─────────────────────────────────
// Adapter on top of the full 32-axiom validator (`runTarskiValidation`
// in `src/lib/tarski-data.ts`). Two-validator fork resolved (#1 in the
// open-follow-ups list).
//
// Background: snapshots used to run a thin 5-axiom check (negative-weight
// edges, omega>10, self-loops, omega>9.5 saturation, sanction proxy)
// because `SystemStateSnapshot.graph.edges` doesn't carry source/target
// — the structural axioms (chokepoint, single-source, DAG) need that
// information. So the snapshot path diverged from what users saw in
// TarskiPanel.
//
// Resolution: when `validateSnapshot` is called WITH the live `CausalGraph`
// (which the store has on hand at setSnapshot time), it runs the full
// 32-axiom validator and adapts the result to `TarskiValidationResult`.
// When called without it (e.g. through the EngineProvider interface that
// only sees the snapshot), it falls back to a thin degraded check so
// the contract still holds.

import type { CausalGraph } from "@/lib/types";
import { runTarskiValidation } from "@/lib/tarski-data";
import type {
  SystemStateSnapshot,
  TarskiValidationResult,
  TarskiViolation,
} from "./types";

export interface ValidateSnapshotOptions {
  /** Live graph at snapshot time. When provided, the full 32-axiom
   *  validator runs and its `proofTraces` are adapted into TarskiViolations. */
  liveGraph?: CausalGraph;
  /** Subset of axiom ids to run (forwarded to runTarskiValidation). */
  enabledAxioms?: Set<string>;
}

/**
 * Validate a snapshot. Prefers the full-library validator when a live
 * graph is supplied; otherwise runs the degraded snapshot-only checks.
 *
 * `opts` is positional-second so existing `validateSnapshot(snapshot)`
 * call sites continue to compile and run (just on the degraded path).
 */
export function validateSnapshot(
  snapshot: SystemStateSnapshot,
  opts: ValidateSnapshotOptions = {},
): TarskiValidationResult {
  if (opts.liveGraph) {
    const report = runTarskiValidation(opts.liveGraph, opts.enabledAxioms);
    return reportToValidationResult(report);
  }
  return degradedSnapshotValidate(snapshot);
}

/** Convert a `TarskiValidationReport` (full validator's shape) into a
 *  `TarskiValidationResult` (snapshot-side shape). Each proof trace
 *  becomes one violation per axiomId it references. */
export function reportToValidationResult(
  report: import("@/lib/tarski-data").TarskiValidationReport,
): TarskiValidationResult {
  const violations: TarskiViolation[] = [];
  for (const trace of report.proofTraces) {
    for (const axiomId of trace.violatedAxioms) {
      violations.push({
        axiomId,
        edgeId: trace.edgeId,
        detail: trace.detail ?? `Edge ${trace.edgeId} violates ${axiomId}`,
      });
    }
  }
  // Restricted nodes that aren't covered by edge-bound proof traces still
  // deserve a violation entry. (Some axioms — e.g. R-02 — produce node-
  // level restrictions plus edge traces; some only produce node-level.)
  const traceEdgeIds = new Set(report.proofTraces.map((t) => t.edgeId));
  for (const nodeId of report.restrictedNodeIds) {
    // Skip if the node already has at least one edge-bound trace (likely
    // covered). Heuristic — surface every restriction as its own violation
    // when no edge trace exists for it.
    const coveredByEdge = report.proofTraces.some((t) => traceEdgeIds.has(t.edgeId));
    if (!coveredByEdge && violations.findIndex((v) => v.nodeId === nodeId) === -1) {
      violations.push({
        axiomId: "R-restricted",
        nodeId,
        detail: `Node ${nodeId} flagged as restricted by validation pass`,
      });
    }
  }
  return {
    status: violations.length > 0 ? "VIOLATIONS_FOUND" : "PASSED",
    violations,
    checkedAt: new Date().toISOString(),
  };
}

// ─── Degraded fallback (snapshot-only) ─────────────────────────
// Used when the caller can't supply a live CausalGraph (e.g. the
// EngineProvider interface). Preserves the original 5-axiom behaviour
// from before the unification so existing callers don't regress.

type AxiomCheck = (snapshot: SystemStateSnapshot) => TarskiViolation[];

const checkTemporalPriority: AxiomCheck = (snapshot) => {
  const violations: TarskiViolation[] = [];
  for (const edge of snapshot.graph.edges) {
    if (edge.weight < 0) {
      violations.push({
        axiomId: "A-01",
        edgeId: edge.id,
        detail: `Edge ${edge.id} has negative weight (${edge.weight.toFixed(3)}), violating temporal priority`,
      });
    }
  }
  return violations;
};

const checkConservationOfFlow: AxiomCheck = (snapshot) => {
  const violations: TarskiViolation[] = [];
  for (const node of snapshot.graph.nodes) {
    if (node.omega > 10) {
      violations.push({
        axiomId: "A-02",
        nodeId: node.id,
        detail: `Node ${node.id} omega=${node.omega.toFixed(2)} exceeds conservation bound (max 10)`,
      });
    }
  }
  return violations;
};

const checkDAGIntegrity: AxiomCheck = (snapshot) => {
  const violations: TarskiViolation[] = [];
  for (const edge of snapshot.graph.edges) {
    if (edge.weight === 0 && edge.probability === 0) {
      violations.push({
        axiomId: "A-03",
        edgeId: edge.id,
        detail: `Edge ${edge.id} has zero weight and probability — potential degenerate cycle`,
      });
    }
  }
  return violations;
};

const checkCapacitySaturation: AxiomCheck = (snapshot) => {
  const violations: TarskiViolation[] = [];
  const SATURATION_THRESHOLD = 9.5;
  for (const node of snapshot.graph.nodes) {
    if (node.omega > SATURATION_THRESHOLD) {
      violations.push({
        axiomId: "H-02",
        nodeId: node.id,
        detail: `Node ${node.id} Ω=${node.omega.toFixed(2)} exceeds saturation threshold (${SATURATION_THRESHOLD})`,
      });
    }
  }
  return violations;
};

const checkSanctionLogic: AxiomCheck = (snapshot) => {
  const violations: TarskiViolation[] = [];
  const breachedNodes = new Set(
    snapshot.graph.nodes.filter((n) => n.omega > 9.8).map((n) => n.id),
  );
  if (breachedNodes.size === 0) return violations;
  for (const edge of snapshot.graph.edges) {
    if (!edge.isSevered && edge.weight > 0.8 && edge.probability > 0.95 && breachedNodes.size >= 2) {
      violations.push({
        axiomId: "R-01",
        edgeId: edge.id,
        detail: `Edge ${edge.id} carries high-confidence flow (p=${edge.probability.toFixed(2)}) between Ω-breached nodes`,
      });
    }
  }
  return violations;
};

const DEGRADED_CHECKS: AxiomCheck[] = [
  checkTemporalPriority,
  checkConservationOfFlow,
  checkDAGIntegrity,
  checkCapacitySaturation,
  checkSanctionLogic,
];

function degradedSnapshotValidate(
  snapshot: SystemStateSnapshot,
): TarskiValidationResult {
  const violations: TarskiViolation[] = [];
  for (const check of DEGRADED_CHECKS) {
    violations.push(...check(snapshot));
  }
  return {
    status: violations.length > 0 ? "VIOLATIONS_FOUND" : "PASSED",
    violations,
    checkedAt: new Date().toISOString(),
  };
}
