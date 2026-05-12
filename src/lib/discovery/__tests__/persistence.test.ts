// @vitest-environment node
//
// Persistence layer unit tests. The Supabase client is mocked so these
// tests don't depend on a real DB / network. Verifies:
//   - graceful degrade under stub env (or no service client)
//   - successful insert path
//   - error path (insert fails, function returns {persisted:false})
//   - row ↔ DiscoveryRun round-trip
//   - getRun null on miss / null on service error
//   - listRuns ordering / filter / limit

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  persistRun,
  getRun,
  listRuns,
  setServiceClientForTesting,
  isPersistenceAvailable,
  probeDiscoveryTable,
} from "../persistence";
import type { DiscoveryRun } from "../run-types";

// ─── Helpers ──────────────────────────────────────────────────────────

function makeRun(overrides: Partial<DiscoveryRun> = {}): DiscoveryRun {
  return {
    id: "run-001",
    cohortId: "test-cohort",
    cohortSourceHash: "deadbeef",
    algorithm: { id: "lag-correlation", version: "0.1.0" },
    params: { alpha: 0.05 },
    startedAt: "2026-05-02T00:00:00Z",
    completedAt: "2026-05-02T00:00:01Z",
    status: "succeeded",
    result: {
      variables: ["x", "y"],
      edges: [
        {
          source: "x",
          target: "y",
          strength: 0.8,
          evidence: "test",
        },
      ],
    },
    ...overrides,
  };
}

