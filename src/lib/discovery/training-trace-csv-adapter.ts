// ─── Discovery — CSV Training-Trace Adapter ───────────────────────────
//
// Phase 3 PR 5 of the Ghauri 2025 dissertation integration. Reads a
// CSV training log (e.g. from `pytorch_lightning.loggers.CSVLogger` or
// `tf.keras.callbacks.CSVLogger`) and emits a validated TrainingTrace
// with `source.kind = "live"`.
//
// EXPECTED CSV SHAPE
// ------------------
// One row per epoch. Required columns:
//   - `epoch` (or `step`): integer epoch index, monotone non-decreasing
//   - one accuracy column per tracked task. Default convention:
//     `acc_<taskId>` (e.g. `acc_task_ddos`, `acc_task_mitm`). Override
//     via `options.accuracyColumnFor(taskId)`.
//
// Optional columns:
//   - `active_tasks` — pipe-delimited list of currently-training task
//     ids (e.g. `"task_ddos|task_mitm"`). When absent, the adapter
//     emits an empty `activeTaskIds` array for every epoch — the FR
//     estimator still works (it derives forgetting from accuracy curves,
//     not from active-task labels), but `lastTrainedEpoch` will report
//     `-1` for every task.
//
// Lines starting with `#` are treated as comments and skipped. Quoted
// CSV values (including embedded commas / newlines) are NOT supported
// — training logs in this repo's expected shape don't use them. If a
// customer's logger does, they should re-emit as JSON.
//
// SECURITY
// --------
// Same hard ceilings as the JSON adapter (max tasks / epochs / points).
// Source.kind is FORCED to "live"; customer cannot claim "synthetic"
// through this adapter.

import {
  DEFAULT_TRACE_LIMITS,
  TrainingTraceValidationError,
  validateTrainingTrace,
  type TrainingTraceValidatorLimits,
} from "./training-trace-validator";
import type {
  TaskAccuracy,
  TaskRef,
  TrainingEpoch,
  TrainingTrace,
} from "./training-trace-types";

export const CSV_ADAPTER_ID = "csv-v1";
export const CSV_ADAPTER_VERSION = "0.1.0";

export interface LoadFromCSVOptions {
  /** Stable trace id. */
  id: string;
  /** Human label. */
  label: string;
  /**
   * The tasks tracked by this trace. Order is preserved in the
   * returned trace.
   */
  tasks: TaskRef[];
  /**
   * Function that maps a task id to the expected CSV column name.
   * Default: `(id) => "acc_" + id`. Override for non-standard naming
   * (e.g. `(id) => id + "_val_acc"` for some PyTorch Lightning setups).
   */
  accuracyColumnFor?: (taskId: string) => string;
  /**
   * Name of the column carrying the epoch index. Default `"epoch"`,
   * with a fallback to `"step"` when `epoch` is absent.
   */
  epochColumn?: string;
  /**
   * Name of the optional active-tasks column. Default
   * `"active_tasks"` (pipe-delimited). Set to `null` to skip
   * detection entirely.
   */
  activeTasksColumn?: string | null;
  /** Delimiter for the active-tasks column. Default `|`. */
  activeTasksDelimiter?: string;
  /** ISO timestamp for `source.builtAt`. Default: now. */
  ingestedAt?: string;
  /** Optional SHA-256 / hash of the source artifact for reproducibility. */
  sourceHash?: string;
  /** Validator limits override. Default `DEFAULT_TRACE_LIMITS`. */
  limits?: TrainingTraceValidatorLimits;
  /** Free-form description forwarded into `metadata.description`. */
  description?: string;
  /**
   * Access tier for the trace. Default `"internal-only"` — the
   * adapter cannot infer customer DUA status from a CSV.
   */
  accessTier?: "public" | "dua-restricted" | "internal-only";
}

// ─── Tiny CSV parser ────────────────────────────────────────────────
//
// Intentionally minimal — no quoted-string support, no escape
// handling. Customer logs we expect don't need it; complex CSV →
// re-emit as JSON.

interface ParsedCSV {
  header: string[];
  rows: string[][];
}

function parseCSV(text: string): ParsedCSV {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
  if (lines.length < 2) {
    throw new TrainingTraceValidationError(
      "CSV must have at least a header row and one data row",
    );
  }
  const header = lines[0].split(",").map((c) => c.trim());
  const rows = lines.slice(1).map((line) => line.split(",").map((c) => c.trim()));
  return { header, rows };
}

function colIndex(header: string[], name: string): number {
  return header.findIndex((h) => h === name);
}

// ─── Main entry point ──────────────────────────────────────────────

/**
 * Parse a CSV training log into a validated `TrainingTrace` with
 * `source.kind = "live"`. Throws `TrainingTraceValidationError` on
 * missing required columns, non-integer epochs, out-of-range accuracy
 * values, or downstream validator failures.
 */
