// ─── Discovery — JSON Training-Trace Adapter ──────────────────────────
//
// Phase 3 PR 5 of the Ghauri 2025 dissertation integration. Reads a
// JSON payload matching the TrainingTrace schema (or close to it),
// validates it, and stamps `source.kind = "live"` so downstream
// estimators (FR, Ω-Forgetting Pressure) and their UI surfaces flip
// from SYNTHETIC badge → LIVE.
//
// CONTRACT
// --------
// Input JSON must conform to the TrainingTrace schema with one
// exception: the `source` block may be omitted or partial — this
// adapter fills in the missing fields:
//   - `source.adapter` defaults to `"json-v1"`
//   - `source.adapterVersion` defaults to this file's version
//   - `source.kind` is FORCED to `"live"` regardless of what the
//     payload claims. Synthetic traces have a dedicated builder
//     (`buildSyntheticTrainingTrace`); they don't come through this
//     adapter.
//   - `source.builtAt` defaults to the current ISO timestamp
//
// The adapter does NOT trust client-supplied `source.kind` values.
// Letting a payload claim `kind: "synthetic"` could cause the UI to
// SUPPRESS its synthetic badge when in fact the data IS synthetic.
// Letting a payload claim `kind: "live"` is what this adapter does
// by definition, but only as a result of the customer's explicit
// upload action — never inferred from the payload itself.
//
// SECURITY
// --------
// The validator catches structurally bad payloads. Hard ceilings on
// task / epoch / point counts (from `DEFAULT_TRACE_LIMITS`) bound
// memory before any downstream computation runs.

import {
  DEFAULT_TRACE_LIMITS,
  TrainingTraceValidationError,
  validateTrainingTrace,
  type TrainingTraceValidatorLimits,
} from "./training-trace-validator";
import type { TrainingTrace } from "./training-trace-types";

export const JSON_ADAPTER_ID = "json-v1";
export const JSON_ADAPTER_VERSION = "0.1.0";

export interface LoadFromJSONOptions {
  /**
   * Override the trace id. Useful when the source JSON doesn't carry
   * one (or carries a non-opaque one the platform shouldn't trust).
   */
  idOverride?: string;
  /** Override the human label. */
  labelOverride?: string;
  /**
   * Override the validator limits. Defaults to `DEFAULT_TRACE_LIMITS`.
   * Tightening these is the right move for customer-facing endpoints
   * where memory budgets are bounded.
   */
  limits?: TrainingTraceValidatorLimits;
  /**
   * ISO timestamp to stamp on `source.builtAt`. Default: `new
   * Date().toISOString()`. Pinning this is useful for tests.
   */
  ingestedAt?: string;
  /**
   * Optional SHA-256 of the original artifact, for reproducibility.
   * Pass-through into `source.sourceHash`.
   */
  sourceHash?: string;
}

/**
 * Parse a JSON string (or pre-parsed object) into a validated
 * `TrainingTrace` with `source.kind = "live"`.
 *
 * Throws `TrainingTraceValidationError` on any structural mismatch.
 * Throws `SyntaxError` if the input is a string that doesn't parse.
 */
export function loadTrainingTraceFromJSON(
  input: string | unknown,
  options: LoadFromJSONOptions = {},
): TrainingTrace {
  const parsed: unknown =
    typeof input === "string" ? JSON.parse(input) : input;
  if (parsed === null || typeof parsed !== "object") {
    throw new TrainingTraceValidationError(
      "expected an object at the JSON root",
    );
  }
  const obj = parsed as Record<string, unknown>;

  // Merge overrides BEFORE validation so the validator sees the final
  // shape. We don't mutate the input — clone via shallow merge.
  const idOverride = options.idOverride;
  const labelOverride = options.labelOverride;
  const ingestedAt = options.ingestedAt ?? new Date().toISOString();

  // Build the source block. Customer-supplied `kind` is IGNORED —
  // this adapter always stamps "live". The adapter id is fixed.
  const incomingSource =
    obj.source && typeof obj.source === "object"
      ? (obj.source as Record<string, unknown>)
      : {};
  const source = {
    adapter: JSON_ADAPTER_ID,
    adapterVersion: JSON_ADAPTER_VERSION,
    kind: "live" as const,
    builtAt: ingestedAt,
    ...(options.sourceHash !== undefined
      ? { sourceHash: options.sourceHash }
      : typeof incomingSource.sourceHash === "string"
        ? { sourceHash: incomingSource.sourceHash }
        : {}),
  };

  const candidate: Record<string, unknown> = {
    ...obj,
    source,
  };
  if (idOverride !== undefined) candidate.id = idOverride;
  if (labelOverride !== undefined) candidate.label = labelOverride;

  return validateTrainingTrace(
    candidate,
    options.limits ?? DEFAULT_TRACE_LIMITS,
  );
}