/** Fluent fake matching the slice of the Supabase JS API we use. */
function makeFakeServiceClient(opts: {
  insertResult?: { error: { message: string } | null };
  selectMaybeSingle?: { data: unknown; error: { message: string } | null };
  selectList?: { data: unknown[]; error: { message: string } | null };
} = {}) {
  const insertSpy = vi.fn().mockResolvedValue(
    opts.insertResult ?? { error: null },
  );
  const lastQuery: { eqs: Array<[string, string]>; limit?: number; order?: string } = {
    eqs: [],
  };
  const single = vi.fn().mockResolvedValue(
    opts.selectMaybeSingle ?? { data: null, error: null },
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queryBuilder: any = {
    insert: insertSpy,
    select() {
      return queryBuilder;
    },
    eq(col: string, val: string) {
      lastQuery.eqs.push([col, val]);
      return queryBuilder;
    },
    order(col: string) {
      lastQuery.order = col;
      return queryBuilder;
    },
    limit(n: number) {
      lastQuery.limit = n;
      return Promise.resolve(
        opts.selectList ?? { data: [], error: null },
      );
    },
    maybeSingle: single,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fake: any = {
    from: vi.fn().mockReturnValue(queryBuilder),
  };
  return { fake, insertSpy, single, lastQuery };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("persistence — graceful degrade", () => {
  beforeEach(() => {
    setServiceClientForTesting(null);
  });
  afterEach(() => {
    setServiceClientForTesting(null);
  });

  it("isPersistenceAvailable() reports false when no service client wired", () => {
    expect(isPersistenceAvailable()).toBe(false);
  });

  it("persistRun returns {persisted:false, reason:'service-unavailable'} when no service", async () => {
    const r = await persistRun(makeRun());
    expect(r.persisted).toBe(false);
    expect(r.reason).toBe("service-unavailable");
  });

  it("getRun returns null when no service", async () => {
    expect(await getRun("run-001")).toBeNull();
  });

  it("listRuns returns [] when no service", async () => {
    expect(await listRuns()).toEqual([]);
  });
});

describe("persistence — service connected", () => {
  beforeEach(() => {
    setServiceClientForTesting(null);
  });
  afterEach(() => {
    setServiceClientForTesting(null);
  });

  it("persistRun translates DiscoveryRun → DB row and inserts", async () => {
    const { fake, insertSpy } = makeFakeServiceClient();
    setServiceClientForTesting(fake);

    const r = await persistRun(makeRun());
    expect(r.persisted).toBe(true);
    expect(insertSpy).toHaveBeenCalledTimes(1);

    const insertedRow = insertSpy.mock.calls[0][0];
    expect(insertedRow.id).toBe("run-001");
    expect(insertedRow.cohort_id).toBe("test-cohort");
    expect(insertedRow.cohort_source_hash).toBe("deadbeef");
    expect(insertedRow.algorithm_id).toBe("lag-correlation");
    expect(insertedRow.algorithm_version).toBe("0.1.0");
    expect(insertedRow.status).toBe("succeeded");
    expect(insertedRow.result.edges).toHaveLength(1);
  });

  it("persistRun returns {persisted:false, reason:<msg>} on insert error", async () => {
    const { fake } = makeFakeServiceClient({
      insertResult: { error: { message: "duplicate key" } },
    });
    setServiceClientForTesting(fake);

    const r = await persistRun(makeRun());
    expect(r.persisted).toBe(false);
    expect(r.reason).toBe("duplicate key");
  });

  it("persistRun never throws on unexpected client error", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exploding: any = {
      from: () => {
        throw new Error("network died");
      },
    };
    setServiceClientForTesting(exploding);
    const r = await persistRun(makeRun());
    expect(r.persisted).toBe(false);
    expect(r.reason).toMatch(/network died/);
  });

  it("getRun translates DB row → DiscoveryRun on hit", async () => {
    const { fake } = makeFakeServiceClient({
      selectMaybeSingle: {
        data: {
          id: "run-002",
          cohort_id: "c2",
          cohort_source_hash: null,
          algorithm_id: "pcmci-linear",
          algorithm_version: "0.1.0",
          params: {},
          started_at: "2026-05-02T00:00:00Z",
          completed_at: "2026-05-02T00:00:01Z",
          status: "succeeded",
          error: null,
          result: { variables: ["x"], edges: [] },
        },
        error: null,
      },
    });
    setServiceClientForTesting(fake);

    const run = await getRun("run-002");
    expect(run).not.toBeNull();
    expect(run!.id).toBe("run-002");
    expect(run!.cohortId).toBe("c2");
    expect(run!.cohortSourceHash).toBeUndefined(); // null → undefined
    expect(run!.algorithm.id).toBe("pcmci-linear");
  });

  it("getRun returns null on miss", async () => {
    const { fake } = makeFakeServiceClient({
      selectMaybeSingle: { data: null, error: null },
    });
    setServiceClientForTesting(fake);
    expect(await getRun("nonexistent")).toBeNull();
  });

  it("getRun returns null on db error", async () => {
    const { fake } = makeFakeServiceClient({
      selectMaybeSingle: { data: null, error: { message: "boom" } },
    });
    setServiceClientForTesting(fake);
    expect(await getRun("any")).toBeNull();
  });

  it("listRuns applies filters and respects the 200 hard cap", async () => {
    const { fake, lastQuery } = makeFakeServiceClient({
      selectList: { data: [], error: null },
    });
    setServiceClientForTesting(fake);

    await listRuns({ cohortId: "c1", algorithmId: "lag-correlation", limit: 500 });
    expect(lastQuery.eqs).toEqual([
      ["cohort_id", "c1"],
      ["algorithm_id", "lag-correlation"],
    ]);
    expect(lastQuery.limit).toBe(200); // hard-capped from 500
    expect(lastQuery.order).toBe("created_at");
  });

  it("listRuns returns rowToRun-mapped runs", async () => {
    const { fake } = makeFakeServiceClient({
      selectList: {
        data: [
          {
            id: "run-A",
            cohort_id: "c1",
            cohort_source_hash: "hashA",
            algorithm_id: "lag-correlation",
            algorithm_version: "0.1.0",
            params: {},
            started_at: "2026-05-02T00:00:00Z",
            completed_at: "2026-05-02T00:00:01Z",
            status: "succeeded",
            error: null,
            result: { variables: [], edges: [] },
          },
        ],
        error: null,
      },
    });
    setServiceClientForTesting(fake);

    const runs = await listRuns({ limit: 10 });
    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe("run-A");
    expect(runs[0].cohortSourceHash).toBe("hashA");
  });
});

// ─── probeDiscoveryTable — deploy-state diagnostic ──────────────────

/**
 * Fake supabase client whose `select("*", { count, head })` resolves
 * with the configured probe result. Used by the probe tests below.
 * Kept separate from the main fake because the count+head variant
 * resolves directly (the builder is await-able) rather than chaining
 * through .order().limit().
 */
function makeProbeServiceClient(probeResult: {
  count?: number | null;
  error?: { message: string } | null;
}) {
  const selectSpy = vi.fn().mockResolvedValue({
    count: probeResult.count ?? null,
    error: probeResult.error ?? null,
    data: null,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fake: any = {
    from: vi.fn().mockReturnValue({
      select: selectSpy,
    }),
  };
  return { fake, selectSpy };
}

describe("probeDiscoveryTable", () => {
  beforeEach(() => {
    setServiceClientForTesting(null);
  });
  afterEach(() => {
    setServiceClientForTesting(null);
  });

  it("envWired=false / tableExists=null / rowCount=null when no service client", async () => {
    const r = await probeDiscoveryTable();
    expect(r.envWired).toBe(false);
    expect(r.tableExists).toBeNull();
    expect(r.rowCount).toBeNull();
    expect(r.error).toBeNull();
  });

  it("envWired=true / tableExists=true / rowCount=N on successful probe", async () => {
    const { fake, selectSpy } = makeProbeServiceClient({ count: 42 });
    setServiceClientForTesting(fake);

    const r = await probeDiscoveryTable();
    expect(r.envWired).toBe(true);
    expect(r.tableExists).toBe(true);
    expect(r.rowCount).toBe(42);
    expect(r.error).toBeNull();

    // Verify the cheap-count shape: head:true + count:exact so no
    // rows are serialised.
    expect(selectSpy).toHaveBeenCalledWith("*", {
      count: "exact",
      head: true,
    });
  });

  it("envWired=true / tableExists=false / error=<msg> when SELECT fails", async () => {
    // What happens before the SQL migration has been run: the table
    // doesn't exist, supabase-js returns a 42P01 / 'relation does not
    // exist' error.
    const { fake } = makeProbeServiceClient({
      error: { message: 'relation "public.discovery_runs" does not exist' },
    });
    setServiceClientForTesting(fake);

    const r = await probeDiscoveryTable();
    expect(r.envWired).toBe(true);
    expect(r.tableExists).toBe(false);
    expect(r.rowCount).toBeNull();
    expect(r.error).toContain("does not exist");
  });

  it("rowCount=0 reads cleanly on an empty table", async () => {
    // The 'just deployed' state — table exists, no runs yet.
    const { fake } = makeProbeServiceClient({ count: 0 });
    setServiceClientForTesting(fake);

    const r = await probeDiscoveryTable();
    expect(r.envWired).toBe(true);
    expect(r.tableExists).toBe(true);
    expect(r.rowCount).toBe(0);
  });

  it("never throws on a client that explodes mid-call", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exploding: any = {
      from: () => {
        throw new Error("network died");
      },
    };
    setServiceClientForTesting(exploding);
    const r = await probeDiscoveryTable();
    expect(r.envWired).toBe(true);
    expect(r.tableExists).toBe(false);
    expect(r.error).toContain("network died");
  });
});
