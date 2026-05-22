// ─── Discovery — Synthetic Training Trace Generator ──────────────────
//
// Substrate for Phase 3 dissertation work. Produces deterministic
// TrainingTrace fixtures from a curriculum spec + per-task learning
// dynamics. Used to test the math (FR, BES temporal monitoring,
// Ω-Forgetting Pressure) and wire downstream UI without waiting for
// a real continual-learning training pipeline.
//
// EXPLICIT NON-USE
// ----------------
// Synthetic traces are NEVER the basis for a customer business
// decision. Every trace this generator produces is marked
// `source.kind === "synthetic"`. UI surfaces that display values
// derived from a synthetic trace MUST render a SYNTHETIC badge so
// the discriminator is visible at the point of consumption (mirrors
// the data-status pattern from the nPOD work — 2026-05-03 user
// directive).
//
// MODEL OF FORGETTING
// -------------------
// Each task has two dynamics knobs:
//
//   learningRate     — how fast accuracy rises toward the plateau
//                      while the task is in the active training batch.
//                      Logistic approach: acc_{t+1} = acc_t + (plateau
//                      - acc_t) · (1 - exp(-learningRate)).
//
//   forgettingRate   — how fast accuracy decays toward baseline after
//                      training shifts away. Exponential decay:
//                      acc_{t+1} = baseline + (acc_t - baseline) ·
//                      exp(-forgettingRate).
//
// Per-task asymmetry is the whole point — the Ghauri 2025 Ch. 8
// archetype is that Heartbleed has a high forgettingRate (drops fast
// when training shifts to other classes), driving the high-FR /
// high-mechanism-rarity reading. The synthetic generator lets us
// reproduce that archetype on demand for testing.
//
// DETERMINISM
// -----------
// Same `seed` + `curriculum` + `taskDynamics` → bit-identical trace.
// Uses mulberry32 (already used in the project for seeded tests —
// see pareto-relevance test deflake PR #254). Noise is added to
// accuracy values but stays deterministic so test assertions survive
// across runs.

import type {
  TaskAccuracy,
  TaskRef,
  TrainingEpoch,
  TrainingTrace,
} from "./training-trace-types";

/**
 * One window in the training curriculum. Epoch range is
 * [startEpoch, endEpoch) — start inclusive, end exclusive, matching
 * standard half-open interval convention.
 */
export interface CurriculumWindow {
  taskId: string;
  startEpoch: number;
  /** Exclusive. */
  endEpoch: number;
}

/**
 * Per-task learning dynamics. Defaults derived below; pass-in
 * overrides let tests reproduce the Heartbleed-archetype (forgettingRate
 * ≈ 0.15 → ~85% retention per epoch off-task, drops to 50% in ~5 epochs).
 */
export interface TaskDynamics {
  /** Accuracy before the task is ever trained. Default 0.05. */
  baseline: number;
  /** Accuracy plateau under continuous training. Default 0.95. */
  plateau: number;
  /**
   * Rate of approach to plateau per epoch while training. Higher =
   * faster learning. Default 0.5 (≈40% of remaining gap closed per
   * epoch).
   */
  learningRate: number;
  /**
   * Rate of decay toward baseline per epoch when not training.
   * Higher = faster forgetting. Default 0.05 (≈5% relative drop
   * per epoch — slow). Override per task to model archetypes
   * (Heartbleed: ~0.15).
   */
  forgettingRate: number;
}

export const DEFAULT_TASK_DYNAMICS: TaskDynamics = {
  baseline: 0.05,
  plateau: 0.95,
  learningRate: 0.5,
  forgettingRate: 0.05,
};

