# Phase-2 Spirtes-live — scoping

**Status:** scoping draft, not yet implementation. Owned by the SPIRTES session.
Builds on the FCI work shipped 2026-05 (`src/lib/discovery/algorithms/fci.ts`,
v0.4) and the existing offline pipeline at `src/lib/discovery/`.

---

## 1. The goal — what "Spirtes-live" means concretely

The four right-panel SPIRTES views (DCD / PCMCI+ / FCI / StructuralMetrics)
currently render **precomputed** discovery tags from `src/lib/graph-data.ts`.
`discoverySource: "DCD" | "PCMCI+" | "FCI" | "merged"` and `isConfounded`
are static labels baked into the curated graph. The user looks at the FCI
panel and sees a curator's confounder hypotheses; they don't see *the
algorithm running*.

Spirtes-live closes that gap. The algorithms run on real data. The panels
display algorithm output, not labels. The end-state is:

- Open a domain in the workspace → its associated cohort loads.
- Algorithms run (lag-correlation, PCMCI+, FCI) over a rolling window of
  the cohort's time-series.
- Each panel renders **its** algorithm's output: PCMCI+ shows the lag
  graph, FCI shows the PAG with endpoint marks, etc.
- Re-run on data refresh (live feed tick, granularity change, or a
  manual "rerun" button).

