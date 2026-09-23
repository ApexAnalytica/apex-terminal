// ─── Discovery — Training Trace Validator ────────────────────────────
//
// Runtime validator for `TrainingTrace` blobs arriving from untrusted
// sources (eventual customer adapters posting traces to an API
// surface). The TS type system enforces the schema at compile time;
// this file enforces it at runtime so a malformed or malicious
// payload can't propagate downstream.
//
// Mirrors the `validateCohort` shape from cohort-validator.ts —
// throws a precise pointer on any mismatch, returns the refined type
// on success.

import type {
  TaskAccuracy,
  TaskRef,
  TaskScope,
  TrainingEpoch,
  TrainingTrace,
  TrainingTraceMetadata,
  TrainingTraceSource,
} from "./training-trace-types";

export interface TrainingTraceValidatorLimits {
  /** Hard ceiling on task count. Synthetic traces typically have 9. */
  maxTasks: number;
  /** Hard ceiling on epoch count. Real continual-learning runs sometimes go to 10k+. */
  maxEpochs: number;
  /** Hard ceiling on total accuracy datapoints (tasks × epochs). */
  maxAccuracyPoints: number;
}

export const DEFAULT_TRACE_LIMITS: TrainingTraceValidatorLimits = {
  maxTasks: 64,
  maxEpochs: 50_000,
  maxAccuracyPoints: 500_000,
};

export class TrainingTraceValidationError extends Error {
  constructor(message: string) {
    super(`training trace validation failed: ${message}`);
    this.name = "TrainingTraceValidationError";
  }
}

const VALID_SCOPES: TaskScope[] = ["attack-class", "dataset"];
const VALID_SOURCE_KINDS: TrainingTraceSource["kind"][] = ["synthetic", "live"];
const VALID_ACCESS_TIERS: TrainingTraceMetadata["accessTier"][] = [
  "public",
  "dua-restricted",
  "internal-only",
];

function requireField(obj: Record<string, unknown>, key: string, where: string) {
  if (!(key in obj)) {
    throw new TrainingTraceValidationError(`missing required field "${key}" on ${where}`);
  }
}

function requireString(value: unknown, where: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TrainingTraceValidationError(`${where} must be a non-empty string`);
  }
}

function validateSource(blob: unknown): TrainingTraceSource {
  if (!blob || typeof blob !== "object") {
    throw new TrainingTraceValidationError("source must be an object");
  }
  const s = blob as Record<string, unknown>;
  for (const k of ["adapter", "adapterVersion", "kind", "builtAt"]) {
    requireField(s, k, "source");
  }
  requireString(s.adapter, "source.adapter");
  requireString(s.adapterVersion, "source.adapterVersion");
  if (typeof s.builtAt !== "string" || Number.isNaN(Date.parse(s.builtAt))) {
    throw new TrainingTraceValidationError("source.builtAt must be an ISO 8601 string");
  }
  if (!VALID_SOURCE_KINDS.includes(s.kind as TrainingTraceSource["kind"])) {
    throw new TrainingTraceValidationError(
      `source.kind must be one of ${VALID_SOURCE_KINDS.join(", ")} (got ${String(s.kind)})`,
    );
  }
  if (s.sourceHash !== undefined && typeof s.sourceHash !== "string") {
    throw new TrainingTraceValidationError("source.sourceHash must be a string when present");
  }
  return s as unknown as TrainingTraceSource;
}

function validateTasks(blob: unknown, limits: TrainingTraceValidatorLimits): TaskRef[] {
  if (!Array.isArray(blob)) {
    throw new TrainingTraceValidationError("tasks must be an array");
  }
  if (blob.length === 0) {
    throw new TrainingTraceValidationError("tasks must not be empty");
  }
  if (blob.length > limits.maxTasks) {
    throw new TrainingTraceValidationError(
      `tasks exceeds maxTasks (${blob.length} > ${limits.maxTasks})`,
    );
  }
  const seen = new Set<string>();
  blob.forEach((t, i) => {
    if (!t || typeof t !== "object") {
      throw new TrainingTraceValidationError(`tasks[${i}] must be an object`);
    }
    const r = t as Record<string, unknown>;
    requireString(r.id, `tasks[${i}].id`);
    requireString(r.label, `tasks[${i}].label`);
    if (!VALID_SCOPES.includes(r.scope as TaskScope)) {
      throw new TrainingTraceValidationError(
        `tasks[${i}].scope must be one of ${VALID_SCOPES.join(", ")} (got ${String(r.scope)})`,
      );
    }
    if (seen.has(r.id as string)) {
      throw new TrainingTraceValidationError(`tasks[${i}].id duplicate: ${r.id}`);
    }
    seen.add(r.id as string);
  });
  return blob as TaskRef[];
}

function validateAccuracy(
  blob: unknown,
  taskIds: Set<string>,
  where: string,
): TaskAccuracy[] {
  if (!Array.isArray(blob)) {
    throw new TrainingTraceValidationError(`${where}.accuracy must be an array`);
  }
  const seen = new Set<string>();
  blob.forEach((a, i) => {
    if (!a || typeof a !== "object") {
      throw new TrainingTraceValidationError(`${where}.accuracy[${i}] must be an object`);
    }
    const r = a as Record<string, unknown>;
    requireString(r.taskId, `${where}.accuracy[${i}].taskId`);
    if (!taskIds.has(r.taskId as string)) {
      throw new TrainingTraceValidationError(
        `${where}.accuracy[${i}].taskId references unknown task: ${r.taskId}`,
      );
    }
    if (typeof r.value !== "number" || Number.isNaN(r.value)) {
      throw new TrainingTraceValidationError(
        `${where}.accuracy[${i}].value must be a finite number`,
      );
    }
    if ((r.value as number) < 0 || (r.value as number) > 1) {
      throw new TrainingTraceValidationError(
        `${where}.accuracy[${i}].value must be in [0, 1] (got ${r.value})`,
      );
    }
    if (seen.has(r.taskId as string)) {
      throw new TrainingTraceValidationError(
        `${where}.accuracy duplicate taskId: ${r.taskId}`,
      );
    }
    seen.add(r.taskId as string);
  });
  return blob as TaskAccuracy[];
}