export interface BuildSyntheticTraceOptions {
  /** Stable trace id. */
  id: string;
  /** Human label. */
  label: string;
  /** All tasks the trace tracks. Order is preserved on the returned trace. */
  tasks: TaskRef[];
  /**
   * Sequence of training windows. Windows may overlap (multi-task
   * batches), be disjoint (canonical continual-learning curriculum),
   * or have gaps (model is idle). The total epoch count is
   * `max(window.endEpoch)` across all windows.
   */
  curriculum: CurriculumWindow[];
  /**
   * Per-task dynamics overrides. Any task not present here gets
   * DEFAULT_TASK_DYNAMICS. Keyed by `TaskRef.id`.
   */
  taskDynamics?: Record<string, Partial<TaskDynamics>>;
  /**
   * PRNG seed for the noise term. Same seed → bit-identical trace.
   * Default 42.
   */
  seed?: number;
  /**
   * Amplitude of the symmetric noise added to accuracy values, in
   * raw accuracy units. Default 0.02 (≈±2 percentage points).
   * Clamped so the final value stays in [0, 1].
   */
  noiseAmplitude?: number;
  /** Free-form description; defaults to "synthetic training trace". */
  description?: string;
}

// ─── Deterministic PRNG ──────────────────────────────────────────────
//
// mulberry32 — used elsewhere in the project for seeded tests. Tiny,
// fast, statistically adequate for noise injection.
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function resolveDynamics(
  taskId: string,
  overrides: Record<string, Partial<TaskDynamics>> | undefined,
): TaskDynamics {
  const o = overrides?.[taskId] ?? {};
  return {
    baseline: o.baseline ?? DEFAULT_TASK_DYNAMICS.baseline,
    plateau: o.plateau ?? DEFAULT_TASK_DYNAMICS.plateau,
    learningRate: o.learningRate ?? DEFAULT_TASK_DYNAMICS.learningRate,
    forgettingRate: o.forgettingRate ?? DEFAULT_TASK_DYNAMICS.forgettingRate,
  };
}

/**
 * Build a deterministic synthetic TrainingTrace from a curriculum.
 *
 * Pipeline:
 *   1. Resolve total epoch count from the curriculum
 *   2. For each epoch, determine which tasks are active
 *   3. For each task, evolve its accuracy by one step:
 *        - active     → logistic approach to plateau
 *        - not active → exponential decay to baseline
 *   4. Add deterministic noise, clamp to [0, 1]
 *   5. Emit TrainingEpoch records, marking `source.kind: "synthetic"`
 *
 * Always returns a trace with `source.kind === "synthetic"`. This is
 * load-bearing — callers (the UI badge wiring) rely on it.
 */