Out of scope here: making it run on the geopolitical / macro graph
(those don't have an associated cohort yet) and fully replacing the
curated `discoverySource` field (the curator overrides remain valuable
when algorithm output is silent or noisy).

---

## 2. The architectural prerequisite — CausalGraph ↔ Cohort

The runtime graph and the cohort schema speak different languages:

| | Source | Shape |
| --- | --- | --- |
| **`CausalGraph`** | `src/lib/graph-data.ts` and friends | Curated nodes + edges. No time series. Used by every panel today. |
| **`Cohort`** | `src/lib/discovery/cohort-types.ts` | Subjects × measurements over time. PHI-free by construction. Consumed by `DiscoveryAlgorithm.run`. |

FCI takes a `Cohort`, returns a `DiscoveryResult`. The FCI panel reads a
`CausalGraph`. There's no built-in conversion in either direction.

The bridge is the central architectural decision:

### Option A — Cohort-per-domain (preferred for T1D)

Each domain ships an associated cohort. T1D already has cohorts via
`src/lib/discovery/ingesters/` (OhioT1DM, JAEB, hall-cgm). The
`DiscoveryRun` carries the cohort id, so output edges have a defined
mapping back to the variables in the cohort.

For T1D this is straightforward — `cohort.variables[].id` aligns with
`CausalNode.id` for nodes that come from cohort data (CGM, insulin
delivery, meals, etc.). Curated nodes that aren't directly measured
(e.g. β-cell mass) don't appear in the cohort and so don't get
algorithm-discovered edges; their existing curated edges remain.

**For non-T1D domains**: geopolitical / macro doesn't have a cohort
today. Either (a) add a cohort source (the live API feeds — EIA, OFAC,
FRED — could be normalised into a single-cohort multi-subject view), or
(b) Spirtes-live is T1D-only initially and unlocks for other domains as
their cohorts arrive.

Recommended: ship Spirtes-live for T1D first; macro / geopolitical
unlocks when their feed-derived cohort is normalised.

### Option B — DiscoveryRun-as-source

The pipeline already writes `DiscoveryRun` JSON records. The panel
loads the most recent `DiscoveryRun` for the active cohort and
renders its edges. The actual algorithm doesn't run when the panel
mounts — the run was triggered offline (cron, post-ingest hook,
manual script).

**Pro:** zero compute on the client. Audit-friendly. Determines what
the user sees from a known artefact.
**Con:** "live" is a misnomer — output is whatever was computed at
ingest time. Doesn't react to live feed ticks within a session.

### Option C — Hybrid: stored runs + on-demand re-run

Mostly Option B (panel reads stored DiscoveryRun), with a per-panel
"Rerun" button that triggers a fresh algorithm execution against the
current cohort + window. New result becomes the displayed run.

**Pro:** fast load (cached run), interactive (rerun is explicit).
**Con:** more moving parts; need a persistence story for re-run results.

**Recommendation:** Option C as the long-term shape; ship Option B as
the first PR (read-only display of the stored run); add the on-demand
rerun in a follow-up.

---

## 3. Algorithm execution — where compute runs

### In-browser, main thread

Cheapest. Just call `fciAlgorithm.run(cohort)` in the React tree.

**Problem:** PCMCI+ on a 200-row × 12-variable cohort with 5 conditioning
depths can take seconds. FCI is roughly O(n³) skeleton + O(n²)
orientation; for n ≈ 30 variables it's <100ms, for n ≈ 100 it's >1s.
Blocks the UI thread. Bad.

Verdict: only viable for n < 20 variables.

### In-browser, Web Worker

Same code, off-main-thread. Cohort + params marshalled across
`postMessage`, result returned the same way.

**Pro:** no infra, no auth, no rate limits. Algorithms are deterministic
pure functions — perfect for workers. The discovery algorithm interface
(`DiscoveryAlgorithm<P>`) was explicitly designed to be pure (no fs /
network) so this drops in cleanly.
**Con:** transferring large cohorts via `postMessage` has a one-time
serialisation cost. Cancellation needs explicit message protocol.
Bundle size grows by the algorithm code. No persistence — every
session re-runs unless we cache results in IndexedDB.

### Server-side, request-response

`POST /api/discovery/run` enqueues a job, polls for completion, returns
`DiscoveryRun`. Already foreshadowed in `algorithm-interface.ts`'s
"ENTERPRISE LADDER" comment.

**Pro:** unbounded compute. Audit-trail. Can cache by cohort hash.
Parallelizes across cohorts.
**Con:** infra (worker, queue, persistence). Not free latency-wise.
Auth-bound.

### Server-side streaming (SSE / WebSocket)

For long-running algorithms (PCMCI+ on 5000-row cohorts), stream
incremental results — phase-by-phase progress. UX shows live progress.

**Pro:** best UX for slow runs. Lets the user see the skeleton phase
before the orientation phase finishes.
**Con:** most infra work; only worth it if runs take more than ~5s.

**Recommendation:** **Web Worker** for the first PR. Algorithms in this
codebase are within tractable bounds for client compute. Server-side
becomes the next step when graph size or auth-attribution requires it.

---

## 4. Async UX — running / stale / done

The panel needs to communicate three states:

| State | When | UI |
| --- | --- | --- |
| **Idle** | No run yet for this cohort | Empty-state with "RUN" button |
| **Running** | Worker compute in flight | Subtle progress bar / spinner over the panel; existing tags fade |
| **Stale** | Cohort changed (new feed tick, new domain selected) since last run | Orange "STALE — rerun" banner |
| **Fresh** | Run is current | No banner; tags rendered |
| **Failed** | Worker errored or returned `partial`/`failed` | Red error chip with retry |

Idempotency: re-rendering with the same `(cohortHash, params)` should
not re-run. Hash the cohort source content — `Cohort.source.sourceHash`
already exists on the schema for this. New result invalidates by
`(cohortHash, algorithmId, paramsHash)`.

Cancellation: when the user navigates away or the cohort changes
mid-run, the worker request should be abandoned. The worker doesn't
need true cancellation; just ignore the late result.

---

## 5. Performance budget

Real cohort sizes (currently shipped ingesters):

- **OhioT1DM**: ~12 variables × 50,000 measurements / subject × 12 subjects
- **JAEB**: similar
- **hall-cgm**: smaller, single-subject

After grid-construction, the per-cohort matrix is roughly 12 variables
× 5,000 grid points (concatenated across subjects).

FCI cost on this cohort:
- Skeleton phase: O(n² · 2^maxCondsDim · CIcost) where CIcost is a
  partial correlation on N samples = O(N · |Z|²). For n=12, depth=3,
  N=5000: ~12² · 8 · 5000 · 9 = 50M ops ≈ 200 ms in JS
- Orientation: O(n³) for v-structure + R3, O(n⁴) worst-case for R4.
  For n=12: ~2k–20k ops ≈ < 1 ms

**Per-run total: ~200-400 ms in a worker for T1D cohorts.** Tractable.

PCMCI+ is more expensive due to the lagged-conditioning phase.
Empirically `pcmci-linear.ts` already runs on these cohorts — would
need profiling under worker boundary, but order-of-magnitude is
similar.

---

## 6. Minimum-viable first PR

Concrete shape, ~250-400 lines, no UI restyling:

**File-set:**
1. `src/workers/discovery-worker.ts` — Web Worker entry. Receives
   `{ algorithmId, cohort, params }`, returns `DiscoveryRun`. Wraps
   `getAlgorithm(id).run(cohort, params)` plus run-record assembly.
2. `src/lib/discovery/run-cohort-bridge.ts` — pure helper that takes
   a `CausalGraph` (or just an active cohort id) and returns a
   `Cohort`. For the first PR, scoped to T1D — looks up the cohort
   from a registered fixture.
3. `src/hooks/useDiscoveryRun.ts` — React hook. Inputs: `cohortId`,
   `algorithmId`, `params`. Manages worker lifecycle, returns
   `{ status, run, error }`. Caches per `(cohortHash, paramsHash)`.
4. `src/components/trinity/FciGraph.tsx` — extend to optionally
   render a `DiscoveryRun`'s edges with their PAG marks alongside
   the curated tags. Behind a "live FCI" toggle initially.

**Deliberately deferred to follow-ups:**
- PCMCI+ panel wiring (same pattern, separate PR)
- Lag-correlation panel (currently DCD panel — needs renaming clarity)
- Server-side execution
- IndexedDB persistence
- Geopolitical / macro cohorts

**Scope flag:** the FCI panel chrome belongs to UX & Onboarding. This
PR adds the *data* the panel renders; chrome restyling (toggle
position, banner styling, error chip) is UX's call. Keep the rendering
minimal and let UX iterate.

---

## 7. Architectural decisions still open

| Decision | Question | Default |
| --- | --- | --- |
| Bridge | A (cohort-per-domain), B (stored DiscoveryRun), C (hybrid) | C, ship B first |
| Compute | Main thread, Worker, Server | Worker |
| Cohort source for T1D | Which ingester is the canonical "live" one | `hall-cgm` for ML demos, `OhioT1DM` for benchmark |
| Persistence | None / IndexedDB / Supabase | None for first PR; IndexedDB later |
| Live updates | Manual rerun / auto on cohort change | Manual rerun first |
| Cancellation | Required / nice-to-have for v1 | Nice-to-have |
| Curator override | Algorithm output replaces / augments curated edges | Augments — curated edges remain visible, algorithm overlays in a different visual treatment (Rendering's call) |

---

## 8. Out-of-scope (for this scoping doc)

- **DCD / NOTEARS implementation.** Currently the DCD panel renders
  static tags. A real DCD requires implementing NOTEARS (constraint-
  optimisation) — separate algorithm work, not a Spirtes-live
  blocker.
- **Cross-cohort joins.** Running FCI across multiple domains'
  cohorts simultaneously. Out of scope until single-cohort is solid.
- **Discovery for geopolitical / macro graphs.** No cohort source
  yet. Unlocks separately.
- **Result authoring back into the curated graph.** "Promote this
  algorithm-discovered edge into the canonical graph" UX. Useful
  long-term but a separate UX flow.
- **Multi-user run sharing.** Shared discovery runs across team
  members. Server-side path; out of scope until that path lands.

---

## 9. Suggested PR sequence (post-scoping approval)

1. **PR A** — `run-cohort-bridge.ts` + `useDiscoveryRun.ts` hook with
   main-thread execution (no worker yet). Scoped to T1D and FCI.
   Renders endpoint marks alongside existing FCI panel content. Behind
   a default-off feature flag.
2. **PR B** — Move execution into a Web Worker. No semantic change;
   purely perf isolation. Cancellation via "ignore late result"
   pattern.
3. **PR C** — PCMCI+ panel wiring (same hook, different algorithm id).
4. **PR D** — Stale-state UX (banner / rerun button). Coordinate with
   UX & Onboarding on chrome.
5. **PR E** — IndexedDB persistence for runs (so reload doesn't
   re-trigger compute).
6. **PR F+** — Geopolitical / macro cohort bridge once the feeds
   normalise.

R4 longer-paths and nonparametric CI tests can land in parallel —
independent of the live wiring.

---

## 10. What this scoping doc explicitly does NOT decide

- The bridge (Option A / B / C) is recommended but not locked.
- Web Worker over server-side is recommended but not locked. Both
  sides of that decision have value depending on auth / audit / scale
  priorities outside the SPIRTES session's scope.
- The visual treatment of algorithm-discovered edges vs. curated
  edges is Rendering's decision, not SPIRTES's.

The point of this doc is to make the trade-offs explicit so the next
implementation PR can reference back to a chosen path rather than
re-derive the design.
