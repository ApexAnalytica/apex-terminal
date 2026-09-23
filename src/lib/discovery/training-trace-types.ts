// ─── Discovery — Training Trace Schema ───────────────────────────────
//
// A `TrainingTrace` is the per-epoch record of a continual-learning
// training run. Every adapter (synthetic, PyTorch-checkpoint,
// TensorFlow-event-file, customer-log) emits this shape; every
// Phase 3 estimator (BES temporal monitoring, FR / Forgetting Rate,
// Ω-Forgetting Pressure) reads from it.
//
// Why this is the canonical shape: the dissertation's catastrophic-
// forgetting analysis (Ghauri 2025, Ch. 8) is fundamentally about
// per-task accuracy degrading over training epochs as the curriculum
// shifts. Everything downstream — FR, exposure-weighted forgetting
// pressure, BES temporal monitoring — boils down to:
//
//   accuracy(task_k, epoch_t)   →   how well the model still knows
//                                    task_k after training has moved on
//
//   χ★(graph_t)                 →   which edges are load-bearing right
//                                    now, computed from the model state
//
// PROVENANCE CONTRACT
// -------------------
// Every trace MUST declare whether it was synthesized for substrate
// testing or extracted from a real training run. The `source.kind`
// discriminator is load-bearing — UI surfaces that display values
// derived from this trace MUST render a SYNTHETIC badge whenever
// `source.kind === "synthetic"`. No customer business decision is
// ever made off synthetic data; the badge is the structural guarantee
// of that contract.
//
// This mirrors the `CohortSource.containsPHI` contract from the
// cohort schema — a hard-typed flag at the schema layer that
// downstream code can rely on.

/**
 * Granularity of "task" the trace operates at. Two readings of the
 * Ghauri 2025 dissertation:
 *   - "attack-class" — each IDS attack class (DDoS, MITM, Heartbleed,
 *     ...) is a task. 9 tasks for the canonical AI Safety substrate.
 *     This is the finest granularity at which the Ch. 8 forgetting
 *     analysis operates — Heartbleed's high mechanism-rarity / high-FR
 *     archetype only shows up here.
 *   - "dataset" — each source dataset (CICIDS-2017, UNSW-NB15,
 *     AWID-H23Q) is a task. 3 tasks. Useful for cohort-level analysis;
 *     loses the per-attack-class forgetting signal.
 *
 * Default for new traces: "attack-class".
 */
export type TaskScope = "attack-class" | "dataset";

/**
 * Stable reference to a task tracked by the trace. The id should be
 * an existing graph node id when possible (e.g. `ais_attack_ddos`) so
 * downstream code can join task-level metrics back to graph topology.
 */
export interface TaskRef {
  id: string;
  label: string;
  scope: TaskScope;
}

/**
 * Per-task accuracy reading at a single epoch. Value is in [0, 1] —
 * "fraction of held-out samples for task_k that the current model
 * classifies correctly." Adapters that emit other metrics (loss,
 * F1, AUROC) should normalise to accuracy at ingest time or extend
 * the schema in a follow-up PR.
 */
export interface TaskAccuracy {
  taskId: string;
  /** [0, 1]. */
  value: number;
}

/**
 * Optional auxiliary metrics recorded per epoch. None are required —
 * the FR estimator runs purely on `accuracy[]`. Recorded when the
 * adapter has cheap access (e.g., PyTorch lightning callbacks).
 */
export interface EpochModelState {
  /** Mean loss on the training batch at this epoch. */
  lossOnBatch?: number;
  /** L2 norm of the gradient at the end of this epoch. */
  gradientNorm?: number;
}

/**
 * One snapshot in the training trace. The trace as a whole is an
 * ordered sequence of these, indexed by `index` (0-indexed).
 */
export interface TrainingEpoch {
  /** 0-indexed epoch number. Must be monotone strictly increasing across the trace. */
  index: number;
  /**
   * Task id(s) the model was actively training on at this epoch.
   * Multi-task batches are allowed (mixed curricula); single-task
   * curricula have exactly one entry per epoch.
   */
  activeTaskIds: string[];
  /**
   * Accuracy across ALL tasks the trace tracks, not just the active
   * one(s). This is what makes the FR computation possible — you
   * need to read task_k's accuracy at every epoch, including the
   * ones where it isn't being trained.
   */
  accuracy: TaskAccuracy[];
  /** Optional auxiliary model-state metrics. */
  modelState?: EpochModelState;
}

/**
 * Provenance of the trace — synthetic substrate test or real training
 * run. The `kind` field is the discriminator UI surfaces must render
 * as a badge.
 */
export interface TrainingTraceSource {
  /** Adapter id (e.g. `"synthetic"`, `"pytorch-lightning"`, `"tf-events"`). */
  adapter: string;
  /** Adapter version for reproducibility. */
  adapterVersion: string;
  /**
   * Hard discriminator. UI surfaces displaying values derived from
   * a `synthetic`-kind trace MUST render a SYNTHETIC badge. UI
   * surfaces gated to live data only (e.g., the customer-facing
   * Ω-Forgetting-Pressure metric) MUST skip rendering when this
   * is `synthetic`.
   */
  kind: "synthetic" | "live";
  /**
   * ISO 8601 timestamp of when this trace object was assembled
   * (NOT when the underlying training run happened).
   */
  builtAt: string;
  /**
   * SHA-256 of the underlying source artifacts — training log files,
   * checkpoint serialisations, or for synthetic traces, the seed +
   * curriculum hash. Optional but recommended for reproducibility.
   */
  sourceHash?: string;
}

/**
 * Trace-level metadata. Free-form study description plus an access-
 * tier flag matching the Cohort schema's `accessTier` convention.
 */
export interface TrainingTraceMetadata {
  description: string;
  citation?: string;
  /** Licence / sharing tier. */
  accessTier: "public" | "dua-restricted" | "internal-only";
}

/**
 * The lingua-franca shape every training trace conforms to. Adapters
 * read raw artifacts into this; estimators (FR, BES temporal,
 * Ω-Forgetting Pressure) read this and never touch raw artifacts.
 */
export interface TrainingTrace {
  /** Stable trace id, opaque. */
  id: string;
  /** Human label for UI display. */
  label: string;
  source: TrainingTraceSource;
  /** All tasks the trace tracks. Order is the order they appear in the curriculum. */
  tasks: TaskRef[];
  /** Per-epoch snapshots, sorted by `epoch.index` ascending. */
  epochs: TrainingEpoch[];
  metadata: TrainingTraceMetadata;
}