export function buildSyntheticTrainingTrace(
  opts: BuildSyntheticTraceOptions,
): TrainingTrace {
  if (opts.tasks.length === 0) {
    throw new Error("buildSyntheticTrainingTrace: tasks must not be empty");
  }
  if (opts.curriculum.length === 0) {
    throw new Error("buildSyntheticTrainingTrace: curriculum must not be empty");
  }
  // Validate every curriculum entry references a known task.
  const taskIds = new Set(opts.tasks.map((t) => t.id));
  for (const w of opts.curriculum) {
    if (!taskIds.has(w.taskId)) {
      throw new Error(
        `buildSyntheticTrainingTrace: curriculum references unknown task: ${w.taskId}`,
      );
    }
    if (!Number.isInteger(w.startEpoch) || !Number.isInteger(w.endEpoch)) {
      throw new Error(
        `buildSyntheticTrainingTrace: curriculum windows must use integer epochs (got ${w.startEpoch}, ${w.endEpoch})`,
      );
    }
    if (w.startEpoch < 0 || w.endEpoch <= w.startEpoch) {
      throw new Error(
        `buildSyntheticTrainingTrace: invalid curriculum window [${w.startEpoch}, ${w.endEpoch}) for task ${w.taskId}`,
      );
    }
  }

  const totalEpochs = Math.max(...opts.curriculum.map((w) => w.endEpoch));
  const seed = opts.seed ?? 42;
  const noiseAmplitude = opts.noiseAmplitude ?? 0.02;
  const rng = mulberry32(seed);

  // Pre-resolve per-task dynamics.
  const dyn = new Map<string, TaskDynamics>();
  for (const t of opts.tasks) {
    dyn.set(t.id, resolveDynamics(t.id, opts.taskDynamics));
  }

  // Build an epoch → active-task-ids map up front so the main loop
  // doesn't re-scan the curriculum each step.
  const activeByEpoch: string[][] = Array.from({ length: totalEpochs }, () => []);
  for (const w of opts.curriculum) {
    for (let e = w.startEpoch; e < w.endEpoch; e++) {
      if (e < totalEpochs) activeByEpoch[e].push(w.taskId);
    }
  }

  // Per-task accuracy state, evolved epoch by epoch.
  const acc = new Map<string, number>();
  for (const t of opts.tasks) {
    acc.set(t.id, dyn.get(t.id)!.baseline);
  }

  const epochs: TrainingEpoch[] = [];
  for (let e = 0; e < totalEpochs; e++) {
    const active = new Set(activeByEpoch[e]);
    for (const t of opts.tasks) {
      const d = dyn.get(t.id)!;
      let next: number;
      const prev = acc.get(t.id)!;
      if (active.has(t.id)) {
        // Logistic approach: close part of the remaining gap to plateau.
        const gap = d.plateau - prev;
        next = prev + gap * (1 - Math.exp(-d.learningRate));
      } else {
        // Exponential decay toward baseline.
        const above = prev - d.baseline;
        next = d.baseline + above * Math.exp(-d.forgettingRate);
      }
      // Symmetric noise in [-noiseAmplitude, +noiseAmplitude].
      const noise = (rng() * 2 - 1) * noiseAmplitude;
      next = Math.max(0, Math.min(1, next + noise));
      acc.set(t.id, next);
    }

    const accuracy: TaskAccuracy[] = opts.tasks.map((t) => ({
      taskId: t.id,
      value: acc.get(t.id)!,
    }));
    epochs.push({
      index: e,
      activeTaskIds: activeByEpoch[e],
      accuracy,
    });
  }

  return {
    id: opts.id,
    label: opts.label,
    source: {
      adapter: "synthetic",
      adapterVersion: "0.1.0",
      kind: "synthetic",
      builtAt: new Date().toISOString(),
      // Hash the deterministic inputs so a trace with the same
      // curriculum + seed has the same sourceHash regardless of
      // when it was assembled.
      sourceHash: synthHash({
        curriculum: opts.curriculum,
        taskDynamics: opts.taskDynamics ?? {},
        seed,
        noiseAmplitude,
      }),
    },
    tasks: opts.tasks,
    epochs,
    metadata: {
      description: opts.description ?? "synthetic training trace",
      accessTier: "internal-only",
    },
  };
}

// Stable hash of synthetic inputs. djb2 over a canonical JSON
// serialisation — not cryptographically strong, just deterministic
// and tiny. Returned as a hex string so the schema's optional
// `sourceHash` doesn't gain a numeric-only contract.
function synthHash(input: unknown): string {
  const s = JSON.stringify(input, Object.keys(input as object).sort());
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// ─── Canonical curricula ─────────────────────────────────────────────
//
// Reusable building blocks for tests / demos. Each is a curriculum
// shape that maps onto a dissertation scenario; pass to
// buildSyntheticTrainingTrace along with the matching TaskRef[].

/**
 * Sequential curriculum — train one task at a time for
 * `epochsPerTask` epochs each, no overlap. The canonical continual-
 * learning setup the Ghauri 2025 Ch. 8 forgetting analysis assumes.
 */
export function sequentialCurriculum(
  taskIds: string[],
  epochsPerTask: number,
): CurriculumWindow[] {
  return taskIds.map((taskId, i) => ({
    taskId,
    startEpoch: i * epochsPerTask,
    endEpoch: (i + 1) * epochsPerTask,
  }));
}
