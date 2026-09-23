// ─── Hall CGM Ingester ────────────────────────────────────────────────
//
// Reads the Hall et al 2018 CGM CSV (Stanford "Glucotypes" study,
// PLoS Biology) into a normalised Cohort. Used as the second public
// CGM substrate for validation runs alongside D1NAMO.
//
// PRIVACY: Hall et al published the data publicly through the iglu R
// package. Subject ids are already opaque (`1636-69-001`,
// `2133-004`, etc.) — there is no PHI. The adapter still asserts
// containsPHI=false on the way out.
//
// SCOPE: Hall is T2D + pre-diabetic, not T1D. We use it as a publicly-
// available real CGM substrate to test whether validation findings
// (e.g. F sub-score behaviour from PR #200's csd-fit-hypo-calibrator)
// generalise across populations and CGM hardware. Hypoglycemic events
// are rarer here than in D1NAMO (~1.7% vs 11.85% of timestamps), which
// is part of the test — does the calibrator stay well-behaved on a
// substrate where the positive class is sparse?
//
// CSV shape (one row per CGM reading):
//   id,time,gl,diagnosis
//   1636-69-001,2014-02-03 08:42:12,93.0,diabetic
//
// Time is parsed as a UTC ISO timestamp; we emit measurements with
// `t` = seconds-since-subject-session-start so each subject's
// timeline starts at 0 (matches d1namoIngester semantics).

import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import type { CohortIngester, IngestOptions } from "../ingester-interface";
import type {
  Cohort,
  Measurement,
  Subject,
  Variable,
} from "../cohort-types";

const ADAPTER_ID = "hall-cgm";
const ADAPTER_VERSION = "0.1.0";

const DEFAULT_CSV_PATH = "research/datasets/hall/hall_cgm.csv";

const VAR_GLUCOSE: Variable = {
  id: "cgm_glucose_mgdl",
  label: "CGM glucose",
  kind: "continuous",
  cadenceSeconds: 300,
  conceptCode: { system: "LOINC", code: "2345-7" }, // Glucose [Mass/volume] in Serum or Plasma
};

export interface HallCgmIngestOptions extends IngestOptions {
  /** Override of the default CSV path (relative to cwd). */
  csvPath?: string;
  /** Filter to a specific diagnosis ("diabetic" / "pre-diabetic"). */
  diagnosisFilter?: "diabetic" | "pre-diabetic";
}

interface RawRow {
  id: string;
  time: string;
  gl: number;
  diagnosis: string;
}

function parseCsv(text: string): RawRow[] {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return [];
  const header = lines[0].split(",");
  const idIdx = header.indexOf("id");
  const timeIdx = header.indexOf("time");
  const glIdx = header.indexOf("gl");
  const dxIdx = header.indexOf("diagnosis");
  if (idIdx < 0 || timeIdx < 0 || glIdx < 0) {
    throw new Error(
      `hall-cgm: CSV missing required columns. Got: ${header.join(",")}`,
    );
  }
  const rows: RawRow[] = [];
  for (let li = 1; li < lines.length; li++) {
    const line = lines[li];
    if (!line) continue;
    const cells = line.split(",");
    if (cells.length < 3) continue;
    const gl = Number(cells[glIdx]);
    if (!Number.isFinite(gl)) continue;
    rows.push({
      id: cells[idIdx],
      time: cells[timeIdx],
      gl,
      diagnosis: dxIdx >= 0 ? cells[dxIdx] : "",
    });
  }
  return rows;
}

function buildCohortFromRows(
  rows: RawRow[],
  options: HallCgmIngestOptions | undefined,
  rawText: string,
): Cohort {
  const filtered = options?.diagnosisFilter
    ? rows.filter((r) => r.diagnosis === options.diagnosisFilter)
    : rows;

  const bySubject = new Map<string, RawRow[]>();
  for (const r of filtered) {
    const arr = bySubject.get(r.id);
    if (arr) arr.push(r);
    else bySubject.set(r.id, [r]);
  }

  const subjectIds = Array.from(bySubject.keys()).sort();
  const subjects: Subject[] = [];
  for (const sid of subjectIds) {
    const subjRows = bySubject.get(sid)!;
    subjRows.sort((a, b) => a.time.localeCompare(b.time));
    const t0 = Date.parse(subjRows[0].time);
    if (!Number.isFinite(t0)) continue;
    const measurements: Measurement[] = [];
    for (const r of subjRows) {
      const tMs = Date.parse(r.time);
      if (!Number.isFinite(tMs)) continue;
      measurements.push({
        variableId: VAR_GLUCOSE.id,
        t: Math.round((tMs - t0) / 1000), // seconds since subject t0
        value: r.gl,
      });
    }
    if (measurements.length === 0) continue;
    subjects.push({
      id: `hall-${sid}`,
      measurements,
      // No private demographics in the CSV; record the diagnosis tag
      // since it's already public in the source dataset.
      demographics: { diagnosis: subjRows[0].diagnosis },
    });
  }

  if (options?.maxSubjects && subjects.length > options.maxSubjects) {
    subjects.length = options.maxSubjects;
  }

  const sourceHash = crypto
    .createHash("sha256")
    .update(rawText)
    .digest("hex");

  return {
    id: options?.cohortIdOverride ?? "hall-cgm-2018",
    label:
      "Hall et al 2018 — 19 T2D / pre-diabetic subjects, ~5-min CGM (PLoS Biology)",
    source: {
      adapter: ADAPTER_ID,
      adapterVersion: ADAPTER_VERSION,
      sourceHash,
      ingestedAt: options?.ingestedAt ?? new Date().toISOString(),
      containsPHI: false,
    },
    variables: [VAR_GLUCOSE],
    subjects,
    timeAxis: {
      zeroConvention: "subject-session-start",
      displayUnit: "seconds",
    },
    metadata: {
      description:
        "Hall et al 2018 'Glucotypes reveal new patterns of glucose " +
        "dysregulation' (PLoS Biology). 19 T2D + pre-diabetic subjects, " +
        "~1800 CGM samples each at 5-min cadence. Public dataset shipped " +
        "via the iglu R package; see " +
        "https://raw.githubusercontent.com/irinagain/iglu/master/data/example_data_hall.rda. " +
        "Used here as a second public CGM substrate for validation runs.",
      accessTier: "public",
    },
  };
}

export const hallCgmIngester: CohortIngester<HallCgmIngestOptions> = {
  id: ADAPTER_ID,
  version: ADAPTER_VERSION,
  description:
    "Hall et al 2018 (Stanford Glucotypes) — 19 T2D / pre-diabetic " +
    "subjects, ~5-min CGM. CSV-backed; subject ids already opaque in source.",
  conceptSystems: ["LOINC"],

  async ingest(sourcePath: string, options?: HallCgmIngestOptions): Promise<Cohort> {
    const csvPath =
      options?.csvPath ?? path.join(sourcePath || ".", DEFAULT_CSV_PATH);

    let raw: string;
    try {
      raw = await fs.readFile(csvPath, "utf8");
    } catch (e) {
      throw new Error(
        `hall-cgm: cannot read ${csvPath}. Did you run ` +
          `\`python research/scripts/fetch_hall_cgm.py\` first? ` +
          `Underlying error: ${(e as Error).message}`,
      );
    }
    const rows = parseCsv(raw);
    if (rows.length === 0) {
      throw new Error(`hall-cgm: ${csvPath} parsed to zero rows`);
    }
    return buildCohortFromRows(rows, options, raw);
  },
};
