# Discovery — Causal Structure Discovery from Real Cohorts

The `src/lib/discovery/` module is Manifold's pipeline for taking a
real longitudinal cohort and producing a set of discovered causal
edges with provenance. It's how we move from "curated graphs from
literature" to "edges learned from data" — the foundation for the
**Spirtes** module's actual structure-discovery promise.

## What lives here

```
src/lib/discovery/
├── cohort-types.ts         — normalised cohort schema (the lingua franca)
├── run-types.ts            — discovery run + edge records (the audit unit)
├── ingester-interface.ts   — adapter contract for source-format → Cohort
├── algorithm-interface.ts  — discovery algorithm contract
├── ingesters/              — one file per source format (OhioT1DM, JAEB, …)
├── algorithms/             — one file per algorithm (PCMCI+, FCI, …)
└── __tests__/              — schema sanity + end-to-end fixtures
```

## The pipeline

```
  raw source files          ┌─ ingester ──┐    ┌─ algorithm ──┐    DiscoveryRun
  (XML / CSV / parquet) ──→ │  (de-id)    │ ──→│  (pure fn)   │ ──→  + JSON record
                            └─────────────┘    └──────────────┘      + edges
                                  Cohort           DiscoveryResult       │
                                                                         ▼
                                                             ┌─ UI: discovered edges
                                                             ├─ API: GET /api/runs/<id>
                                                             └─ audit log
```

Three contracts make the pipeline composable:

1. **`Cohort`** — the normalised data shape. Every adapter writes one;
   every algorithm reads one. Adapters never see source files; the
   algorithm layer never sees raw data.
2. **`CohortIngester`** — adapter interface. New data source = new file
   in `ingesters/`. The de-identification contract is in the type
   system: `Cohort.source.containsPHI` is hard-typed `false`.
3. **`DiscoveryAlgorithm<P>`** — algorithm interface. New algorithm =
   new file in `algorithms/`. Pure function — no side effects.

## Privacy contract

The schema has nowhere for direct identifiers to live. Adapters that
read from PHI sources do their own de-identification before returning a
`Cohort`. The `containsPHI: false` flag is a hard literal type — code
downstream of the schema (UI, API, serializers) can treat anything
wearing the `Cohort` type as safe to surface.

For sensitive personal data (e.g. a family member's CGM):
- Source files live under `research/datasets/<cohort-id>/raw/` —
  **gitignored at every level**.
- The adapter de-identifies on read; only the normalised `Cohort` is
  ever in memory after that.
- Discovery output (the `DiscoveryRun`) contains abstract structure
  only — variable ids, edges, lags, p-values. Never raw measurements.
- `DiscoveryRun` JSON files live under `research/runs/` — also
  gitignored, but the *abstract structure* in them can be safely
  shared (e.g. with a clinician) because it doesn't reconstruct the
  underlying trace.

## Enterprise ladder

This module is designed for solo use today and multi-tenant /
production deployment tomorrow. The ladder:

| Capability | Today | Tomorrow | Schema change? |
|---|---|---|---|
| Ingestion | Local file path | API upload / OAuth pull | None — only `ingest()` body changes |
| Multi-tenancy | Single user | RBAC + tenant isolation | None — namespace via `cohort.id` |
| Audit log | JSON files in `research/runs/` | Append-only store (S3 / SOC2-compliant DB) | None — `DiscoveryRun` is already the audit record |
| Algorithm execution | Sync, in-process | Async worker queue | None — algorithm interface is pure |
| Discovery output | UI tile | UI + API + downstream consumers | None — `DiscoveryResult` is API-shaped already |
| Reproducibility | Adapter version + cohortSourceHash | Same | Already wired |

The point: every load-bearing decision (the schema, the contracts,
the privacy flag, the provenance fields) is made *now* so future
enterprise work is plumbing, not architecture.

## How to add an adapter

```ts
// src/lib/discovery/ingesters/my-source.ts
import type { CohortIngester } from "../ingester-interface";
import type { Cohort } from "../cohort-types";

export const myAdapter: CohortIngester = {
  id: "my-source",
  version: "0.1.0",
  description: "Reads <SOURCE> and produces a normalised cohort.",
  conceptSystems: ["LOINC"],
  async ingest(sourcePath, options) {
    // 1. Parse source
    // 2. De-identify subject ids
    // 3. Map to Variable[] / Subject[] / Measurement[]
    // 4. Compute sourceHash
    // 5. Return Cohort with containsPHI: false
  },
};
```

## How to add an algorithm

```ts
// src/lib/discovery/algorithms/my-algo.ts
import type { DiscoveryAlgorithm } from "../algorithm-interface";

interface MyAlgoParams { alpha: number; maxLag: number; }

export const myAlgo: DiscoveryAlgorithm<MyAlgoParams> = {
  id: "my-algo",
  version: "0.1.0",
  description: "Discovers edges via <METHOD>.",
  defaultParams: { alpha: 0.05, maxLag: 12 },
  run(cohort, params) {
    const p = { ...this.defaultParams, ...params };
    // Pure: read cohort, return DiscoveryResult.
  },
};
```

## Roadmap

- **Now (this PR):** schemas + interfaces + sanity test.
- **PR+1:** synthetic cohort fixture + stub `lag-correlation` algorithm.
  Proves the loop end-to-end.
- **PR+2:** OhioT1DM ingester adapter. Real T1D data flowing in.
- **PR+3:** UI surface — discovered edges merge into the existing DAG
  view tagged `discoverySource: "<algorithm-id>"`.
- **PR+4:** `POST /api/discovery/run` and `GET /api/discovery/runs/<id>`.
  The API hook that lets a customer call Manifold from their pipeline.
- **Later:** PCMCI+ and FCI proper (the algorithms the Spirtes module
  promises in the Joslin / Mt Sinai / DRI Miami briefs).

The roadmap is one-PR-per-step on purpose: each step is a clean
mergeable unit, and any of them can be deprioritised without
unwinding earlier work.
