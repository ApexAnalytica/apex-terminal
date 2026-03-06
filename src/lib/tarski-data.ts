import { TarskiAxiom, ProofTrace } from "./types";
import type { SystemStateSnapshot } from "./snapshots/types";
import type { TarskiViolation } from "./snapshots/types";

// ─── Axiom Library (Appendix C) ─────────────────────────────────

export const AXIOM_LIBRARY: TarskiAxiom[] = [
  // Level 0 — Physics (immutable, prune on violation)
  {
    id: "A-01",
    level: 0,
    name: "Temporal Priority",
    formalNotation: "∀e∈Edges, Lag(e) ≥ 0",
    description: "Effects cannot precede causes in the causal graph",
  },
  {
    id: "A-02",
    level: 0,
    name: "Conservation of Flow",
    formalNotation: "ΣInputs ≥ ΣOutputs + ΔStorage",
    description: "Mass/energy/information flow must satisfy conservation",
  },
  {
    id: "A-03",
    level: 0,
    name: "DAG Integrity",
    formalNotation: "∄ path v→⋯→v",
    description: "No directed cycles permitted in the causal structure",
  },
  {
    id: "A-04",
    level: 0,
    name: "Geospatial Speed Limits",
    formalNotation: "Distance(A,B)/Time(A→B) ≤ Vmax",
    description: "Causal influence limited by physical propagation speed",
  },
  {
    id: "A-05",
    level: 0,
    name: "Carnot Bound",
    formalNotation: "η ≤ 1 - T_cold/T_hot",
    description: "Thermodynamic efficiency ceiling for energy conversion",
  },
  {
    id: "A-06",
    level: 0,
    name: "Shannon Capacity",
    formalNotation: "C = B·log₂(1 + SNR)",
    description: "Information throughput bounded by channel capacity",
  },

  // Level 1 — Regulatory (red alert, manual override)
  {
    id: "R-01",
    level: 1,
    name: "Sanction Logic",
    formalNotation: "OFAC/EU SDN ∩ Counterparty ≠ ∅ → BLOCK",
    description: "Transactions involving sanctioned entities are prohibited",
  },
  {
    id: "R-02",
    level: 1,
    name: "Force Majeure",
    formalNotation: "FM_trigger → suspend(obligations)",
    description: "Force majeure events suspend contractual obligations",
  },
  {
    id: "R-03",
    level: 1,
    name: "Capital Adequacy",
    formalNotation: "SCR ≤ Own_Funds (Solvency II)",
    description: "Solvency capital requirement must not exceed own funds",
  },
  {
    id: "R-04",
    level: 1,
    name: "EUV Export Control",
    formalNotation: "EUV_export(NL) → requires(license)",
    description: "Dutch EUV lithography exports require government license",
  },

  // Level 2 — Heuristic (flagged as anomaly)
  {
    id: "H-01",
    level: 2,
    name: "Lead-Lag Reversal",
    formalNotation: "Lag(e_t) · Lag(e_{t-1}) < 0 → REGIME_SHIFT",
    description: "Historical lead-lag reversal signals regime shift candidate",
  },
  {
    id: "H-02",
    level: 2,
    name: "Capacity Saturation",
    formalNotation: "Utilization > 110% nameplate → ANOMALY",
    description: "Production exceeding rated capacity indicates data error or surge",
  },
];

// ─── Proof Traces (inconsistent edges from graph) ───────────────

export const PROOF_TRACES: ProofTrace[] = [
  {
    edgeId: "e15",
    violatedAxioms: ["A-01", "H-01"],
    verdict: "REJECTED",
    solverUsed: "Z3",
    checkTimeMs: 12.4,
  },
  {
    edgeId: "e29",
    violatedAxioms: ["A-02"],
    verdict: "FLAGGED",
    solverUsed: "cvc5",
    checkTimeMs: 8.7,
  },
];

// ─── Axiom Check Functions ────────────────────────────────────
// Each axiom can optionally define a `check` function that validates
// a SystemStateSnapshot and returns violations. Axioms without domain
// data return empty arrays.

export type AxiomCheckFn = (snapshot: SystemStateSnapshot) => TarskiViolation[];

export const AXIOM_CHECKS: Record<string, AxiomCheckFn> = {
  "A-01": (snapshot) => {
    // Temporal Priority: negative weights imply reversed causality
    return snapshot.graph.edges
      .filter((e) => e.weight < 0)
      .map((e) => ({
        axiomId: "A-01",
        edgeId: e.id,
        detail: `Negative weight (${e.weight.toFixed(3)}) violates temporal priority`,
      }));
  },
  "A-02": (snapshot) => {
    // Conservation of Flow: omega exceeding theoretical max
    return snapshot.graph.nodes
      .filter((n) => n.omega > 10)
      .map((n) => ({
        axiomId: "A-02",
        nodeId: n.id,
        detail: `Ω=${n.omega.toFixed(2)} exceeds conservation bound`,
      }));
  },
  "A-03": (snapshot) => {
    // DAG Integrity: degenerate edge detection
    return snapshot.graph.edges
      .filter((e) => e.weight === 0 && e.probability === 0)
      .map((e) => ({
        axiomId: "A-03",
        edgeId: e.id,
        detail: `Zero weight and probability — potential degenerate cycle`,
      }));
  },
  "H-02": (snapshot) => {
    // Capacity Saturation: Ω > 9.5
    return snapshot.graph.nodes
      .filter((n) => n.omega > 9.5)
      .map((n) => ({
        axiomId: "H-02",
        nodeId: n.id,
        detail: `Ω=${n.omega.toFixed(2)} exceeds saturation threshold (9.5)`,
      }));
  },
  "R-01": (snapshot) => {
    // Sanction Logic: high-confidence flow between breached nodes
    const breached = new Set(
      snapshot.graph.nodes.filter((n) => n.omega > 9.8).map((n) => n.id)
    );
    if (breached.size < 2) return [];
    return snapshot.graph.edges
      .filter((e) => !e.isSevered && e.weight > 0.8 && e.probability > 0.95)
      .map((e) => ({
        axiomId: "R-01",
        edgeId: e.id,
        detail: `High-confidence flow (p=${e.probability.toFixed(2)}) between Ω-breached nodes`,
      }));
  },
  // Remaining axioms — metadata only, no programmatic check yet
  "A-04": () => [],
  "A-05": () => [],
  "A-06": () => [],
  "R-02": () => [],
  "R-03": () => [],
  "R-04": () => [],
  "H-01": () => [],
};
