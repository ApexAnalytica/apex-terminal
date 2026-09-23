// @vitest-environment node
// Real fs / os / path access — happy-dom externalises Node built-ins
// and breaks these in Vercel's build env. Override globally-defaulted
// browser environment for this file only.
import { describe, it, expect } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

import { hallCgmIngester } from "../ingesters/hall-cgm";

// ─── Fixture ──────────────────────────────────────────────────────────
//
// Tiny synthetic-but-CSV-shape-correct fixture mirroring the Hall et al
// 2018 schema. Used only to exercise the ingester's parsing and
// validation logic; the production sample-run is computed from real
// Hall CGM CSV (committed runner script reads it from
// `research/datasets/hall/hall_cgm.csv`, gitignored).

const FIXTURE_CSV = [
  "id,time,gl,diagnosis",
  "1636-69-001,2014-02-03 08:42:12,93.0,diabetic",
  "1636-69-001,2014-02-03 08:47:12,95.0,diabetic",
  "1636-69-001,2014-02-03 08:52:12,99.0,diabetic",
  "2133-004,2015-04-10 12:00:00,140.0,pre-diabetic",
  "2133-004,2015-04-10 12:05:00,148.0,pre-diabetic",
  // Bad row — non-finite glucose, should be skipped silently.
  "broken-001,2015-04-10 13:00:00,NaN,diabetic",
].join("\n") + "\n";

async function withCsv<T>(
  csv: string,
  fn: (root: string) => Promise<T>,
): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hall-cgm-ingester-"));
  try {
    const dataDir = path.join(dir, "research", "datasets", "hall");
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(path.join(dataDir, "hall_cgm.csv"), csv);
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("hallCgmIngester", () => {
  it("parses the standard CSV shape and returns one Cohort", async () => {
    await withCsv(FIXTURE_CSV, async (root) => {
      const cohort = await hallCgmIngester.ingest(root);
      expect(cohort.id).toBe("hall-cgm-2018");
      expect(cohort.source.containsPHI).toBe(false);
      expect(cohort.source.adapter).toBe("hall-cgm");
      expect(cohort.variables).toHaveLength(1);
      expect(cohort.variables[0].id).toBe("cgm_glucose_mgdl");
      // 2 valid subjects (broken-001's only row is dropped → no subject).
      expect(cohort.subjects).toHaveLength(2);
      const s1 = cohort.subjects.find((s) => s.id === "hall-1636-69-001");
      const s2 = cohort.subjects.find((s) => s.id === "hall-2133-004");
      expect(s1?.measurements).toHaveLength(3);
      expect(s2?.measurements).toHaveLength(2);
    });
  });

  it("subject ids are prefixed and opaque (no PHI shape)", async () => {
    await withCsv(FIXTURE_CSV, async (root) => {
      const cohort = await hallCgmIngester.ingest(root);
      for (const s of cohort.subjects) {
        expect(s.id.startsWith("hall-")).toBe(true);
        // No emails, no SSN-like sequences, no DOB shapes — source ids
        // are already opaque, the prefix is just for cohort-namespacing.
        expect(s.id).not.toMatch(/@/);
        expect(s.id).not.toMatch(/\d{3}-\d{2}-\d{4}/);
      }
    });
  });

  it("measurement t starts at 0 for each subject (subject-session-start)", async () => {
    await withCsv(FIXTURE_CSV, async (root) => {
      const cohort = await hallCgmIngester.ingest(root);
      for (const s of cohort.subjects) {
        if (s.measurements.length === 0) continue;
        // Sorted ascending → first t === 0.
        expect(s.measurements[0].t).toBe(0);
      }
      expect(cohort.timeAxis.zeroConvention).toBe("subject-session-start");
    });
  });

  it("respects diagnosisFilter to keep only diabetic subjects", async () => {
    await withCsv(FIXTURE_CSV, async (root) => {
      const cohort = await hallCgmIngester.ingest(root, {
        diagnosisFilter: "diabetic",
      });
      expect(cohort.subjects).toHaveLength(1);
      expect(cohort.subjects[0].id).toBe("hall-1636-69-001");
      expect(cohort.subjects[0].demographics?.diagnosis).toBe("diabetic");
    });
  });

  it("respects maxSubjects and cohortIdOverride", async () => {
    await withCsv(FIXTURE_CSV, async (root) => {
      const cohort = await hallCgmIngester.ingest(root, {
        maxSubjects: 1,
        cohortIdOverride: "hall-cgm-test",
      });
      expect(cohort.subjects).toHaveLength(1);
      expect(cohort.id).toBe("hall-cgm-test");
    });
  });

  it("populates a stable sourceHash that changes with the CSV content", async () => {
    const a = await withCsv(FIXTURE_CSV, async (root) =>
      hallCgmIngester.ingest(root),
    );
    const variant = FIXTURE_CSV.replace("93.0", "94.5");
    const b = await withCsv(variant, async (root) =>
      hallCgmIngester.ingest(root),
    );
    expect(a.source.sourceHash).toBeDefined();
    expect(a.source.sourceHash).not.toBe(b.source.sourceHash);
  });

  it("rejects a totally empty CSV with a useful error", async () => {
    await withCsv("id,time,gl,diagnosis\n", async (root) => {
      await expect(hallCgmIngester.ingest(root)).rejects.toThrow(/zero rows/);
    });
  });

  it("returns a meaningful error when the CSV is missing", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hall-empty-"));
    try {
      await expect(hallCgmIngester.ingest(dir)).rejects.toThrow(
        /fetch_hall_cgm\.py/,
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
