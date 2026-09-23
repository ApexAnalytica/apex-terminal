// ─── Discovery — Cohort Validator ────────────────────────────────────
//
// Runtime validator for `Cohort` objects arriving from untrusted
// sources (the API surface). The TS type system enforces the schema
// at compile time; this file enforces it at runtime so a malicious or
// malformed POST body can't bypass the privacy contract.
//
// Privacy contract (load-bearing):
//   - source.containsPHI MUST be the literal `false`
//   - subject.id MUST be a non-empty string (no PHI shape check —
//     adapters de-identify upstream; we just enforce structural
//     opacity here)
//
// Size contract:
//   - capped subjects / variables / measurements so a runaway cohort
//     can't OOM the worker

import type { Cohort, Measurement, Subject, Variable } from "./cohort-types";

export interface CohortValidatorLimits {
  maxSubjects: number;
  maxVariables: number;
  maxMeasurements: number;
}

export const DEFAULT_LIMITS: CohortValidatorLimits = {
  maxSubjects: 100,
  maxVariables: 50,
  maxMeasurements: 50_000,
};

export class CohortValidationError extends Error {
  constructor(message: string) {
    super(`cohort validation failed: ${message}`);
    this.name = "CohortValidationError";
  }
}

/**
 * Validates an unknown blob as a Cohort. Throws CohortValidationError
 * with a precise pointer on any mismatch. Returns the Cohort on
 * success (with a refined type).
 */
export function validateCohort(
  blob: unknown,
  limits: CohortValidatorLimits = DEFAULT_LIMITS,
): Cohort {
  if (!blob || typeof blob !== "object") {
    throw new CohortValidationError("body is not an object");
  }
  const c = blob as Record<string, unknown>;

  for (const key of [
    "id",
    "label",
    "source",
    "variables",
    "subjects",
    "timeAxis",
    "metadata",
  ]) {
    if (!(key in c)) {
      throw new CohortValidationError(`missing required field "${key}"`);
    }
  }

  if (typeof c.id !== "string" || c.id.length === 0) {
    throw new CohortValidationError("id must be a non-empty string");
  }
  if (typeof c.label !== "string") {
    throw new CohortValidationError("label must be a string");
  }

  // ── Source / privacy contract ──────────────────────────────────
  const source = c.source as Record<string, unknown> | null;
  if (!source || typeof source !== "object") {
    throw new CohortValidationError("source must be an object");
  }
  if (source.containsPHI !== false) {
    throw new CohortValidationError(
      `source.containsPHI must be the literal false, got ${JSON.stringify(source.containsPHI)}`,
    );
  }
  for (const key of ["adapter", "adapterVersion", "ingestedAt"]) {
    if (typeof source[key] !== "string") {
      throw new CohortValidationError(
        `source.${key} must be a string`,
      );
    }
  }

  // ── Variables ──────────────────────────────────────────────────
  if (!Array.isArray(c.variables)) {
    throw new CohortValidationError("variables must be an array");
  }
  if (c.variables.length === 0) {
    throw new CohortValidationError("variables must be non-empty");
  }
  if (c.variables.length > limits.maxVariables) {
    throw new CohortValidationError(
      `${c.variables.length} variables exceeds limit ${limits.maxVariables}`,
    );
  }
  const varIds = new Set<string>();
  const validKinds = new Set(["continuous", "discrete", "event", "binary"]);
  for (const v of c.variables as Variable[]) {
    if (typeof v.id !== "string" || v.id.length === 0) {
      throw new CohortValidationError("variable.id must be a non-empty string");
    }
    if (varIds.has(v.id)) {
      throw new CohortValidationError(`duplicate variable id: ${v.id}`);
    }
    varIds.add(v.id);
    if (typeof v.label !== "string") {
      throw new CohortValidationError(`variable ${v.id}: label must be a string`);
    }
    if (!validKinds.has(v.kind)) {
      throw new CohortValidationError(
        `variable ${v.id}: kind must be one of ${[...validKinds].join("/")}`,
      );
    }
  }

  // ── Subjects + measurements ────────────────────────────────────
  if (!Array.isArray(c.subjects)) {
    throw new CohortValidationError("subjects must be an array");
  }
  if (c.subjects.length === 0) {
    throw new CohortValidationError("subjects must be non-empty");
  }
  if (c.subjects.length > limits.maxSubjects) {
    throw new CohortValidationError(
      `${c.subjects.length} subjects exceeds limit ${limits.maxSubjects}`,
    );
  }
  let totalMeasurements = 0;
  const subjectIds = new Set<string>();
  for (const s of c.subjects as Subject[]) {
    if (typeof s.id !== "string" || s.id.length === 0) {
      throw new CohortValidationError("subject without opaque id");
    }
    if (subjectIds.has(s.id)) {
      throw new CohortValidationError(`duplicate subject id: ${s.id}`);
    }
    subjectIds.add(s.id);
    if (!Array.isArray(s.measurements)) {
      throw new CohortValidationError(
        `subject ${s.id}: measurements must be an array`,
      );
    }
    for (const m of s.measurements as Measurement[]) {
      if (!varIds.has(m.variableId)) {
        throw new CohortValidationError(
          `subject ${s.id}: unknown variable "${m.variableId}"`,
        );
      }
      if (!Number.isFinite(m.t)) {
        throw new CohortValidationError(
          `subject ${s.id}: non-finite t on ${m.variableId}`,
        );
      }
      if (
        typeof m.value !== "number" &&
        typeof m.value !== "string"
      ) {
        throw new CohortValidationError(
          `subject ${s.id}: value must be number or string on ${m.variableId}`,
        );
      }
    }
    totalMeasurements += s.measurements.length;
    if (totalMeasurements > limits.maxMeasurements) {
      throw new CohortValidationError(
        `total measurements (${totalMeasurements}+) exceeds limit ${limits.maxMeasurements}`,
      );
    }
  }

  // ── timeAxis + metadata (lighter checks) ───────────────────────
  const timeAxis = c.timeAxis as Record<string, unknown> | null;
  if (!timeAxis || typeof timeAxis !== "object") {
    throw new CohortValidationError("timeAxis must be an object");
  }
  if (typeof timeAxis.zeroConvention !== "string") {
    throw new CohortValidationError("timeAxis.zeroConvention must be a string");
  }
  const md = c.metadata as Record<string, unknown> | null;
  if (!md || typeof md !== "object") {
    throw new CohortValidationError("metadata must be an object");
  }
  if (typeof md.description !== "string") {
    throw new CohortValidationError("metadata.description must be a string");
  }

  return blob as Cohort;
}