export function loadTrainingTraceFromCSV(
  text: string,
  options: LoadFromCSVOptions,
): TrainingTrace {
  if (options.tasks.length === 0) {
    throw new TrainingTraceValidationError(
      "loadTrainingTraceFromCSV: options.tasks must not be empty",
    );
  }
  const accuracyColumnFor =
    options.accuracyColumnFor ?? ((id) => `acc_${id}`);
  const epochColumnName = options.epochColumn ?? "epoch";
  const activeTasksColumnName =
    options.activeTasksColumn === undefined
      ? "active_tasks"
      : options.activeTasksColumn;
  const activeTasksDelimiter = options.activeTasksDelimiter ?? "|";

  const { header, rows } = parseCSV(text);

  // Locate the epoch column — fall back to `step` if `epoch` is absent.
  let epochIdx = colIndex(header, epochColumnName);
  if (epochIdx === -1 && epochColumnName === "epoch") {
    epochIdx = colIndex(header, "step");
  }
  if (epochIdx === -1) {
    throw new TrainingTraceValidationError(
      `CSV missing epoch column (looked for "${epochColumnName}" and fallback "step")`,
    );
  }

  // Map task id → CSV column index. Fail loudly if any task is
  // missing — silently dropping a column would compute downstream
  // forgetting on a subset the customer didn't ask for.
  const taskIndices = new Map<string, number>();
  for (const task of options.tasks) {
    const colName = accuracyColumnFor(task.id);
    const idx = colIndex(header, colName);
    if (idx === -1) {
      throw new TrainingTraceValidationError(
        `CSV missing accuracy column "${colName}" for task "${task.id}"`,
      );
    }
    taskIndices.set(task.id, idx);
  }

  // Active-tasks column is optional.
  const activeTasksIdx =
    activeTasksColumnName === null
      ? -1
      : colIndex(header, activeTasksColumnName);

  // Walk rows. Reject duplicate / non-monotone epochs.
  const epochs: TrainingEpoch[] = [];
  let prevEpoch = -Infinity;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const epochRaw = row[epochIdx];
    const epochNum = Number(epochRaw);
    if (!Number.isInteger(epochNum)) {
      throw new TrainingTraceValidationError(
        `row ${r + 1}: epoch column must be an integer, got "${epochRaw}"`,
      );
    }
    if (epochNum <= prevEpoch) {
      throw new TrainingTraceValidationError(
        `row ${r + 1}: epoch ${epochNum} is not strictly greater than previous epoch ${prevEpoch}`,
      );
    }
    prevEpoch = epochNum;

    const accuracy: TaskAccuracy[] = options.tasks.map((task) => {
      const idx = taskIndices.get(task.id)!;
      const cell = row[idx];
      const value = Number(cell);
      if (!Number.isFinite(value)) {
        throw new TrainingTraceValidationError(
          `row ${r + 1}, task "${task.id}": accuracy cell "${cell}" is not a finite number`,
        );
      }
      if (value < 0 || value > 1) {
        throw new TrainingTraceValidationError(
          `row ${r + 1}, task "${task.id}": accuracy ${value} outside [0, 1]`,
        );
      }
      return { taskId: task.id, value };
    });

    let activeTaskIds: string[] = [];
    if (activeTasksIdx !== -1) {
      const cell = row[activeTasksIdx] ?? "";
      if (cell.length > 0) {
        activeTaskIds = cell
          .split(activeTasksDelimiter)
          .map((t) => t.trim())
          .filter((t) => t.length > 0);
        // Reject ids the trace doesn't declare — typo would corrupt
        // BES temporal monitoring downstream.
        const knownIds = new Set(options.tasks.map((t) => t.id));
        for (const id of activeTaskIds) {
          if (!knownIds.has(id)) {
            throw new TrainingTraceValidationError(
              `row ${r + 1}: active_tasks references unknown task "${id}"`,
            );
          }
        }
      }
    }

    epochs.push({
      index: epochNum,
      activeTaskIds,
      accuracy,
    });
  }

  const candidate: TrainingTrace = {
    id: options.id,
    label: options.label,
    source: {
      adapter: CSV_ADAPTER_ID,
      adapterVersion: CSV_ADAPTER_VERSION,
      kind: "live",
      builtAt: options.ingestedAt ?? new Date().toISOString(),
      ...(options.sourceHash !== undefined
        ? { sourceHash: options.sourceHash }
        : {}),
    },
    tasks: options.tasks,
    epochs,
    metadata: {
      description:
        options.description ?? "Training trace ingested from CSV log",
      accessTier: options.accessTier ?? "internal-only",
    },
  };

  return validateTrainingTrace(
    candidate,
    options.limits ?? DEFAULT_TRACE_LIMITS,
  );
}
