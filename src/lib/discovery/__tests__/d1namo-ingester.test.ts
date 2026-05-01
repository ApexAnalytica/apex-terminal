import { describe, it, expect } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

import { d1namoIngester } from "../ingesters/d1namo";
import type { Cohort } from "../cohort-types";

// ─── Fixture ──────────────────────────────────────────────────────────
//
// Tiny in-memory cohort shape-identical to what
// `research/scripts/build_d1namo_cohort.py` writes. Used only to drive
// CI so tests don't depend on the 250 MB D1NAMO zip being downloaded.

const FIXTURE: Cohort = {
  id: "d1namo-2018",
  label: "fixture",
  source: {
    adapter: "d1namo",
    adapterVersion: "0.1.0",
    sourceHash: "fixturehash",
    ingestedAt: "2026-04-29T00:00:00Z",
    containsPHI: false,
  },
  variables: [
    {
      id: "cgm_glucose_mgdl",
      label: "CGM glucose",
      kind: "continuous",
      cadenceSeconds: 300,
    },
    {
      id: "insulin_fast_units",
      label: "Fast insulin",
      kind: "continuous",
    },
  ],
  subjects: [
    {
      id: "d1namo-001",
      measurements: [
        { variableId: "cgm_glucose_mgdl", t: 0, value: 110 },
        { variableId: "cgm_glucose_mgdl", t: 300, value: 115 },
      ],
    },
    {
      id: "d1namo-002",
      measurements: [
        { variableId: "cgm_glucose_mgdl", t: 0, value: 130 },
      ],
    },
    {
      id: "d1namo-003",
      measurements: [
        { variableId: "cgm_glucose_mgdl", t: 0, value: 95 },
      ],
    },
  ],
  timeAxis: { zeroConvention: "subject-session-start", displayUnit: "seconds" },
  metadata: {
    description: "fixture",
    accessTier: "public",
  },
};

async function withFixture<T>(
  cohort: Cohort,
  fn: (rootDir: string) => Promise<T>,
): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "d1namo-ingester-"));
  try {
    const cohortDir = path.join(dir, "research", "datasets", "d1namo");
    await fs.mkdir(cohortDir, { recursive: true });
    await fs.writeFile(
      path.join(cohortDir, "cohort.json"),
      JSON.stringify(cohort),
    );
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("d1namoIngester", () => {
  it("ingests a valid cohort.json and returns a Cohort object", async () => {
    await withFixture(FIXTURE, async (root) => {
      const cohort = await d1namoIngester.ingest(root);
      expect(cohort.id).toBe("d1namo-2018");
      expect(cohort.subjects).toHaveLength(3);
      expect(cohort.source.containsPHI).toBe(false);
    });
  });

  it("rejects a cohort whose source.containsPHI is not literal false", async () => {
    const bad = {
      ...FIXTURE,
      source: { ...FIXTURE.source, containsPHI: true as unknown as false },
    } as Cohort;
    await withFixture(bad, async (root) => {
      await expect(d1namoIngester.ingest(root)).rejects.toThrow(/containsPHI/);
    });
  });

  it("rejects a cohort with a measurement referencing an unknown variable", async () => {
    const bad: Cohort = {
      ...FIXTURE,
      subjects: [
        {
          id: "d1namo-001",
          measurements: [
            { variableId: "not_in_variables_list", t: 0, value: 1 },
          ],
        },
      ],
    };
    await withFixture(bad, async (root) => {
      await expect(d1namoIngester.ingest(root)).rejects.toThrow(/unknown variable/);
    });
  });

  it("respects the maxSubjects override", async () => {
    await withFixture(FIXTURE, async (root) => {
      const cohort = await d1namoIngester.ingest(root, { maxSubjects: 1 });
      expect(cohort.subjects).toHaveLength(1);
    });
  });

  it("respects the cohortIdOverride", async () => {
    await withFixture(FIXTURE, async (root) => {
      const cohort = await d1namoIngester.ingest(root, {
        cohortIdOverride: "d1namo-2018-test",
      });
      expect(cohort.id).toBe("d1namo-2018-test");
    });
  });

  it("returns a meaningful error when cohort.json is missing", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "d1namo-empty-"));
    try {
      await expect(d1namoIngester.ingest(dir)).rejects.toThrow(
        /build_d1namo_cohort\.py/,
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
