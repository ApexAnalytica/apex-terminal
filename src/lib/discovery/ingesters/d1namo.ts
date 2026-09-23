// ─── D1NAMO Ingester ─────────────────────────────────────────────────
//
// Reads the JSON cohort produced by
// `research/scripts/build_d1namo_cohort.py` and validates it against
// the `Cohort` schema before returning.
//
// The Python script handles the heavy lifting (zip extraction, CSV
// parsing, datetime normalisation, subject de-identification — D1NAMO
// is already de-identified upstream but the adapter re-asserts it).
// This TS adapter is intentionally small: deserialise + assert + return.
//
// PRIVACY: the source data is CC-BY-SA-4.0 public. Subject ids are
// already opaque numeric (`d1namo-001` … `d1namo-009`) — there is no
// PHI to strip. The adapter still hard-asserts containsPHI=false.

import * as fs from "fs/promises";
import * as path from "path";
import type { CohortIngester, IngestOptions } from "../ingester-interface";
import type { Cohort, Measurement, Subject, Variable } from "../cohort-types";

const ADAPTER_ID = "d1namo";
const ADAPTER_VERSION = "0.1.0";

const DEFAULT_COHORT_PATH =
  "research/datasets/d1namo/cohort.json";

/**
 * Asserts the parsed JSON conforms to the Cohort schema. Throws with
 * a precise pointer on mismatch — better than a silent type cast.
 */
function assertCohort(parsed: unknown): asserts parsed is Cohort {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("d1namo: cohort json is not an object");
  }
  const c = parsed as Record<string, unknown>;

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
      throw new Error(`d1namo: cohort json missing required field "${key}"`);
    }
  }

  const source = c.source as Record<string, unknown>;
  if (source.containsPHI !== false) {
    throw new Error(
      `d1namo: source.containsPHI must be literal false, got ${JSON.stringify(source.containsPHI)}`,
    );
  }

  if (!Array.isArray(c.variables)) {
    throw new Error("d1namo: variables must be an array");
  }
  if (!Array.isArray(c.subjects)) {
    throw new Error("d1namo: subjects must be an array");
  }

  const varIds = new Set((c.variables as Variable[]).map((v) => v.id));
  for (const subj of c.subjects as Subject[]) {
    if (typeof subj.id !== "string" || subj.id.length === 0) {
      throw new Error("d1namo: subject without opaque id");
    }
    if (!Array.isArray(subj.measurements)) {
      throw new Error(`d1namo: subject ${subj.id} has no measurements array`);
    }
    for (const m of subj.measurements as Measurement[]) {
      if (!varIds.has(m.variableId)) {
        throw new Error(
          `d1namo: subject ${subj.id} references unknown variable "${m.variableId}"`,
        );
      }
      if (!Number.isFinite(m.t)) {
        throw new Error(
          `d1namo: subject ${subj.id} has non-finite t on ${m.variableId}`,
        );
      }
    }
  }
}

export interface D1namoIngestOptions extends IngestOptions {
  /** Optional override of the default cohort.json path (relative to cwd). */
  cohortJsonPath?: string;
}

export const d1namoIngester: CohortIngester<D1namoIngestOptions> = {
  id: ADAPTER_ID,
  version: ADAPTER_VERSION,
  description:
    "D1NAMO subset (Dubosson 2018) — 9 T1D subjects, 4 days each, " +
    "CGM + insulin + meals. Reads cohort.json produced by " +
    "research/scripts/build_d1namo_cohort.py.",
  conceptSystems: ["LOINC"],

  async ingest(sourcePath: string, options?: D1namoIngestOptions): Promise<Cohort> {
    const jsonPath =
      options?.cohortJsonPath ??
      path.join(sourcePath || ".", DEFAULT_COHORT_PATH);

    let raw: string;
    try {
      raw = await fs.readFile(jsonPath, "utf8");
    } catch (e) {
      throw new Error(
        `d1namo: cannot read ${jsonPath}. Did you run ` +
          `\`python research/scripts/build_d1namo_cohort.py\` first? ` +
          `Underlying error: ${(e as Error).message}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new Error(
        `d1namo: cohort.json is not valid JSON: ${(e as Error).message}`,
      );
    }

    assertCohort(parsed);
    let cohort: Cohort = parsed;

    // Apply ingest-options overrides.
    if (options?.cohortIdOverride) {
      cohort = { ...cohort, id: options.cohortIdOverride };
    }
    if (options?.ingestedAt) {
      cohort = {
        ...cohort,
        source: { ...cohort.source, ingestedAt: options.ingestedAt },
      };
    }
    if (options?.maxSubjects && cohort.subjects.length > options.maxSubjects) {
      cohort = {
        ...cohort,
        subjects: cohort.subjects.slice(0, options.maxSubjects),
      };
    }

    return cohort;
  },
};
