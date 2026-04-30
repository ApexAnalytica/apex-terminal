// ─── Discovery — Normalised Cohort Schema ────────────────────────────
//
// A `Cohort` is the lingua franca every ingester writes to and every
// discovery algorithm reads from. Adapters (OhioT1DM, JAEB, Tidepool,
// Joslin, etc.) translate their source format into this shape; the
// algorithms above never touch raw source files.
//
// PRIVACY CONTRACT
// ----------------
// The `Cohort` schema deliberately has no place for direct identifiers.
// `Subject.id` MUST be opaque/hashed by the time it reaches a Cohort
// object — adapters that pull from PHI sources do their own
// de-identification. The `containsPHI` field is hard-flagged false so
// downstream code (UI, serializer, API) can assert that anything wearing
// this type is safe to surface.
//
// ENTERPRISE LADDER
// -----------------
// This schema was designed for solo use today and multi-tenant tomorrow.
// Every cohort is namespaced by `id`; multi-tenant separation is just a
// naming convention layered on top (e.g. `<tenant>__<cohort>`). No
// schema migration needed when the deployment shape changes.

/**
 * Concept-coding so cohorts speak in standard medical vocabularies.
 * SNOMED-CT for clinical entities and events, LOINC for measurements,
 * ICD-10 for diagnoses. Optional today; required when an institutional
 * partner cohort is loaded so cross-cohort joins become possible.
 */
export interface ConceptCode {
  system: "LOINC" | "SNOMED-CT" | "ICD-10" | "RxNorm" | "UCUM";
  code: string;
}

/**
 * One column / signal in a cohort. The variable set is shared across
 * subjects — every subject is sampled on the same `Variable[]`, even
 * if some subjects have missing measurements for a given variable.
 */
export interface Variable {
  /** Machine id, stable across runs (e.g. "cgm_glucose_mgdl"). */
  id: string;
  /** Human label for UI display. */
  label: string;
  /** Standard concept coding — required when cross-cohort join is needed. */
  conceptCode?: ConceptCode;
  /** UCUM-style unit (e.g. "mg/dL", "U/h", "boolean"). */
  unit?: string;
  /** Distinguishes scalar measurements from categorical/event signals. */
  kind: "continuous" | "discrete" | "event" | "binary";
  /**
   * Sampling cadence in seconds. CGM at 5-minute cadence = 300; visit-
   * level labs are bursty and pass `undefined`. Algorithms use this to
   * pick lag windows automatically.
   */
  cadenceSeconds?: number;
}

/**
 * A single measurement: which variable, when, what value. `t` is in the
 * cohort's time-axis units (see `TimeAxis.displayUnit`) but stored as
 * seconds since the cohort's time-zero so cross-cadence math is
 * dimensionally clean.
 */
export interface Measurement {
  variableId: string;
  /** Seconds since the cohort's time-zero (set by `TimeAxis.zeroConvention`). */
  t: number;
  /** Numeric for continuous/binary; string token for categorical. */
  value: number | string;
}

/**
 * One subject. `id` is opaque — the adapter is responsible for
 * de-identification before returning a Cohort. `demographics` may
 * carry low-cardinality, non-PHI summary fields (age band, biological
 * sex) but never anything that could re-identify a subject.
 */
export interface Subject {
  id: string;
  demographics?: Record<string, string | number>;
  measurements: Measurement[];
}

/**
 * Cohort-level time-axis convention — every measurement is offset from
 * a single time-zero. This stays opaque to the algorithm layer; it's
 * carried through so the UI can re-display in human units.
 */
export interface TimeAxis {
  /**
   * What does t=0 mean for this cohort? Examples:
   *   - "session-start"      — first measurement of the recording session
   *   - "diagnosis-date"     — date of T1D diagnosis
   *   - "trial-randomization"
   *   - "infusion-day-zero"
   */
  zeroConvention: string;
  /** UI display unit. Conversion factor against seconds is implicit. */
  displayUnit: "seconds" | "minutes" | "hours" | "days";
}

/**
 * Provenance of the cohort: which adapter produced it, what source it
 * was built from, when it landed. Hashes let us detect data drift
 * across re-runs.
 */
export interface CohortSource {
  /** Adapter id (e.g. "ohio-t1dm-xml"). */
  adapter: string;
  /** Adapter version for reproducibility. */
  adapterVersion: string;
  /**
   * SHA-256 of the underlying source files (or a manifest of them).
   * Optional but recommended — discovery results are reproducible only
   * if the source bytes are too.
   */
  sourceHash?: string;
  /** ISO 8601 timestamp of when this Cohort object was assembled. */
  ingestedAt: string;
  /**
   * Hard-flag: does this cohort carry direct identifiers?
   *
   * Always `false` — the schema has nowhere for PHI to live, and the
   * type system enforces that any adapter producing a Cohort has
   * de-identified its output. UI / serializer / API code can rely on
   * this to assert "anything wearing this type is safe to surface."
   */
  containsPHI: false;
}

/**
 * Free-form study metadata for the cohort. Lives separately from the
 * data so a UI can render a study card without loading the measurement
 * payload.
 */
export interface CohortMetadata {
  description: string;
  citation?: string;
  irbStatement?: string;
  /** How is the cohort licensed? Public, DUA-restricted, internal-only. */
  accessTier: "public" | "dua-restricted" | "internal-only";
}

/**
 * The unit of ingestion. Every adapter returns one of these; every
 * algorithm reads one of these. Nothing else has access to the raw
 * source.
 */
export interface Cohort {
  /** Stable cohort id (e.g. "ohio-t1dm-2018"). */
  id: string;
  /** Human-readable label for the UI. */
  label: string;
  /** Provenance — where this came from. */
  source: CohortSource;
  /** Variable set every subject is sampled on. */
  variables: Variable[];
  /** Subject records. */
  subjects: Subject[];
  /** Time-axis convention. */
  timeAxis: TimeAxis;
  /** Study-level metadata. */
  metadata: CohortMetadata;
}