function validateEpochs(
  blob: unknown,
  taskIds: Set<string>,
  limits: TrainingTraceValidatorLimits,
): TrainingEpoch[] {
  if (!Array.isArray(blob)) {
    throw new TrainingTraceValidationError("epochs must be an array");
  }
  if (blob.length === 0) {
    throw new TrainingTraceValidationError("epochs must not be empty");
  }
  if (blob.length > limits.maxEpochs) {
    throw new TrainingTraceValidationError(
      `epochs exceeds maxEpochs (${blob.length} > ${limits.maxEpochs})`,
    );
  }
  let totalAccuracyPoints = 0;
  let prevIndex = -1;
  blob.forEach((e, i) => {
    if (!e || typeof e !== "object") {
      throw new TrainingTraceValidationError(`epochs[${i}] must be an object`);
    }
    const r = e as Record<string, unknown>;
    if (typeof r.index !== "number" || !Number.isInteger(r.index) || r.index < 0) {
      throw new TrainingTraceValidationError(
        `epochs[${i}].index must be a non-negative integer`,
      );
    }
    if (r.index <= prevIndex) {
      throw new TrainingTraceValidationError(
        `epochs[${i}].index must be strictly increasing (got ${r.index} after ${prevIndex})`,
      );
    }
    prevIndex = r.index;
    if (!Array.isArray(r.activeTaskIds)) {
      throw new TrainingTraceValidationError(
        `epochs[${i}].activeTaskIds must be an array`,
      );
    }
    (r.activeTaskIds as unknown[]).forEach((id, j) => {
      if (typeof id !== "string") {
        throw new TrainingTraceValidationError(
          `epochs[${i}].activeTaskIds[${j}] must be a string`,
        );
      }
      if (!taskIds.has(id)) {
        throw new TrainingTraceValidationError(
          `epochs[${i}].activeTaskIds[${j}] references unknown task: ${id}`,
        );
      }
    });
    const accs = validateAccuracy(r.accuracy, taskIds, `epochs[${i}]`);
    totalAccuracyPoints += accs.length;
    if (totalAccuracyPoints > limits.maxAccuracyPoints) {
      throw new TrainingTraceValidationError(
        `total accuracy points exceeds maxAccuracyPoints (${totalAccuracyPoints} > ${limits.maxAccuracyPoints})`,
      );
    }
    if (r.modelState !== undefined) {
      const ms = r.modelState as Record<string, unknown>;
      if (ms.lossOnBatch !== undefined && typeof ms.lossOnBatch !== "number") {
        throw new TrainingTraceValidationError(
          `epochs[${i}].modelState.lossOnBatch must be a number`,
        );
      }
      if (ms.gradientNorm !== undefined && typeof ms.gradientNorm !== "number") {
        throw new TrainingTraceValidationError(
          `epochs[${i}].modelState.gradientNorm must be a number`,
        );
      }
    }
  });
  return blob as TrainingEpoch[];
}

function validateMetadata(blob: unknown): TrainingTraceMetadata {
  if (!blob || typeof blob !== "object") {
    throw new TrainingTraceValidationError("metadata must be an object");
  }
  const r = blob as Record<string, unknown>;
  requireString(r.description, "metadata.description");
  if (!VALID_ACCESS_TIERS.includes(r.accessTier as TrainingTraceMetadata["accessTier"])) {
    throw new TrainingTraceValidationError(
      `metadata.accessTier must be one of ${VALID_ACCESS_TIERS.join(", ")}`,
    );
  }
  if (r.citation !== undefined && typeof r.citation !== "string") {
    throw new TrainingTraceValidationError(
      "metadata.citation must be a string when present",
    );
  }
  return r as unknown as TrainingTraceMetadata;
}

/**
 * Validates an unknown blob as a TrainingTrace. Throws
 * TrainingTraceValidationError with a precise pointer on any
 * mismatch; returns a refined-type TrainingTrace on success.
 */
export function validateTrainingTrace(
  blob: unknown,
  limits: TrainingTraceValidatorLimits = DEFAULT_TRACE_LIMITS,
): TrainingTrace {
  if (!blob || typeof blob !== "object") {
    throw new TrainingTraceValidationError("body is not an object");
  }
  const t = blob as Record<string, unknown>;
  for (const k of ["id", "label", "source", "tasks", "epochs", "metadata"]) {
    requireField(t, k, "root");
  }
  requireString(t.id, "id");
  requireString(t.label, "label");
  const source = validateSource(t.source);
  const tasks = validateTasks(t.tasks, limits);
  const taskIds = new Set(tasks.map((tt) => tt.id));
  const epochs = validateEpochs(t.epochs, taskIds, limits);
  const metadata = validateMetadata(t.metadata);

  return {
    id: t.id as string,
    label: t.label as string,
    source,
    tasks,
    epochs,
    metadata,
  };
}
