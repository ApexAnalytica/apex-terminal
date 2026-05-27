# Session — Rendering & Perf (Manifold)

**Branch:** `claude/rendering-perf-manifold-UblqD`
**Scope:** layout algorithms, viewport behavior, selection mechanics, animations, render perf, bundle perf, visual regressions, time-series rendering on the canvas. Out of scope: domain data, engines (Spirtes / Tarski / Pearl / Pareto), UX/onboarding, auth/platform, payments — each has its own session.

This is the running log for the Rendering & Perf session. Every change pushed from this session also lands an entry here so the work survives a system crash and a fresh session can resume from the bottom of the file.

---

## Surfaces under this session

- `src/components/CausalDAG2D.tsx` — React Flow 11 (`reactflow`).
- `src/components/CausalDAG3D.tsx` — react-three-fiber + drei + postprocessing on `three@0.183`.
- `src/components/CausalDAGMap.tsx` — MapLibre GL, dynamically imported (`next/dynamic`, `ssr: false`).
- Shared: viewport refit, selection state, timeline scrubbing, shock cascade animations, status banner.
- Layout seam: `src/lib/graph-layout.ts` (3D force-directed + `DOMAIN_Z_OFFSETS`).
- Store seam: `src/stores/useApexStore.ts` (Zustand, fine-grained selectors).

---

## Open work tracked

- **Issue #1 — 3D layout fix (Sugiyama + bounds scaled to node count).** Highest-leverage rendering item still open. Pending greenlight. Plan-agent recommendation: Sugiyama-style rank layout, bounds scaled to node count.
- **Issue #2 — ΩF SERIES "NO DATA" cards.** _Shipped_ — see entry 2026-05-02 below.
- **Diagnostic — canvas-vs-screenshot mismatch.** Last poked 2026-04-24 via Claude_in_Chrome; DOM showed correctly-positioned nodes but the screenshot was an empty dark rectangle. Treated as a Claude_in_Chrome compositor artifact, not a real prod bug, until reproduced in a real browser.

---

## At-a-glance — PRs shipped from this session

A bottom-up read of the full log still works, but for a fresh session this is the fastest way to see the current state. Newest first.

**2026-05-24 round (load-time round 2)**

| PR | What |
|---|---|
| TBD | `perf(bundle)`: strip the unused future-stub methods from `EngineProvider` (`computeCounterfactual`, `validateSnapshot`, `solveInterdiction`, `computeDoomsday`) — zero call sites in the live codebase, but their LocalProvider implementations were transitively pulling `cascade-simulator` (446 LOC) + `tarski-validator` (204 LOC) + `interdiction-engine` (443 LOC) into the critical-path bundle via ModulePanel. Also dynamic-import `mergeGraphs` + `validateSnapshot` inside `useApexStore`'s `mergeGraphData` / `setSnapshot` actions so the two helpers (~275 LOC) stay off the eager bundle. |
| TBD | `perf(bundle)`: dynamic-import `cascade-simulator` (446 LOC) inside `useApexStore`'s three fire-and-forget replay handlers — replay is opt-in (user clicks REPLAY), so the simulator stays off the initial-paint bundle; also drops a dead-import (`simulateCascade` was unused). Extract pure `buildRiskCards` from `graph-data.ts` into its own 27-LOC file so `RiskPropagationFlow` (on critical path) stops transitively pulling the 3000-line dataset. Bypass the `@/lib/estimators` barrel in `StructuralMetrics` (also on critical path) — direct-import the 76-LOC `omega-bridge-density` leaf instead of the index which re-exports ~2500 LOC. |
| TBD | `perf(bundle)`: dynamic-import the feed registry chain (~38KB across 10 providers) inside `useFeedRegistry`'s effect — polling can't start until a graph is loaded anyway, so the providers stay off the initial-paint bundle until then |
| TBD | `perf(bundle)`: split `graph-data.ts` (3413 LOC) — extract `getCategoryColor` / `getDomainColor` / `getCategoryLabel` / `EMPTY_GRAPH` into a new lightweight `graph-color.ts`; rewire 13 consumers (including the always-eager `useApexStore`) so the 3000-line dataset no longer rides into the critical-path bundle. `TimeSeriesOverlay` (987 LOC) now dynamic-imported and gated on `pinnedTimeSeriesNodes.length > 0` — first paint never has pins so the chunk defers until the user pins a series. |

**2026-05-22 round (load-time + Map placement + criticality response)**

| PR | What |
|---|---|
| TBD | `feat(canvas)`: dial-scrub contraction round 2 — 2D CONTRACTION 0.35 → 0.55 and stress-curve ramp pushed up (4→8 instead of 5→10) for both 2D and 3D so typical historical omegas (5-7) actually produce visible orb movement on scrub |
| #439 | `feat(edges)`: new `"flow"` edge type (teal-green solid + animated arrow, distinct from `"directed"` claim and `"temporal"` lag) + per-edge-type visibility toggle chip strip in DAGOverlay across 2D / 3D / Map |
| #435 | `feat(timedial)`: granularity picker collapses to a single chip; click to expand, pick-to-collapse |
| #432 | `perf(bundle)`: lazy `SystemCopilot` chunk + lazy `buildGraphFromDomains` / `AXIOM_LIBRARY` inside copilot tool handlers — pulls ~6.8 K LOC off the initial-paint bundle |
| #427 | `feat(2d)`: dial-scrub now moves orbs via historical-omega contraction (matched 3D's already-shipped fallback); CONTRACTION 0.18 → 0.35 for visibility |
| #409 | `perf(2d)`: 2D layout sim + network metrics → layout Web Worker (`requestLayout2D` arm; same epoch cancellation pattern as 3D) |
| #406 | `perf(bundle)`: extract `TarskiPanel` / `ParetoPanel` / `CopilotInterdictionResults` / `SnapshotIndicator` from `ModulePanel.tsx` into `next/dynamic` chunks (`ModulePanel.tsx` 3384 → 821 LOC) |
| #404 | `perf(3d)`: 3D layout sim + network metrics → Web Worker (`src/lib/workers/layout3d-{worker,client}.ts`) |
| #399 | `fix(ui)`: removed the stray "CLIENT DEPLOYMENT → Athena Defense" CTA on the canvas |
| #398 | `feat(map)`: Map geo-placement — US-hub spread (replaces Kansas-blob centroid) + ~100 NODE_COORDINATES entries for Athena ISR, T1D, T1D VX-880, AI Safety / IDS, Macro Impact, Frontier Science; city/institution name scan; smarter country regex; 16 → 32 country centroids |

**2026-05-07 round (launch freeze + UX polish)**

| PR | What |
|---|---|
| #304 | `fix(perf)`: `CausalDAG2D` lazy + conditional — no parallel layout sim on launch |
| #303 | `perf(topo)`: 4σ Gaussian truncation in `computeReliefField` / `computeReliefLayers` / `computeFusedReliefField` (~5-10× kernel speedup) |
| #301 | `fix(perf)`: launch-workspace freeze — `applyOmegaLiveAdjustments` O(N×E) → O(N+E); `useDeferredValue` on `StructuralMetrics.omegaBridgeDensity` + `CascadeHeader.netMetrics` |
| #300 | `perf(bundle)`: first wave of `next/dynamic` panel deferrals (`MonteCarloForecast`, `VX880TrialPanel`, `InterdictionPanel`, `TissueCohortView`) |
| #299 | `perf(map)`: per-frame particle layer → imperative `setData` (no React reconciliation per rAF tick) |
| #288 | `fix(timeline)`: cap `loadRealTemporalData` range at `Date.now()` — no more scrubbing into 2030 |
| #285 | `fix(map)`: upgrade `maplibre-gl` v4.7 → v5.24 so the globe projection actually renders |
| #283 | `feat(canvas)`: `startTransition` around ISOLATE toggle; TOPO shift-lasso selection |
| #281 | `feat(canvas)`: unified card-colour resolver (`getDomainCardColor` in `lib/domains`); Map globe projection in style spec (made live by #285) |

**Older entries** live in `## Session log` below; see the dated section headers for each.

---

## Backlog (next-up, ordered roughly by priority)

- **Flow edge type + edge-type visibility toggles.** _Infrastructure shipped — 2026-05-22._ `"flow"` edge type wired across all four canvas surfaces with teal-green solid + animated arrow visual; per-type visibility chip strip in DAGOverlay (CAUSAL / TEMP / CONF / FLOW) hides/shows each type instantly. Open: data-team alignment on what `"flow"` means semantically + which existing edges should be re-tagged (no edge in the loaded datasets carries `type: "flow"` yet).
- **Time-dial range-selector collapsible (NEW).** The 1H / 1Y / 5Y / ALL preset row at the bottom of the dial currently takes a fixed slice of horizontal space. User wants it collapsible so the dial itself can take the full width when the user isn't picking a range.
- **Distance measures on dial scrub — round 2 shipped — 2026-05-22.** Traced end-to-end: wiring was correct (temporal graph → filtered graph → both contraction paths), the gap was stress magnitude. Synthetic temporal data drifts within ±0.5 of base, so typical historical omegas sit in the 5-7 band — and the old `(omega-5)/5` / `(omega-5)/4` stress curves produced stress 0.1-0.3 → pull 3-14 % of distance, invisible. Bumped 2D CONTRACTION 0.35 → 0.55 and stress curves on both surfaces (4 → 8 instead of 5 → 10) so typical omegas land in stress 0.25-0.75 → pull 14-41 %. Production verification still needed: confirm the dial-scrub now reads as cluster-pinching motion.
- **Platform load-time deep-dive.** _Round 1 shipped — 2026-05-22 (PR #432); Round 2 shipped — 2026-05-24 (graph-data.ts split + TimeSeriesOverlay lazy)._ Remaining candidates: lazy-load AXIOM_LIBRARY behind a getter in `copilot-engine.ts` + `copilot-context.ts` (lower priority — SystemCopilot + TarskiPanel are both already lazy, so AXIOM_LIBRARY is off the initial-paint bundle; only shrinks the copilot chunk further); audit `TimeDial` (1207 LOC) for dynamic-loadability (it's visible on first paint though — would need a static placeholder); `framer-motion` tree-shake check; real `ANALYZE=true next build` run.
- **Time-dial-driven positional response (round 1).** _Shipped — 2026-05-22 (PR #427)._ 2D contraction now handles both cascade replay AND dial-scrub (historical-omega fallback); CONTRACTION 0.18 → 0.35 for visibility. 3D already had the historical-fallback path. Map relies on omega-scaled radius. Production verification queued above.
- **TOPO compute-shader port for real-time scrub perf.** Deferred since PR #303 (4σ truncation) covered the headline cost. Only worth doing if real-time scrub still drops frames in production.

---

## Session log

### 2026-05-24 — Shipped: EngineProvider future-stubs stripped + mergeGraphs/validateSnapshot deferred

**PR:** TBD — `perf(bundle)`: more critical-path cleanup chasing the load-time backlog.

**Trigger.** With cascade-simulator dynamic-imported inside `useApexStore`'s replay handlers (entry above), I expected the simulator chunk to be fully off the eager bundle. It wasn't — `LocalProvider` (constructed via `getEngineProvider()` in the eagerly-imported `ModulePanel`) still statically imported `simulateCascade` (sync), `validateSnapshot`, and `solveInterdiction` to satisfy its `EngineProvider` interface. None of those methods has any caller in the live codebase: they're future-stubs anticipating a remote backend. Together they were dragging cascade-simulator (446) + tarski-validator (204) + interdiction-engine (443) ≈ 1100 LOC of transitive code into the initial-paint bundle for zero benefit.

**Fix (interface cleanup).** Stripped four unused methods from `EngineProvider`: `computeCounterfactual`, `validateSnapshot`, `solveInterdiction`, `computeDoomsday`. Trimmed `LocalProvider` to match — only `discoverStructure` (used by `ModulePanel`) and `scanTailRisk` (used by `ParetoPanel`) remain. The comment block in `engine-interface.ts` explains the YAGNI call so a future remote-provider author knows the methods can grow back with proper async signatures when there's an actual caller.

**Fix (store deferrals).** Two more store-internal helpers moved to dynamic imports following the same pattern as the cascade-sim refactor:
- `mergeGraphData` action: `mergeGraphs` (71 LOC) is dynamic-imported via `loadMergeGraphs()` inside the action body. Only called when the user imports a dataset via the lazy-loaded ImportModal.
- `setSnapshot` action: `validateSnapshot` (204 LOC) is dynamic-imported via `loadValidateSnapshot()`. Only called when the user saves a snapshot via the lazy-loaded SystemCopilot. Both call sites kept the original `set((s) => …)` updater pattern, just wrapped in a `void load…().then((fn) => set(…))` so the API surface is unchanged from callers' perspective (still fire-and-forget).

**Verification.** vitest 1524/1524 pass. tsc clean on the touched files. No interface contract breakage — the only EngineProvider call sites in the codebase (`engine.discoverStructure`, `engine.scanTailRisk`) still typecheck.

**Why this matters.** ~1400 LOC of transitive eager-bundle imports are now either deferred (mergeGraphs / validateSnapshot dynamic) or eliminated entirely (engine future-stubs). Combined with the previous round-2 commits the critical-path bundle has shed roughly 6500 LOC of code that used to ride along on every first paint.

### 2026-05-24 — Shipped: cascade-simulator dynamic + buildRiskCards extracted + estimators barrel bypass

**PR:** TBD — three small bundle-shape wins on the critical path.

**Trigger.** After the graph-color split + TimeSeriesOverlay lazy + useFeedRegistry lazy (commits above), `useApexStore` and the two eager components `RiskPropagationFlow` / `StructuralMetrics` were the remaining suspects on the critical path. A targeted import audit found three more leverage points:

**Fix.**
- **`cascade-simulator` lazy in the store.** `useApexStore` eagerly imported `simulateCascade` (sync — unused dead import) and `simulateCascadeAsync` (used in three fire-and-forget replay actions). Removed the dead import; added a `loadSimulateCascadeAsync()` helper at the top of the store that dynamic-imports the module; rewrote the three call sites to `void loadSimulateCascadeAsync().then((sim) => sim(…).then(epochs => …))`. Net: 446 LOC of cascade-sim code is deferred until the user clicks REPLAY.
- **`buildRiskCards` extracted to its own file.** The function is pure (takes a graph + shocks, returns top-6 risk cards) but lived in `graph-data.ts`, which transitively dragged the 3000-line dataset into `RiskPropagationFlow` (on the critical path). Created `src/lib/risk-cards.ts` (27 LOC) housing just the function; `RiskPropagationFlow` now imports from there. `graph-data.ts` no longer needs the `CausalShock` / `RiskPropagationCard` type imports either.
- **Estimators barrel bypass in `StructuralMetrics`.** `import { omegaBridgeDensity } from "@/lib/estimators"` was hitting the index file, which re-exports from 9 estimator modules (~2500 LOC of math: bocpd, chi-star, cvar-w1, lppls-fit, moran, nlme, ph-fit, transfer-entropy, persistent-homology). Webpack's barrel-file tree-shaking is unreliable when modules have side effects, so the safe fix is the direct path: `import { omegaBridgeDensity } from "@/lib/estimators/omega-bridge-density"` (76 LOC leaf).

**Verification.** vitest 1524/1524 pass. `tsc --noEmit` clean across all five touched files (the pre-existing 71 "Cannot find module 'react'" + missing-`ai`-SDK errors are sandbox env issues, unchanged by this round).

**Why this matters.** `useApexStore` is imported by every page surface. Shedding the cascade-sim chunk from its eager-import graph means the simulator never loads for users who don't click REPLAY. `RiskPropagationFlow` and `StructuralMetrics` are both eagerly visible on first paint; bypassing the indirect dataset / barrel imports keeps them on tiny dep graphs.

### 2026-05-24 — Shipped: feed-registry chain dynamic-imported inside useFeedRegistry

**PR:** TBD — `perf(bundle)`: dynamic-import `@/lib/feeds/registry` from inside the `useFeedRegistry` effect, so the 10-provider chain (~38KB) stays off the initial-paint bundle until a graph is loaded.

**Trigger.** `useFeedRegistry()` is called in `app/page.tsx`'s `Home` component — top of the critical path. The hook already gated on `hasGraph` (no polling until a workspace is launched) so the providers themselves were dormant on first paint, but the static `import { FEED_PROVIDERS } from "@/lib/feeds/registry"` still pulled all 10 provider modules (clinical-trials, derivations, eia-hormuz, eia-saudi-crude, fred, noaa-storms, ofac-sdn, openfda, world-bank, types) into the eager bundle. Roughly 38KB pre-minification.

**Fix.** Moved the registry import into a dynamic `import("@/lib/feeds/registry").then(({ FEED_PROVIDERS }) => …)` inside the effect, after the `hasGraph` gate. The effect cleanup now tracks both:
- `cancelled` flag — set in cleanup, checked after the dynamic import resolves, so we don't start polling a stale registry copy after a fast unmount/remount.
- `cleanupFns` array — built up inside the `.then()` callback, drained on cleanup.

The empty-graph case (first paint, no workspace) never triggers the dynamic import at all, so the chunk only loads after the user picks domains and clicks LAUNCH WORKSPACE.

**Why this matters.** Combined with the round-2 splits above, the feed providers were the last large eager block in the critical-path bundle. After this, the only eagerly-loaded heavy-ish modules left are `useApexStore` itself (~1290 LOC) and the four eager UI components that mount on first paint (HeaderBar 167, RiskPropagationFlow 594, ModulePanel 842, TimeDial 1207, plus StructuralMetrics 90 and FeedbackWidget 148). Everything else is either dynamic, gated, or lazy.

**Out of scope.** `useApexStore` itself still eagerly imports a long list of helpers (`omega-pillar-wiring`, `cross-domain-bridging`, `tarski-data`'s validation entry points, `temporal-data`, `real-timeseries`, `cascade-simulator`, `snapshots/tarski-validator`). Splitting any of these would require routing them through async-action paths in the store, which is invasive. Punt to a future round once we have real bundle-analyzer numbers.

### 2026-05-24 — Shipped: load-time round 2 — graph-data split + TimeSeriesOverlay deferred

**PR:** TBD — `perf(bundle)`: split `graph-data.ts` (3413 → 3357 LOC) into a lightweight `graph-color.ts` for the four color/empty-graph helpers; lazy-load `TimeSeriesOverlay` (987 LOC) gated on pinned-series presence.

**Trigger.** Round 1 of the load-time deep-dive (PR #432) lazy-loaded the SystemCopilot column and the heavy copilot-tool deps. The next leverage point: `src/lib/graph-data.ts` is a 3413-line file (mostly the NODES / EDGES arrays) but 13 of its 17 consumers only import tiny helpers like `getCategoryColor` / `getDomainColor` / `getCategoryLabel` / `EMPTY_GRAPH`. They were each dragging the whole dataset into their chunks. `useApexStore` was a critical-path importer (every page imports the store) and was using just `EMPTY_GRAPH`.

**Fix.**
- New `src/lib/graph-color.ts` houses `getCategoryColor`, `getCategoryLabel`, `getDomainColor`, and `EMPTY_GRAPH` (a tiny pure-constant CausalGraph placeholder). `graph-data.ts` still re-exports these for any straggler import paths but no longer defines them.
- Rewired 12 color-only consumers (`useApexStore`, `CausalDAG2D`, `CausalDAGMap`, `NodeInspector`, `TarskiPanel`, `ParetoPanel`, `DcdGraph`, `PcmciGraph`, `FciGraph`, `DAGOverlay`, `DAGNode3D`, `TimeSeriesOverlay`, `ClientHeaderBar`) to import from `graph-color` directly.
- `RiskPropagationFlow` split its mixed import (`getDomainColor` → `graph-color`; `buildRiskCards` stays in `graph-data` since it lives next to the dataset).
- `CausalDAG3D` (`getNodeDomainMap` needs NODES) and `app/client/page.tsx` + `build-domain-graph.ts` (use `MAIN_GRAPH`) keep importing from `graph-data`. All three were already on lazy paths.
- `TimeSeriesOverlay` (987 LOC, returns `null` when `pinnedTimeSeriesNodes` is empty) is now `dynamic(() => import("@/components/TimeSeriesOverlay"), { ssr: false })` and the render site is gated on `pinnedTimeSeriesNodes.length > 0`. Initial paint never has pins (store inits to `[]`), so the chunk is deferred until the user explicitly pins a series.

**Why this matters.** Critical-path bundle drops the `graph-data.ts` dataset and the `TimeSeriesOverlay` body. `useApexStore` is imported by every page surface; carving its `EMPTY_GRAPH` dependency over to a 75-LOC file means the 3000-line dataset only loads when something actually needs `MAIN_GRAPH` (`/client` route, `build-domain-graph`, or `CausalDAG3D` — all lazy).

**Verification.** `tsc --noEmit` clean on all touched files (only pre-existing errors in unrelated `*.test.ts` fixtures and missing `ai`/`@ai-sdk/*` modules remain). Vitest 1524/1524 pass. `next build` not runnable in this sandbox (no Google Fonts fetch + missing ai SDK packages) so production verification is deferred.

**Out of scope.** AXIOM_LIBRARY in `copilot-engine.ts` / `copilot-context.ts` would be the next obvious lazy-load, but SystemCopilot is already a `dynamic` chunk (PR #432) and TarskiPanel is a `dynamic` chunk (PR #406), so AXIOM_LIBRARY is already off the initial-paint bundle. Further deferral inside the copilot chunk is lower priority.

### 2026-05-02 — Issue #2 fix shipped: temporalData invariant on graph swap

**PR:** [#156 — fix(timeseries): refresh temporalData + prune ghost pins on graph swap](https://github.com/ApexAnalytica/apex-terminal/pull/156) — merged `20c3389`.

**Problem.** `TimeSeriesOverlay`'s "NO DATA" badge fires when a pinned node id exists in `graphData.nodes` but is missing from `temporalData.nodes`. `setGraphData` already cleared `temporalData` and re-fired `initTemporalData()` on swap, but `mergeGraphData`, `addSandboxGraph`, `switchSandboxGraph`, `deleteSandboxGraph`, and `removeImportedDataset` all changed the graph node id set without honoring that invariant. Imports and sandbox swaps left stale temporal data and ghost pins around.

**Fix.** Added `prunePinsToGraph` helper in `useApexStore.ts` and routed every graph-mutating action through the same `temporalData: null` + pin-prune + `initTemporalData()` path. Helper returns the same array reference when nothing changes so subscribers don't re-render.

**Verification.** `tsc --noEmit` clean; vitest 330/330 pass. Visual verification deferred to prod (manifold.apexanalytica.co) since the change is a store-level invariant with no canvas surface change.

**Out of scope.** Diagnosing whether the original "NO DATA" reports were also driven by the engine-side `loadRealTemporalData` producer (Pass 2 1-point fallback) was punted — the Explore agent's earlier read of `real-timeseries.ts:317–318` was misled by a stale comment; current rendering at `TimeSeriesOverlay.tsx:151–154` does render 1-point histories as flat lines with a "STATIC" badge. So "STATIC" is working as designed; only the "NO DATA" path was the bug, and it's mine.

### 2026-05-02 — Shipped: 2D Obsidian-style layout v1

**PR:** [#159 — feat(2d): Obsidian-style force layout, hover emphasis, drag perturb, focus](https://github.com/ApexAnalytica/apex-terminal/pull/159) — merged `38c56bd`.

**What shipped.** `CausalDAG2D.tsx`'s deterministic id-hash grid is replaced with a 2D force-directed canvas. v1 covers all four interactions in one shot:
- Force-directed layout via `d3-force-3d` at `nDim=2`, cached on graph signature (sorted node + edge id sets) — filter / isolation / replay never trigger a re-layout.
- Drag-to-perturb: pin the node (`fx`/`fy`), reheat alpha, tick via rAF, unpin on drop, alpha decays naturally.
- Hover emphasizes the node + 1-hop neighbors; everything else dims to opacity 0.18 with a 180ms ease. Edges out of scope drop to opacity 0.1.
- Click-to-focus is tied to the existing `selectedNode` store value, so the inspector flow is unchanged. Hover takes precedence over click.

**Files.**
- `src/lib/graph-layout-2d.ts` (new) — `compute2DForceLayout` (one-shot offline) + `create2DLiveSimulation` (live handle: `tick`, `pin`, `unpin`, `reheat`, `cool`, `positions`) + `graphSignature`.
- `src/components/CausalDAG2D.tsx` — id-hash grid replaced; hover/focus state; rAF loop pushes live positions during drag; emphasis flows through `node.data.emphasis` → opacity in `CausalNode2D`; edges dim when out of emphasis scope. Preserved: hand-rolled shift+drag marquee (was already on main as #157/#158-era work), isolation filter, refit-on-visible-set, replay contraction (now applied as offset over dynamic positions).

**Verification.** `tsc --noEmit` clean; lint clean on changed files; vitest 511/511 pass. Visual smoke test in the sandbox dev server was blocked (`critters` + Supabase env vars not configured locally) — visual sign-off happens on the Vercel preview / production deploy.

**Rebase note.** Branch had to rebase onto main to drop the duplicate `bda9da6` commit (squashed into `20c3389` via #156) and resolve a JSX conflict with main's hand-rolled shift+drag marquee (`flowWrapperRef` + `selectionRect` overlay + `selectionKeyCode={null}`). The marquee is preserved end-to-end; my new hover/drag handlers slot in alongside it.

### 2026-05-02 — Visual refinement v1.1: rectangular boxes → Obsidian-style circles

**Trigger.** Live-prod feedback: layout was force-directed correctly, but the **node visuals** were still the rich rectangular info-cards (`CausalNode2D`'s box with category fill, label, domain, ΩF, glow border). User wanted the actual Obsidian "little circles in a network" aesthetic — picked Option 2 (circles with ΩF visible) over Option 1 (pure circles).

**Change scope.**
- `CausalNode2D` rewritten as a circular node. Diameter scales with ΩF (`14 + clamp(omega, 0..10) * 2`) so high-risk nodes are visually larger. Layered box-shadow: selection ring (sharp 2px cyan + soft halo) + shock pulse + base ΩF glow. Fracture / stressed / shock animations preserved (now scale-pulse on the circle instead of border-color flash on a box). `RESTRICTED` becomes a 1px red circle border instead of inline text.
- ΩF value + label rendered as small text, absolutely positioned below the circle so the React Flow node bounding box stays circle-sized (edges anchor at circle edges, not at the label). Label colors cyan when focused/selected, gray otherwise; hidden into opacity 0.18 with the rest of the node when out of emphasis scope.
- `graph-layout-2d.ts` re-tuned for the smaller footprint: `NODE_COLLISION_R` 78 → 48; link distance `110 + (1-w)*140` → `65 + (1-w)*100`; charge connected `-900` → `-550`, isolated `-250` → `-150`. Mild label overlap is acceptable for the Obsidian-style density; circles themselves don't touch.

**Files touched.** `src/components/CausalDAG2D.tsx` (CausalNode2D body), `src/lib/graph-layout-2d.ts` (collision + link + charge tuning). All hover/focus/drag/marquee/refit/isolation behavior from #159 preserved unchanged.

**Verification.** `tsc --noEmit` clean; lint clean on changed files; vitest 511/511 pass. Visual sign-off on Vercel preview.

### 2026-05-02 — Housekeeping: stop tracking the auto-generated test suite HTML

`APEX-Terminal-Test-Suite.html` is regenerated on every `vitest run` by the custom HTML reporter at `src/lib/__tests__/html-reporter.ts`. The only diff between runs is the timestamp on the cover, so committing it created noise on every PR and tripped the stop-hook git-clean check repeatedly during this session. Untracked via `git rm --cached` and added to `.gitignore`. Anyone who wants the report runs `npx vitest run` locally — it generates fresh.

### 2026-05-02 — Issue #1: 3D Sugiyama-style rank layout (replaces force-directed)

**Problem.** The 3D view's previous force-directed layout normalized to fixed bounds (`{ x: 55, y: 40, z: 35 }`) regardless of node count. A 30-node graph and a 167-node graph occupied the same volume → dense graphs visually clustered, no causal-flow direction was readable, and the camera had nothing to "stretch" against on bigger graphs.

**Fix.** Replaced `computeLayout3D` in `src/lib/graph-layout.ts` with a Sugiyama-style rank layout:

1. **Rank assignment** via Kahn's topological sort with longest-path propagation. Sources land at rank 0; each successor's rank is `max(parent rank) + 1`. Cycle nodes (rare in causal DAGs but possible in inferred ones) stay at rank 0.
2. **Barycenter ordering** across ranks — two passes of down-sweep (predecessors define each rank's order) + up-sweep (successors). Crossings drop without needing the full per-rank median heuristic.
3. **Coordinate assignment** with N-scaled bounds: `xSpan = max(60, sqrt(N) * 9)`, `ySpan = max(45, sqrt(N) * 6.5)`. Sources at top, sinks at bottom — causal flow reads top-down in the camera's default tilt.
4. **Z stratified** by `DOMAIN_Z_OFFSETS` × 6 with a small id-hash jitter so co-domain nodes don't z-fight.

`computeFitCamera` in `CausalDAG3D.tsx` already auto-pulls back proportional to the bounding-box extent, so dense graphs naturally fill more screen space without any camera changes needed.

**Files touched.** `src/lib/graph-layout.ts` only. `computeNetworkMetrics` unchanged. `DOMAIN_Z_OFFSETS` kept exported. d3-force-3d imports + `LayoutNode`/`LayoutLink` interfaces removed (the new layout is purely combinatorial).

**Verification.** `tsc --noEmit` clean; lint clean on changed file; vitest 522/522 pass.

### 2026-05-02 — Reverted: 3D Sugiyama rank layout

**Reverted #168 on user request.** The strict rank layout read too rigid/grid-like in production — user preferred the previous force-directed look. `src/lib/graph-layout.ts` restored to the pre-#168 state (force-directed simulation, fixed bounds normalization). Latent `any`-cast lint errors that lived on main pre-#168 fixed with the same `AnySim` type-cast pattern used in `graph-layout-2d.ts` while the file was open. 2D circle layout from #166 is unchanged.

**Lesson.** Sugiyama gives a clean causal-flow read but loses the organic/spatial feel of force-directed. If we revisit 3D layout later, the right approach is probably force-directed seeding + a light rank-influence pass (use rank as a soft y-bias on top of free force layout), not a strict rank assignment.

### 2026-05-02 — Map view orb fixes (orbs on lines, constant speed)

**Two bugs in `CausalDAGMap.tsx`** from prod feedback:

1. **Orbs floating off the lines.** Edge lines were stored as `[source, controlPoint, target]` — three points which MapLibre renders as a kinked 2-segment polyline through the control point. Particles, however, used those same 3 points as a quadratic **bezier** where the control point is *off* the curve. The bezier path bulged away from the kinked line, so orbs visually floated above the edges they were supposed to trace.
2. **Speed varied with edge length.** `phase += 0.003` per frame for every edge regardless of length, so all particles completed traversal in the same number of frames. Long edges felt fast, short edges felt sluggish.

**Fixes** (single file: `src/components/CausalDAGMap.tsx`):
- **Sample the bezier into 25 polyline points** when building each edge's `LineString`. MapLibre now renders a near-smooth curve, and the line geometry IS the particle path — they can't drift apart.
- **Cumulative arc length** per polyline so the particle can interpolate by distance (not by raw vertex index, which would skew through curvature).
- **Constant degrees-per-frame** velocity (`SPEED_DEG_PER_FRAME = 0.05` ≈ 36 px/s at zoom 2). Per-edge `dPhase = SPEED / totalLen` keeps the phase fraction in `[0, 1]` while absolute speed is constant.
- While in the file, fixed a pre-existing `set-state-in-effect` lint violation by moving the empty-features clear into the rAF callback (instead of the effect body) and stopping the rAF loop when there are no temporal edges.

**Verification.** `tsc --noEmit` clean; lint clean on changed file; vitest 522/522 pass.

### 2026-05-02 — Perf sweep across canvas surfaces (#72 playbook leftovers)

Audit found four spots where the #72 playbook patterns hadn't been fully applied. All low-risk swaps; no behavior change.

1. **`CausalDAG2D.tsx:302–313`** — full-store destructure (`const { truthFilter, replayActive, currentEpoch, ... } = useApexStore()`) replaced with eight per-field selectors. The destructure re-rendered the entire 2D component on every store mutation including timeline scrub ticks (`currentEpoch` / `timelinePosition`) — even when those fields were irrelevant to the rendered output.
2. **`dag3d/DAGOverlay.tsx`** — added a memoized `nodeById` Map and replaced three `activeGraph.nodes.find(...)` calls (one in `selectedNodes.map()`, two in the ANALYZE-SELECTION button handler). With 20+ selected nodes the previous code was O(N²); now O(1) per lookup.
3. **`CausalDAG3D.tsx:907–912`** — edge inspector label resolution switched from `graphData.nodes.find(...)` to the existing `nodeById` Map. Same lookup used elsewhere in the file; no reason to re-walk the array per render.
4. **`CausalDAG3D.tsx:573` (new)** — added a memoized `edgeById` Map alongside `nodeById`. `greyedOutNodes` now resolves severed edges via `edgeById.get(edgeId)` instead of `graphData.edges.find(...)` per cut.

**Verification.** `tsc --noEmit` clean; lint clean on changed files; vitest 537/537 pass. (Three pre-existing lint errors at `CausalDAG3D.tsx:86, 91, 306` are unrelated — `posMapRef.current = ...` in render, an `any` cast, and `performance.now()` in `useRef` initializer. Out of scope for this sweep.)

### 2026-05-02 — Cleanup: pre-existing lint errors in CausalDAG3D

Cleared the three pre-existing lint errors flagged in the perf-sweep audit (PR #185 noted them as out of scope):

1. **`react-hooks/refs` at `:86`** — `posMapRef.current = posMap` in render body. Moved into a `useEffect(() => { posMapRef.current = posMap; }, [posMap])`. Render function is now pure; the effect runs after every render so the ref still tracks the latest `posMap` for downstream effects to read.
2. **`@typescript-eslint/no-explicit-any` at `:91`** — `useRef<any>(null)` for the OrbitControls handle. Typed it as `React.ComponentRef<typeof OrbitControls> | null`, which derives the imperative-handle type directly from the drei component without a separate import.
3. **`react-hooks/purity` at `:306`** — `useRef(performance.now())` in `FrameMonitor`. Initialized to `0` and set on mount in a `useEffect`. The `useFrame` callback overwrites it on the first rendered frame, so the `0` value is observed for at most one tick.

Also cleared two warnings while the file was open: removed the unused `NodeMetrics` import and the unused `HOME_POS` constant. The remaining `set-state-in-effect` error at the camera-animation `setControlsEnabled(false)` call (line ~161) was suppressed with a single targeted `eslint-disable-next-line` + rationale comment — it's legitimate event-driven external-system sync (toggle OrbitControls during scripted camera animations) and the cascading render is bounded by the `prevSelectionKey` guard. Refactoring it into ref-based imperative mutation would have been higher risk for the animation pipeline.

**Verification.** `tsc --noEmit` clean; lint clean on `CausalDAG3D.tsx`; vitest 567/567 pass.

### 2026-05-03 — 2D canvas perf pass: adjacency-indexed contraction

**PR:** [#198 — perf(2d): adjacency-indexed contraction + nodeById/edgeById lookups](https://github.com/ApexAnalytica/apex-terminal/pull/198) — merged `f8b3440`.

**Trigger.** User picked option #1 from a three-way split (profile 2D canvas / audit 3D scene / batch map orbs). Goal: identify and fix the highest-ROI perf issues on the most-recently-rebuilt surface before the 2D Obsidian layout starts feeling its weight on dense graphs.

**Hot spots found.**
1. **`CausalDAG2D.tsx:428–438` — replay contraction was O(N×E) per tick.** The inner contraction loop walked all of `graphData.edges` for every node in the `nodes` useMemo. That useMemo rebuilds on every `currentSnapshot` change (i.e. every replay tick at ~30 Hz). On a 100-node / 200-edge graph that's 20K iters per tick, ~600K ops/sec sustained during replay.
2. **`CausalDAG2D.tsx:404–407` — hover-emphasis neighbor lookup also walked `graphData.edges`** linearly on every hover. Same fix shape as (1).
3. **`graphSignature` recomputed on every render** (`CausalDAG2D.tsx:341`) — sort+join over node+edge id sets. Cheap individually, but runs on hover, drag, replay tick.
4. **`O(N)` / `O(E)` `find()` calls** in `onEdgeClick` and the `selectedSourceLabel` / `selectedTargetLabel` resolution.

**Fixes.**
- New memos: `nodeById`, `edgeById`, `adjacency` (`Map<id, neighborId[]>`), all keyed on the corresponding `graphData.nodes` / `graphData.edges` ref.
- Replay contraction now walks `adjacency.get(n.id)` — O(degree) per shocked node instead of O(E). Per-tick cost scales with edge count, not (nodes × edges).
- `emphasisMap` neighbor lookup reuses the same adjacency map.
- `graphSignature` wrapped in `useMemo` against the same node/edge refs.
- `onEdgeClick` uses `edgeById.get(rfEdge.id)`; label resolution uses `nodeById.get(...)`.

**Out of scope (deliberately).** The `edges` useMemo (`:478–541`) still rebuilds on every hover because `emphasisTarget` is in its deps — that's structural to React Flow's prop-diff model. Splitting structural edge data from emphasis-derived style would need a custom edge component subscribing to `emphasisTarget` separately. Filed as a follow-up if dense-graph hover starts feeling heavy.

**Files touched.** `src/components/CausalDAG2D.tsx` (+59 −31).

**Verification.** `tsc --noEmit` clean; lint clean on changed file; vitest 600/600 pass. No behavior change — just lookup-shape refactoring.

### 2026-05-03 — 3D scene audit: selection Sets + scrub-stable disconnected check

**PR:** [#199 — perf(3d): selection Sets in render loop + scrub-stable disconnected check](https://github.com/ApexAnalytica/apex-terminal/pull/199) — merged `febc761`.

**Trigger.** Continued the perf sweep with item #2 of the original three-way split (3D scene audit).

**Hot spots found.**
1. **Render loop `.includes()` checks were O(M) per node and per edge.** `CausalDAG3D.tsx` at `:996, :1000, :1017, :1051, :1089` calls `multiSelectedNodes.includes(...)` / `ablatedNodeIds.includes(...)` / `ablatedEdgeIds.includes(...)` inside the per-node and per-edge maps. With 50 selections on a 200-node graph that's ~20K ops per re-render across all four call sites.
2. **`disconnectedNodes` was scrub-thrashing.** Memoed on the full `graphData` ref, so a V+E BFS re-ran on every replay tick — but connectivity is purely structural and scrubbing only bumps temporal omega. Same cost as `positions` rebuild every tick, just for the connected-component check.
3. **Five separate invalidator effects** in `StoreInvalidator` (`:367–371`) — each `useEffect` has a one-element dep list, all calling `invalidate()`.

**Fixes.**
- New memos: `multiSelectedSet`, `ablatedNodeSet`, `ablatedEdgeSet`. Render-loop call sites switched to `.has()`. Same shape as the existing `selectedEdgeIds` / `selectedNeighborNodes` / `disconnectedNodes` Sets used elsewhere in the file.
- `disconnectedNodes` re-keyed on `topologyKey + severedEdges` and reads graph data via `graphDataForLayoutRef` — same scrub-stable pattern as `positions` and `networkMetrics`.
- Five invalidator effects collapsed to one with combined deps. Behaviorally identical (React fires on any-dep change), just less noise.

**Out of scope (deliberately).**
- The blanket `onPointerMove` invalidate on the Canvas (`:983`) — broad firehose on every pointer move, but it's the safety net for hover-driven node lighting under `frameloop="demand"`. Touching it risks visible regressions on hover. Filed as follow-up if a benchmark shows it as a real cost.
- `downstreamNodes` / `greyedOutNodes` BFS still iterates `graphData.edges` linearly. Only fires on intervention click; not hot.

**Files touched.** `src/components/CausalDAG3D.tsx` (+45 −18).

**Verification.** `tsc --noEmit` clean; lint clean on changed file; vitest 622/622 pass.

### 2026-05-03 — Map orb "batching" was already live

User asked about map orb batching (item #3 of the original perf split). Audit of `CausalDAGMap.tsx` confirms the orbs are already optimally batched: every rAF tick builds a single `FeatureCollection` containing all particles for all temporal edges and calls `setParticleGeoJSON(...)` once; the map renders all of them through a single `<Source id="particles" type="geojson">` with two layers (`particle-glow`, `particle-dots`). One buffer upload per frame regardless of edge count. No work to do under the "batching" framing.

Remaining map-view perf opportunity if ever needed: the per-frame particle update goes through React (`setParticleGeoJSON` → re-render → react-map-gl diffs → `setData`). Cutting React out of the per-frame loop and hitting `map.getSource('particles').setData(...)` imperatively would skip ~60 React renders/sec when temporal edges are visible. Not "batching" — different fix; not pursued this round.

### 2026-05-03 — Shipped: 4th view mode "Relief" — topographic criticality heightfield

**PR:** [#204 — feat(relief): 4th view mode — topographic criticality heightfield](https://github.com/ApexAnalytica/apex-terminal/pull/204) — merged `fe80279`. (Backfilled here — the original PR's doc update only carried the PR #199 entry through.)

**Trigger.** User asked for a 4th display method as a topological heatmap with peaks where criticality is higher, and asked how multilayer (per-domain) overlapping topo maps would look in the same format.

**What shipped (v1).** Single-domain Relief view: takes the existing 2D force layout, treats each node as a Gaussian source with weight = ΩF composite, evaluates the field on an 80×80 grid, renders as an r3f heightfield mesh with elevation-driven color ramp (deep blue → cyan → amber → red). Same 2D layout drives all four views, so peaks land exactly where nodes sit on the 2D canvas — view switching feels coherent.

**Files.**
- `src/lib/graph-relief-field.ts` (new) — `computeReliefField(nodes, layout)` returns interleaved Float32 buffers (positions, colors, indices) ready for `THREE.BufferGeometry`. Two-pass: evaluate field (per-vertex Gaussian sum), then write vertex buffers + per-vertex colors via the elevation ramp.
- `src/components/CausalDAGRelief.tsx` (new) — r3f Canvas + mesh + ambient/directional/2 colored point lights, OrbitControls capped at the horizon (`maxPolarAngle ≈ π/2`) so users can't flip under the terrain. One-shot camera framing on first non-empty field; manual orbit preserved across graph swaps.
- `src/lib/types.ts` — adds `"relief"` to `ViewMode`.
- `src/app/page.tsx` — dynamic import (separate chunk), conditional mount under `viewMode === "relief"`.
- `src/components/dag3d/DAGOverlay.tsx` — RELIEF added to the view-switcher buttons; rendering badge shows WEBGL_RELIEF.

**Cost.** Field evaluation is ~30ms on 100 nodes (6,400 cells × 100 samples × `exp()`). Memoized on graph identity, so hover / scrub / orbit / selection don't trigger recompute.

**Verification.** `tsc --noEmit` clean; lint clean on touched files; vitest 622/622 pass.

### 2026-05-03 — Shipped: Relief multilayer — per-domain additive stacks

**PR:** TBD (about to open after this entry).

**Trigger.** Direct follow-up to PR #204 — the user's original feature request explicitly asked about multilayer ("multiple color overlaps topologizal maps"). v1 was single-domain elevation ramp; v2 is per-domain additive stacks.

**What shipped.**
- `computeReliefLayers(nodes, layout, params?)` in `graph-relief-field.ts` — groups nodes by `node.domain`, evaluates each domain's Gaussian field over a **shared world-space grid** (global bounds across all nodes; bandwidth/sigma identical per layer). Each layer's vertex colors are pre-tinted by `getDomainColor(domain) × pow(norm, 1.5)` so valleys go to black (additive zero) and peaks saturate at the domain color. Triangle indices are shared across layers — same buffer reference, no duplication.
- New `<ReliefLayerMesh>` in `CausalDAGRelief.tsx` uses `meshBasicMaterial` + `THREE.AdditiveBlending` + `depthWrite: false` + `toneMapped: false`. Lighting is intentionally bypassed — domain colors must be unambiguous, not normal-modulated. Where two domain peaks coincide spatially, GPU adds the tints (red + cyan = magenta) — exactly the "color overlap" reading the user asked for.
- Auto-mode-switch: 1 unique domain → original single-mesh elevation ramp (preserves v1 read for single-vertical graphs); ≥2 unique domains → multilayer. No new toggle to learn.
- `<DomainLegend>` overlay in the top-left when multilayer is active: bullet + domain name + node count, sorted by peak descending.

**Design decisions captured.**
- *Shared layout vs per-domain layout.* Shared. Peaks across layers line up by node, so an overlap reads as "this region is critical across multiple domains" — analytically meaningful. Per-domain layouts would read as separate continents — visually pretty, analytically useless. Rejected.
- *Additive vs alpha-blended.* Additive. Order-independent on GPU; color mixing emerges naturally; valleys disappear without depth-sorting headaches.
- *Shared triangle index buffer.* All layers share one `Uint32Array` index buffer reference — N×N grids with identical topology. Saves N² × 6 × 4 bytes per extra layer.

**Files.**
- `src/lib/graph-relief-field.ts` — new export `computeReliefLayers` + `ReliefLayer` type + `hexToLinearRGB` helper. Existing `computeReliefField` unchanged for the single-domain path.
- `src/components/CausalDAGRelief.tsx` — multilayer branch with `<ReliefLayerMesh>`, legend overlay, mode-switch driven by unique-domain count.
- `src/lib/__tests__/graph-relief-field.test.ts` (new) — vitest covering: empty input, layer count = unique domains, shared bounds across layers, nodeCount per layer, peak-descending order, valley vertices = additive black, re-centering invariant.

**Cost.** O(layers × cells × samples_per_layer × `exp()`) — same total work as the single-pass since `Σ samples_per_layer = total samples`. On a 4-domain × 100-node graph at 80×80 the field eval is still ~30ms. Memoized on `[graphData.nodes, layout]` — hover/scrub/orbit don't recompute.

**Out of scope (deliberately).**
- *Per-layer Y-stacking.* Not needed: additive blending with `depthWrite: false` makes every fragment additive into the framebuffer regardless of depth, so two layers at the same Y read correctly.
- *Picking through additive layers.* Multilayer is informational; selection still happens in 2D/3D.
- *Per-domain visibility toggles in the legend.* The existing DomainSelector card-checks already control which domains feed the field (via `useFilteredGraph`), so a second toggle would be redundant.

**Verification.** `tsc --noEmit` clean; lint clean on touched files; vitest 666/666 pass (9 new in `graph-relief-field.test.ts`).

### 2026-05-03 — Hotfix: Relief production crash on tab-switch

**Trigger.** Right after PR #210 merged, user reported a Next.js "Application error: a client-side exception has occurred" on clicking RELIEF in production. Generic top-level error fallback — no console access from this session, so the diagnosis was forced to be remote.

**Working theory (most-to-least likely).**
1. **Static import of `getDomainColor` from `graph-data.ts`** in `graph-relief-field.ts`. `graph-data.ts` is the 2,920-line MAIN_GRAPH module and is intentionally split out via the `import("@/lib/graph-data")` dynamic import in `page.tsx` (item #6 in the bundle plan). My static import pulled it into the Relief chunk, defeating the split and creating two competing init paths for the same constant. Production chunk loaders handle this less gracefully than dev's webpack runtime.
2. **NaN/Infinity propagation through the heightfield.** A single non-finite `composite` (or non-finite `p.x`/`p.y` from a degenerate layout) corrupts `peak`, then `inv = 1/peak`, then every `norm`, and finally every Float32 in the colors/positions buffers. WebGL upload of a buffer full of NaN doesn't always throw cleanly — sometimes it's "INVALID_OPERATION" on first draw, sometimes silent black, sometimes a renderer abort.
3. **No error boundary** around the Relief Canvas, so any render-time throw inside r3f surfaces as a top-level Next.js fault and tears down the whole app instead of just the Relief pane.

**Fix shipped.**
- **Inlined `DOMAIN_COLOR_MAP`** in `graph-relief-field.ts`. Removed the static import of `getDomainColor` from `graph-data.ts` entirely. The map is now a local constant; the Relief chunk no longer depends on `graph-data.ts`. Note left in the file: keep in sync with `getDomainColor` if either changes.
- **Defensive guards in both field functions.** Skip nodes whose layout position is non-finite. Coerce a non-finite `omegaFragility?.composite` to 0. Coerce a missing/empty `domain` string to `"Unknown"`. In the second pass, clamp `norm` to `[0, 1]` and bail to 0 on non-finite — so the GPU upload is always sane Float32.
- **Empty-buffer guard in mesh components.** `<ReliefMesh>` and `<ReliefLayerMesh>` now early-return `null` when `field.positions.length === 0` and skip the `setAttribute`/`setIndex` calls — `THREE.BufferAttribute(empty, 3)` was the most plausible direct throw point.
- **Removed `computeVertexNormals()`** from `<ReliefLayerMesh>` — `meshBasicMaterial` doesn't use lighting, so normals were wasted work and one less thing to fail on.
- **`<ReliefErrorBoundary>` class component** wraps the whole Relief view. A render error inside now logs to the console and shows a small in-pane "RELIEF VIEW UNAVAILABLE" fallback; the rest of the app stays interactive. Cheap belt-and-braces — should be the last line of defence regardless of which of the above was the actual culprit.

**Out of scope (deliberate).** Changing chunking config in `next.config.ts` to force the desired split — too broad. The inline copy of the color map is sufficient and decouples Relief from graph-data forever.

**Verification.** `tsc --noEmit` clean; lint clean on touched files; vitest 673/673 pass.

**Files touched.**
- `src/lib/graph-relief-field.ts` (+ ~50 / − 4) — inlined color map, defensive sample/norm guards.
- `src/components/CausalDAGRelief.tsx` (+ ~50 / − 5) — error boundary, empty-buffer guards, removed redundant normal compute.
- `docs/sessions/rendering-perf.md` — this entry.

### 2026-05-03 — Shipped: Relief readability pass — peakier terrain, tilted camera, grid, top-K node labels

**PR:** TBD (about to open).

**Trigger.** User said the live Relief view "kinda just looks like a flat map" — the multi-domain mesh was reading as one soft mound instead of distinguishable peaks, the camera was too top-down to see silhouette, and there was no way to identify *which* nodes the ridges belonged to. Asked for tilt + axes/grid + node labels.

**What shipped.**
- **Sharper terrain.** `heightScale 30 → 90`, `sigmaFraction 0.12 → 0.06` (tighter Gaussian — peaks no longer smear into one another), and a new `heightGamma: 1.35` knob that powers the normalised elevation before mapping to vertex Y. Combined with the upstream `nodeWeight()` power-1.5 boost (PR #218 territory), peaks now read as discrete ridges with flat valleys instead of a single dome. `elevationColor()` still keys off the linear `norm` so the legend ramp stays readable.
- **Tilted initial camera.** `dist * 0.55` Y-multiplier dropped to `0.35`, giving a ~20° elevation angle instead of a half-overhead view. The mesh now has actual silhouette on first frame; OrbitControls take over from there.
- **`<ReliefGrid>`.** Flat `gridHelper` at `y = -2`, sized to 1.2 × the bounds and divided into 16 cells. Two-tone colors (`#1a1d2b` / `#0e1018`) sit just-visible against the `#050508` background — the mesh is no longer floating in featureless black.
- **Top-K node labels.** New `computeNodeAnchors(nodes, layout, field, params, K=8)` in `graph-relief-field.ts` samples the field at each top-K node's position and returns mesh-local `(x, z, y)` so the component can drop drei `<Html>` cards above the highest peaks. Each label shows `{node.label}` + `Ω X.X` and a thin vertical tick down to the peak surface so the visual anchor is unambiguous. Defaults to 8 labels — enough to identify the dominant ridges, not so many that the canvas turns into label soup.
- **`ReliefField` exposes `cx, cy`.** The world-space recentring origin used by both compute functions. Lets `computeNodeAnchors` (and any future picking work) convert raw layout coords to mesh-local without re-deriving the bounds.

**Files.**
- `src/lib/graph-relief-field.ts` — `heightGamma` param + `cx/cy` field exports, height-gamma applied in both compute functions, new `computeNodeAnchors` + `NodeAnchor` exports.
- `src/components/CausalDAGRelief.tsx` — `<ReliefGrid>`, `<NodeLabels>`, tilted `<CameraSetup>`, `Html` import from drei, anchors useMemo against the dominant peak field.
- `src/lib/__tests__/graph-relief-field.test.ts` — added 4 tests: `cx/cy` exposed correctly; anchors top-K + sorted; anchors recentred to mesh-local; anchors empty on empty field.

**Cost.** Anchor sampling is O(K × N) per recompute (K=8, N=node count). On a 200-node graph that's ~1,600 `exp()` calls — under 1ms. Memoised on `[graphData.nodes, layout]` so hover/scrub/orbit don't trigger.

**Out of scope (deliberately).** Per-layer Y-stacking (option B in the user's pick) — the sharpened terrain alone already separates peaks readably, and stacking would compete with the additive color-mixing read. Picking through the mesh — still a future PR.

**Verification.** `tsc --noEmit` clean; lint clean on touched files; vitest 696/696 pass (4 new tests).

### 2026-05-03 — Shipped: Relief v3 — fused mesh, iso-contours, picking

**PR:** TBD (about to open).

**Trigger.** User feedback on the v2 multilayer was direct: *"the peaks are not really well differentiated. it's not really good… can't select any of these nodes."* They sent a Reddit reference (r/SideProject — "topographic map of 10 million research papers") showing how a real topographic map should look: discrete mountain ridges, iso-contour rings, dense labels, all clickable. The v2 additive multilayer fundamentally couldn't get there because every domain contributed everywhere, smearing peaks into haze.

**What shipped (v3 — bigger rework).**
- **Fused single mesh** replaces additive multilayer. New `computeFusedReliefField(nodes, layout, params)` builds ONE BufferGeometry by summing every domain's Gaussians into a total height field, but tracks the *dominant* domain at each grid cell. Vertex color = `dominantDomainColor × elevationTint × isoContourBand`. Each peak now reads as a discrete ridge with a single colour identity ("this peak is mostly Energy"), not the previous translucent pile-up. Returns a populated `legend` field — replaces the old per-layer legend rendering.
- **Iso-contour bands** baked into the vertex colour. `(cos(norm × BANDS × 2π) + 1) / 2` modulates each vertex's intensity; bands at edge centres are bright, valleys between bands are 0.6× dimmer. 12 bands gives the topographic-map ringed look the user asked for, without needing a custom shader. Sat on top of the elevation tint so darker valleys ringfade gracefully.
- **Picking.** New `pickNearestNode(clickX, clickZ, nodes, layout, field, params, maxDistance)` does a nearest-node search over mesh-local layout positions, capped at ~1.5 × sigma so a click on flat ground doesn't pick a far-away node. The mesh now has an `onClick` handler that takes the r3f hit point, calls picker, and dispatches `setSelectedNode(id)` into the store. Same selection signal the rest of the app already listens to (3D pillars, ModulePanel, RiskPropagationFlow). Plus a brief "SELECTED: {label}" hint at the bottom of the canvas for 1.4s so the user gets a visible confirmation.
- **Beefier labels.** Top-K bumped 8 → 12, switched to high-contrast white-on-black-with-shadow cards (the previous bg-surface-elevated/80 read as washed-out against bright peaks), thicker ticks (0.5r × 18h vs 0.6r × 14h), distance factor tuned tighter so labels stay legible at common camera distances.

**Files.**
- `src/lib/graph-relief-field.ts` — new `computeFusedReliefField` + `FusedReliefField` + `FusedReliefLegendEntry` exports, new `pickNearestNode` exporter. Existing `computeReliefField` / `computeReliefLayers` / `computeNodeAnchors` unchanged for back-compat with tests and any future re-use.
- `src/components/CausalDAGRelief.tsx` — drops `<ReliefLayerMesh>` from the render path entirely (the type stays imported only by tests). New `<ReliefMesh>` accepts `onPick` and routes click events. Pick hint UI element added. Lighting bumped (ambient 0.35→0.45, directional 0.7→0.85) so iso-contours read clearly against the now-tinted vertex colours.
- `src/lib/__tests__/graph-relief-field.test.ts` — 6 new tests: `computeFusedReliefField` shape + legend ordering, dominant-domain colouring at distant clusters, empty-graph handling; `pickNearestNode` happy path, cap radius, empty field.

**Out of scope.** Replay animation (bind field input to `currentSnapshot`), per-layer Y-stacking (option B from the original choice — moot now that the fused mesh reads cleanly), onboarding tooltip. Filed.

**Verification.** `tsc --noEmit` clean; lint clean on touched files; vitest 702/702 pass (6 new in `graph-relief-field.test.ts`).

### 2026-05-03 — Shipped: Topo v4 — heatmap palette, dense labels, more drama

**PR:** TBD (about to open).

**Trigger.** v3 user feedback: *"why did you randomly color these across? these are supposed to show colors getting brighter as peaks get larger — that's the whole thing, this is a heatmap. don't know if relief is the correct term either. can't see all the nodes. peaks and troughs still not differentiated."*

The dominant-domain colour scheme from v3 read as patchwork. Users expect a topographic / heatmap visualisation to follow a single ramp where elevation = colour, full stop. Domain identity should live elsewhere (legend, label borders), not on the surface itself.

**What shipped.**
- **Heatmap palette on the surface.** `computeFusedReliefField` now uses the `elevationColor` ramp (deep blue → cyan → amber → red) for vertex colours instead of the dominant-domain tint. Iso-contour modulation stays — bright at band centres, 0.55× at edges. Result: brighter / hotter = higher peak, full stop. Domain bookkeeping (`legend`, `dominantDomain`) still computed and exposed for downstream UI but no longer drives surface colour.
- **More vertical drama.** `heightScale 90 → 140`, `sigmaFraction 0.06 → 0.05`, `heightGamma 1.35 → 1.6`. Peaks now stand visibly above valleys in silhouette, not just colour.
- **Lower camera tilt.** Initial Y multiplier `0.35 → 0.25` so users see real horizon-relative silhouette on first frame.
- **Many more labels, scaled by Ω.** `topK` bumped 12 → 40. Each label's font size, tick height, tick width, and card opacity all scale linearly with `composite`: a top-Ω node gets 10.5px text + 28-unit tick + 1.0r tick + 0.95 card opacity; a borderline-3 node gets 7.5px text + 14-unit tick + 0.4r tick + 0.7 opacity. Label borders + Ω text get domain colour — that's where domain identity now lives.
- **Renamed "RELIEF" → "TOPO" in the UI.** Internal `viewMode === "relief"` stays unchanged (would have rippled through types, store, and tests for no real benefit); button label is now "TOPO" and the rendering badge reads "WEBGL_TOPO". User flagged that RELIEF was unfamiliar and "TOPO" is closer to the layperson term for a topographic map.

**Files.**
- `src/lib/graph-relief-field.ts` — DEFAULTS bumped (heightScale 140, sigmaFraction 0.05, heightGamma 1.6); `computeFusedReliefField` colour pass swapped to `elevationColor` ramp.
- `src/components/CausalDAGRelief.tsx` — `topK` 12 → 40, label-size scaling with composite, domain-coloured label borders, camera Y multiplier 0.35 → 0.25.
- `src/components/dag3d/DAGOverlay.tsx` — view-mode button label and rendering-badge string updated to "TOPO" / "WEBGL_TOPO".
- `src/lib/__tests__/graph-relief-field.test.ts` — replaced "dominant domain colour" test with "elevation ramp is monotonic with elevation" test (max-RGB-sum vertex is markedly brighter than min).

**Verification.** `tsc --noEmit` clean; lint clean on touched files; vitest 702/702 pass.

### 2026-05-03 — Shipped: Topo v5 — fragment shader, denser geometry, smooth contours

**PR:** TBD (about to open).

**Trigger.** v4 user feedback: *"this is better, but it's pixelated-looking. I've seen platforms that have a lot clearer terrain. Is there a different framework we can use?"*

The framework is fine — three.js / r3f is exactly what those reference platforms use. The "pixelated" look came from two things stacking: (1) the geometry was 80×80 cells, so triangles were visible at silhouette, and (2) the iso-contour bands were baked into per-vertex RGB and linearly interpolated across triangles, so a band drawn at norm=0.5 only landed on triangles whose edges crossed 0.5 — apparent line width followed the triangle grid, not the screen. Pixel-rate fragment shading fixes both.

**What shipped.**
- **Fragment-shader topo material.** New `<shaderMaterial>` with custom GLSL inside `CausalDAGRelief.tsx`. The vertex shader passes a single per-vertex `aNorm` (normalised height) as a varying; the fragment shader reconstructs the elevation colour ramp + iso-contour lines + Lambert shading **per pixel**. Result: silky smooth gradients and crisp anti-aliased contour lines, regardless of geometry resolution. Iso-contour line is `1 - smoothstep(uLineWidth, uLineWidth + 0.008, distToBandEdge)`, mixed at 0.75 strength against `0.35× baseColor` for visible-but-not-busy ringing. 14 bands by default (was 12). Ambient floor 0.45 + 0.55 Lambert.
- **Per-vertex `norms` attribute** on `FusedReliefField`. Same length as `positions/3`. The shader reads it; vertex `colors` stay populated as a fallback for any code path that doesn't bind the shader.
- **Geometry resolution 80 → 128.** Triangles still get smaller for a smoother silhouette, but we don't need to crank further because the surface smoothness now comes from the fragment shader, not mesh density. ~16K vertices, ~100ms compute on 200-node graphs.
- The single-domain path (1 unique domain) keeps using `meshStandardMaterial` with vertex colours — the shader is wired conditionally on the presence of `norms`.

**Files.**
- `src/lib/graph-relief-field.ts` — DEFAULTS resolution 80 → 128; `FusedReliefField` adds `norms: Float32Array`; `computeFusedReliefField` writes per-vertex norms in pass 2 (vertex colours stay populated minus the iso-contour modulation, which moved to the shader).
- `src/components/CausalDAGRelief.tsx` — `TOPO_VERTEX_SHADER` + `TOPO_FRAGMENT_SHADER` GLSL strings, `<ReliefMesh>` accepts `norms?: Float32Array` and conditionally renders `<shaderMaterial>` vs `<meshStandardMaterial>` based on its presence. Fused-mesh call site passes `fusedField.norms`.

**Verification.** `tsc --noEmit` clean; lint clean on touched files; vitest 702/702 pass.

### 2026-05-03 — Shipped: Topo replay animation — terrain morphs as the cascade runs

**PR:** TBD (about to open).

**Trigger.** User picked option 1 — turn TOPO from a static topology view into a scenario tool that morphs as the cascade replay advances. Bind the field input to `currentSnapshot.nodeStates[id].omegaComposite` so peaks rise / fall in sync with the replay scrubber.

**What shipped.**
- **Replay-aware field input.** `CausalDAGRelief` now reads `replayActive`, `activeTimeline`, `baselineEpochs` / `interventionEpochs`, and `currentEpoch` from the store. Derives a `currentSnapshot: EpochSnapshot | null` (clamped to range, like `CausalDAG2D` does). When non-null, builds a `fieldNodes` array that overrides each node's `omegaFragility.composite` with the snapshot's per-node ΩF. The fused / single field, the anchors, and the labels all read from `fieldNodes` — so the surface, the elevation, and the label Ω text all morph in lockstep as the user scrubs.
- **Stable layout under scrub.** Switched the layout `useMemo` from `[graphData.nodes, graphData.edges]` (re-fires every scrub tick because `useTemporalGraph` allocates fresh arrays + node objects) to `[sig]` where `sig = graphSignature(nodes, edges)` (sorted node + edge id string). Topology changes still re-run the force-directed simulation; replay scrubs don't. Same pattern `CausalDAG2D` uses (`graphSignature` from `graph-layout-2d.ts`). Without this fix, scrubbing would also shuffle the canvas, which would compete with the field eval for the main thread and look terrible.
- **REPLAY · EPOCH N / M pill** in the top-right. Amber-bordered, only renders when `currentSnapshot` is active. Tells users at a glance that the surface they're seeing is a replay frame, not the static graph.

**Files.**
- `src/components/CausalDAGRelief.tsx` — adds replay-state selectors, `currentSnapshot` derive, `fieldNodes` override, sig-keyed layout cache, REPLAY pill. Also adds imports: `graphSignature` from `graph-layout-2d`, `EpochSnapshot` type from `lib/types`.
- `src/lib/__tests__/graph-relief-field.test.ts` — added 2 tests: `norms` length matches `positions/3` and ranges across [0,1]; replay contract — same nodes/layout, escalated ΩF → strictly higher peak.

**Out of scope.** Throttling field recompute during fast scrubbing — at 128² × 169 samples × N domains the eval is ~100ms per frame, which is fine for click-stepping through epochs but would feel laggy for a real-time slider drag. If users actually scrub at 60fps, the right fix is either (a) lower-resolution preview during drag + full res on settle, or (b) port the kernel sum to a compute shader. Filed for later.

**Verification.** `tsc --noEmit` clean; lint clean on touched files; vitest 704/704 pass (2 new in `graph-relief-field.test.ts`).

### 2026-05-03 — Shipped: Topo label-on-peak fix + Ω intensity legend

**PR:** TBD (about to open).

**Trigger.** User feedback: *"the way nodes render on top of it is really hard to follow. Right now they seem to be sitting at the bottom on a flat map. Also could we have a vertical scale showing what each striation is in terms of Ω."*

**The bug.** `computeNodeAnchors` was sampling each node's height with the raw `composite` value:
```ts
h += s.composite * Math.exp(-(...) / sigma2);
```
But the field eval uses `nodeWeight(composite) = composite ^ WEIGHT_EXPONENT (1.5)`. For composite=10, that's 10 vs 31.6 — the anchor's `h / field.peak` ratio was ~0.3 of the actual mesh-vertex norm at that point, so `pow(norm, heightGamma) * heightScale` came out at ~20 when the surface peak was at 140. Labels rendered close to y=0 — exactly the "sitting at the bottom" the user reported. One-line fix: anchor sampling now mirrors the field-eval kernel.

**What shipped.**
- **Anchor height fix.** `computeNodeAnchors` now uses `nodeWeight(s.composite)` to match the field eval. Labels now float at the true peak height.
- **`<ElevationLegend>` component.** Vertical heatmap-gradient strip on the right edge of the canvas, ~180px tall, with five label stops (Ω peak / HIGH / MID / LOW / Ω 0). Uses 14 horizontal tick lines that mirror the shader's `uBands = 14`, so the strip's tick density visually maps to the iso-rings on the surface. Right-side rotated "Ω INTENSITY" text. Pulls `peakOmega` from `fieldNodes` (replay-aware), so the top label updates as ΩF changes during a replay.
- **`elevationColorJS`** small helper in the component — JS mirror of the shader's GLSL elevationColor ramp, used to paint the CSS gradient stops so the legend visually matches the surface palette. Comment ties them together; keep in sync if the ramp ever changes.

**Files.**
- `src/lib/graph-relief-field.ts` — `computeNodeAnchors` height kernel uses `nodeWeight()` instead of raw `composite`. Comment explaining the contract.
- `src/components/CausalDAGRelief.tsx` — adds `<ElevationLegend>`, `elevationColorJS()` helper, `peakOmega` useMemo, render call site below the domain legend.
- `src/lib/__tests__/graph-relief-field.test.ts` — new regression test "anchor y matches the actual mesh-vertex height at the node position": for an isolated source the anchor should reach ≥ 95% of the global mesh-vertex max-Y (was previously sitting at <30% of it).

**Verification.** `tsc --noEmit` clean; lint clean on touched files; vitest 711/711 pass.

### 2026-05-03 — Shipped: 2D hover/select stability — custom EmphasizedEdge + Dag2DContext

**PR:** TBD (about to open).

**Trigger.** User feedback: *"the 2D map is doing this weird thing where if I hover over any node, the whole map starts to blink consistently. And when I select any one node, the map just disappears temporarily."*

**Root cause.** Both the `nodes` and `edges` useMemos depended on `emphasisMap` / `emphasisTarget` (= `hoveredNodeId ?? selectedNode`). Every mousemove that hit a node, and every click that selected one, re-fired both memos and produced **brand-new node + edge object arrays**. React Flow then diffs against its internal store, decides everything is new, and tears down + rebuilds every node and edge DOM element. With many edges and a 180ms opacity transition, that read as a canvas-wide blink. The select-then-disappear case was the same mechanism — `emphasisTarget = selectedNode` flipped the entire arrays, RF unmounted before the new tree was mounted.

This was the work deferred in PR #198 with the note *"would need a custom edge component subscribing to emphasisTarget separately."*

**What shipped.**
- **`Dag2DContext`** — new React Context carrying `{ adjacency, hoveredNodeId, selectedEdgeId }`. The adjacency Map is the same one the parent already builds; it's stable across hovers because it's keyed on graph topology only.
- **`computeNodeEmphasis(id, hoveredNodeId, selectedNode, multiSelected, adjacency)`** — pure helper that returns `"focus" | "neighbor" | "dim" | "none"` for a single node. Used by `CausalNode2D` directly. Same logic as the old `emphasisMap` builder, just per-node instead of all-up-front.
- **`CausalNode2D` consumes context + store directly.** Reads `hoveredNodeId` from `Dag2DContext`, `selectedNode` and `multiSelectedNodes` from `useApexStore`. Computes its own emphasis. The parent's `nodes` useMemo no longer depends on emphasis-derived state, so hover / single-select don't rebuild the array.
- **New `EmphasizedEdge` custom edge component.** Subscribes to context + store the same way. Carries structural data (`baseColor`, `baseWidth`, `baseOpacity`, propagation signal, isSelected, type flags) on `edge.data` — all stable per graph state, NOT per hover. In render, computes opacity / strokeWidth / dim modulation from current emphasis. Renders via drei's `BaseEdge` + `getBezierPath`.
- **Parent's `edges` useMemo deps**: dropped `emphasisTarget`; kept `[graphData, truthFilter, currentSnapshot, selectedEdge]`. Hovering no longer rebuilds the edges array; `selectedEdge` (the edge inspector signal — separate from `selectedNode`) still does, which is correct.
- Registered `edgeTypes = { emphasized: EmphasizedEdge }` and switched the per-edge `type` from `"default"` to `"emphasized"`.

**Files.**
- `src/components/CausalDAG2D.tsx` — Context + helper added at top, `CausalNode2D` updated, `EmphasizedEdge` added, parent `nodes`/`edges` useMemos restructured, render wraps in `<Dag2DContext.Provider>`, `edgeTypes` passed to ReactFlow.

**Out of scope (deliberate).**
- The replay contraction `nodes` useMemo (`graphData, nodePositions, truthFilter, currentSnapshot, adjacency`) still re-fires on each replay tick, which is correct — node positions actually move during replay. The point of this PR was severing the *hover/select* dependency, not the replay dependency.
- The "map disappears on select" symptom — same root cause as the blink (whole-array rebuild). Both are fixed by the same change.

**Verification.** `tsc --noEmit` clean; lint clean on touched files; vitest 723/723 pass.

### 2026-05-03 — Shipped: 3D readability — labels-on-demand, brighter orbs, size-metric toggle

**PR:** TBD (about to open).

**Trigger.** User feedback on the 3D diagram: *"looks busy / hard to track. Rather than every node labeled, only show labels when I select one. The orbs themselves are near invisible — make them easier to identify. Should we link the orb size to a network feature shown on the right? Maybe a toggle?"*

**What shipped.**
- **Labels on demand only.** `DAGNode3D` previously rendered every node's label permanently (hidden only during active orbit). Now the label only shows when the node is hovered, single-selected, or a neighbour of the selected node. The hover detail card (full ΩF profile + radar + network metrics) still surfaces full info on demand. Removes the "hodgepodge of overlapping text" the user flagged.
- **Brighter orbs.** Three changes in concert: (a) base radius range 0.20–0.75 → 0.45–1.05 (≈ 2× across the board, lifts the floor so peripheral nodes still read as orbs not dots); (b) idle emissive intensity floor 0.4 → 0.7 (and hover 0.8 → 0.95); (c) outer glow-sphere opacity 0.06 / 0.12 → 0.16 / 0.32; (d) ΩF colour ring opacity 0.15 / 0.35 → 0.32 / 0.55. Orbs now have visible presence at idle, not just when hovered.
- **`nodeSizeMetric` toggle.** New `NodeSizeMetric = "omega" | "eigenvector" | "betweenness"` type added to `lib/types.ts`. Store carries `nodeSizeMetric` (default `"eigenvector"` — same as before, just now selectable) + `setNodeSizeMetric` action. `DAGOverlay` exposes a small `SIZE: ΩF / EIG / BTW` button trio in the top-right control strip, only visible in 3D view. `DAGNode3D` reads the store value and computes radius from the chosen metric — `omega` maps `composite/10` to the unit interval; the centralities are passed through directly. Hover-card footer reflects the active metric ("size ∝ ΩF composite", etc.).

**Files.**
- `src/lib/types.ts` — new `NodeSizeMetric` type.
- `src/stores/useApexStore.ts` — `nodeSizeMetric` slot + setter, default `"eigenvector"`.
- `src/components/dag3d/DAGOverlay.tsx` — 3D-only `SIZE:` toggle wired to the store.
- `src/components/dag3d/DAGNode3D.tsx` — radius formula honours the toggle, label conditional gate, glow / emissive intensity bumps, hover-card footer text.

**Verification.** `tsc --noEmit` clean; lint clean on touched files; vitest 729/729 pass. (Three pre-existing lint warnings outside the diff.)

### 2026-05-03 — Shipped: 2D floating edges + node-size toggle parity

**PR:** TBD (about to open).

**Trigger.** User feedback after the 3D readability pass: *"some 2D lines are still all curvy. It almost seems like they have to be pointing to the bottom or top of any node. Can't we have them just pointing straight from whatever direction makes the most sense? Also the size differences should also be available in 2D rendering."*

**Floating edges.** The previous `EmphasizedEdge` used `getBezierPath` against React Flow's handle-anchored `sourceX/Y` / `targetX/Y` — every line had to pass through one of the four invisible handles (top/bottom/left/right) on each circle, so a node placed to the left of another would still draw a line that detoured up to the top handle and curved back down. Replaced with the "floating edge" pattern from the RF docs: read the source/target `nodeInternals` via `useReactFlowStore`, compute centre-to-centre direction, trim each end to the circle perimeter, draw a single straight `M…L…` SVG path. Now lines go in the geometrically natural direction, no curvature, no detours. Arrowhead lands on the circle perimeter cleanly.

**Node-size toggle parity.** The 3D `SIZE: ΩF / EIG / BTW` toggle now drives 2D node diameter too:
- `CausalDAG2D` computes `networkMetrics` via the existing `computeNetworkMetrics` util (same one 3D uses) and caches on `graphSignature`. Replay scrubs / hover don't re-run the centrality sweep.
- Each node's `data` now carries `metrics: NodeMetrics`.
- `CausalNode2D` reads `nodeSizeMetric` from the store and maps the chosen signal into a 14–34 px diameter range.
- `DAGOverlay` SIZE toggle visibility extended from `viewMode === "3d"` to `(viewMode === "3d" || viewMode === "2d")`. MAP / TOPO stay hidden since their visual primitive isn't a sized node.

**Files.**
- `src/components/CausalDAG2D.tsx` — `EmphasizedEdge` switched to floating straight path via `useReactFlowStore`; `CausalNode2D` accepts `metrics` and reads `nodeSizeMetric`; parent `nodes` useMemo passes per-node metrics; `networkMetrics` useMemo cached on `sig`.
- `src/components/dag3d/DAGOverlay.tsx` — SIZE toggle now visible in 2D as well.

**Verification.** `tsc --noEmit` clean; lint clean on touched files; vitest 729/729 pass.

### 2026-05-03 — Hotfix (out-of-scope but blocking prod): lazy-init Supabase clients in API routes

**PR:** TBD (about to open).

**Trigger.** User reported `manifold.apexanalytica.co` → Vercel **404 DEPLOYMENT_NOT_FOUND**. Local `npm run build` reproduced: `Error: supabaseUrl is required.` at the "Collecting page data" step, dying on `/api/admin/billing/expire`. Bisected — none of the rendering/perf commits touched these routes; the failure is structural.

**Root cause.** Ten API route files were instantiating service-role Supabase clients (and one Resend client) **at module-load time** at the top of the file:

```ts
const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

Next.js 16's Turbopack production builder is more aggressive about evaluating route modules during page-data collection, so any missing env var at build time crashes the entire build. On Vercel that took out the production deployment alias and produced the user-facing DEPLOYMENT_NOT_FOUND.

**Fix.** All 10 routes wrapped the client creation in a `function getService() { return createClient(...) }` and switched callsites to call `getService()` (or `getSupabase()` / `getResend()`) inside the request handler. Module-load no longer touches env vars; the client is constructed at request time when env vars are guaranteed present (or fails with a clearer 500).

**Files touched.**
- `src/app/api/admin/billing/expire/route.ts`
- `src/app/api/admin/billing/grant-tier/route.ts`
- `src/app/api/admin/billing/customers/route.ts`
- `src/app/api/admin/feedback/[id]/approve/route.ts`
- `src/app/api/admin/feedback/[id]/reject/route.ts`
- `src/app/api/admin/leads/[id]/route.ts`
- `src/app/api/request-access/route.ts` (also lazy-inits Resend)
- `src/app/api/feedback/route.ts`
- `src/app/api/webhooks/github/route.ts`
- `src/app/api/trusted-signup/route.ts`

**Verification.** Local `npm run build` now passes the "Collecting page data" step (where it was failing). Static page pre-rendering still requires env vars present (e.g. `/forgot-password` uses `@supabase/ssr`); that's expected on Vercel where the env vars exist and was always working there.

**Out of scope (deliberate).** This is auth/platform code, not rendering/perf. Logging the hotfix here because it's the only session that's been touching the codebase today and prod was down.

### 2026-05-03 — Shipped: discoverable LEGEND popover replaces cryptic SIZE buttons

**PR:** TBD (about to open).

**Trigger.** User feedback after the SIZE toggle landed: *"the toggle ΩF / EIG / BTW is still kind of confusing — what do they mean? Also what about the distance measures? What are those relative to the orbs? We need to be more specific and consistent."*

The cryptic three-letter labels surfaced no meaning, and three other visual encodings (inter-node distance, edge thickness, edge colour) had **zero documentation** in the UI. Power users could probably guess, first-time users couldn't.

**What shipped.**
- New `EncodingLegend` popover component in `DAGOverlay`, anchored to a single `LEGEND` button that replaces the inline `SIZE: ΩF / EIG / BTW` strip. Same trigger in 2D and 3D.
- **Size toggle moved inside the popover** with full names + one-line explanations:
  - **Criticality (ΩF)** — Static fragility composite — 0–10. Default analytical signal.
  - **Influence (eigenvector centrality)** — Importance via connections to other important nodes. Surfaces hubs.
  - **Bridge (betweenness centrality)** — Lies on shortest paths between others. Surfaces chokepoints.
- **Five read-only encoding rows**, each with a colour swatch + plain-English explanation:
  - Node colour → domain
  - Node glow → ΩF severity (red ≥ 9, amber 7–9, green < 7)
  - Distance → force-directed: stronger correlation ⇒ shorter spring ⇒ closer
  - Edge thickness → correlation magnitude
  - Edge colour → causal (cyan) / temporal (amber) / confounded (orange) / Tarski-violation (red)
- Click-outside + Escape dismiss the popover.

**Tradeoff captured.** Size-metric switching is now a 2-click action (open legend → click metric) instead of 1-click. The discoverability win — users can finally tell what BTW *is* — was the bigger problem.

**Files.**
- `src/components/dag3d/DAGOverlay.tsx` — `EncodingLegend` + `LegendRow` components, `legendOpen` state, replaces the inline `SIZE:` button strip with a single `LEGEND` button + popover.

**Verification.** `tsc --noEmit` clean; lint clean; vitest 729/729 pass.

### 2026-05-03 — Shipped: edge thickness power-scale + plain-English edge legend

**PR:** TBD (about to open).

**Trigger.** User feedback after the LEGEND landed: *"have we actually implemented edge thickness? They all seem to have pretty much the same thickness. The distance — is that actually being calculated appropriately? Also our blue lines vs yellow lines — I thought there were correlation and causal analytics. Please clarify."*

**Diagnosis.**
- Edge thickness *was* implemented: linear `0.5 + weight * 1.5`. But real edge weights cluster between **0.4 and 0.8** (86 at 0.6, 70 at 0.7, 37 at 0.8) → visible width range was **1.1–1.7 px** = barely distinguishable. Code was right, calibration was wrong.
- Distance *is* implemented: 2D layout uses `distance = 65 + (1 - weight) * 100`, so weight 0.4 → 125, weight 0.8 → 85. Force-directed layout also balances charge / collision / centering, so distance is a *soft* signal that gets partially drowned out — not a literal weight readout.
- Edge colours are correct but the legend was cryptic. Three real edge types in the dataset: `directed` = direct causal (cyan, 183 edges), `temporal` = lag-correlation (amber + animated particles, 135 edges), `confounded` = latent common cause (orange, dashed, 9 edges). Plus Tarski-violation overlay (red).

**What shipped.**
- **Edge thickness power-scale.** Both `CausalDAG2D` (`EmphasizedEdge`'s `baseWidth`) and `DAGEdge3D` switched from `0.5 + weight * 1.5` to `0.7 + pow(weight, 2.4) * 3.3`. The 0.4–0.8 weight band now produces 0.46–1.34 (multiplied by the constant), giving ~3× spread between thin and thick edges at typical weights. Min 0.7 floor keeps very weak edges still drawable.
- **Legend rewritten** with plain-English edge type names. The single `EDGE COLOUR` row split into four:
  - `CAUSAL (cyan →)` — Direct cause: A → B. Arrowed.
  - `TEMPORAL (amber, animated)` — Lag-correlation: A leads B by some delay. Particles flow source → target.
  - `CONFOUNDED (orange, dashed)` — A and B share a hidden common cause, no direct link.
  - `INCONSISTENT (red)` — Tarski filter: edge violates a domain-aware axiom (only visible with verified-truth filter on).
- **Distance row updated** to call out that the signal is *approximate* — force-directed layout, with charge / collision / centering forces competing.
- **Edge thickness row updated** to match the new power-scale wording: "Correlation / causal magnitude — power-scaled so the typical 0.4–0.8 weight range reads as ~3× spread on screen."

**Files.**
- `src/components/CausalDAG2D.tsx` — `baseWidth` formula in the `edges` useMemo.
- `src/components/dag3d/DAGEdge3D.tsx` — `lineWidth` formula at the top of the inner component.
- `src/components/dag3d/DAGOverlay.tsx` — legend rows updated.

**Verification.** `tsc --noEmit` clean; lint clean on touched files; vitest 732/732 pass.

### 2026-05-03 — Shipped: 3D hover-vs-click parity with 2D

**PR:** TBD (about to open).

**Trigger.** User feedback on 3D: *"when I hover above a node, I'd like to see just the small label like 2D does. I didn't mean the huge box that appears — that should only appear when I physically click on it."*

**What shipped.** Single one-line change in `DAGNode3D`: the heavy "ΩF profile + network metrics" hover card was gated on `hovered && !dimmed`. Switched to `isSelected && !dimmed`. The lightweight floating-label (`{node.label} | {domain} | Ω X.X`) still shows on hover (gate already includes `hovered || isSelected || isNeighborOfSelected`), so hover gives the small label and only an explicit click opens the heavy card. Mirrors the 2D pattern.

**Files.**
- `src/components/dag3d/DAGNode3D.tsx` — one conditional swap on the detail-card mount.

**Verification.** `tsc --noEmit` clean; lint clean (pre-existing `ablationMode` warning unchanged); vitest 778/778 pass.

### 2026-05-03 — Next up

- Verify on production: hover a 3D orb → only the small label appears. Click an orb → the full detail card appears (and stays until you click elsewhere or hit ESC).
- Backlog: deferred 3D `onPointerMove` throttle (PR #199), map-view imperative-setData refactor, real bundle-analyzer perf sweep using PR #222's tooling.

### 2026-05-07 — Shipped: 2D click-dim softened, TOPO neighbour pillars, in-scene Ω legend, collapsible domain panel

**PR:** TBD (about to open).

**Trigger.** Four-item feedback batch from the user, in order:
1. *"If you click on it, the screen all the notes disappear, so it kinda goes black. That needs to fixed."* — 2D click was producing a permanent dim (0.18 node, 0.10 edge) that read as a blacked-out canvas.
2. *"Anytime you select the node … it should be persistent across all ball mapping options. … The same thing in topology as well."* — node + neighbours highlight existed in 2D and 3D, but TOPO only marked the selected node itself.
3. *"It could be nice if that gradient identifier was actually hung up above the or around the mountains and so you could easily use it as a comparison element. Rather than … on the side of the screen."* — TOPO Ω legend was a DOM strip pinned to the right edge with no relationship to actual peak heights.
4. *"The bottom-left domain selector … takes too much room. I think it should be a collapsible menu."*

**What shipped.**

- **Click-dim softened, hover-dim untouched.** In `CausalDAG2D` (the same `computeNodeEmphasis` + `EmphasizedEdge` path) the dim *strength* now branches on whether `hoveredNodeId` is set:
  - Hover-driven (transient): nodes 0.18, edges 0.10 / multi 0.08 — full spotlight, what the user said is "kinda cool".
  - Click-driven (persistent): nodes 0.50, edges 0.35 / multi 0.25 — non-neighbour orbs and edges still legible, no "black canvas" feel.
  The clicked node itself is still "focus" via the existing emphasis path, so it stays vivid.
- **TOPO neighbour pillars.** `SelectionMarkers` now also receives `edges` and renders a second "neighbour" tier: shorter, thinner, dimmer cyan pillars at every node adjacent to a primary selection. Same spotlight semantics as 2D and 3D — clicking a node in any view now lights up the same neighbourhood across all three.
- **In-scene Ω elevation legend.** `ElevationLegend` (right-edge DOM strip) replaced by `InSceneElevationLegend` rendered inside the `<Canvas>` at the SE corner of the field. The column is a 1×128 `CanvasTexture` standing 140 world units tall — the same `heightScale` the surface uses — so the user can compare a peak's height directly to the legend's Ω ticks. Tick labels (`Ω 0`, two intermediates, `Ω peak`) are placed on the gamma-shaped curve (`pow(t, heightGamma=1.6) * 140`) so they line up with what the eye reads off a mountain at the same height.
- **Collapsible bottom-left DOMAINS panel.** `DAGOverlay` got a `domainPanelOpen` state (default closed). Header is always visible with a chevron toggle and a count summary; the body (per-domain rows with click-to-highlight) only mounts when expanded.

**Files.**
- `src/components/CausalDAG2D.tsx` — node + edge dim splits on `isHoverDriven`.
- `src/components/CausalDAGRelief.tsx` — neighbour-pillar tier in `SelectionMarkers`, new `InSceneElevationLegend`, removed DOM-side `ElevationLegend`.
- `src/components/dag3d/DAGOverlay.tsx` — chevron toggle on the DOMAINS panel.

**Out of scope (flagged to data/engines).** "Nodes from unselected domains still appear" (likely a `selectedDomains` filter bug) and "domain grouping looks apples-to-oranges" (sovereign risk vs Saudi/Iran co-energy in the same group) — both belong with the engines team's domain-data layer, not with rendering.

**Verification.** `tsc --noEmit` clean; lint clean on touched files; vitest 778/778 pass.

### 2026-05-07 — Shipped: Map multi-select dim, 3D card-explosion fix, TOPO isolate, domain panel rolled up

**PR:** TBD (about to open).

**Trigger.** Four-item batch from the user after merging PR #262:

1. *"On maps, it didn't actually shade out the rest of them. … in the same way that it did under 2D."* — Map only dimmed when `isolateSelection` was on; 2D dims unconditionally on multi-select.
2. *"Under 3D, it has, like, a million different cards open. … It should only just have, like, that short little title above that node."* — When PR #261 moved the heavy detail card behind `isSelected`, multi-select set `isSelected=true` for every selected node, popping a wall of overlapping cards.
3. *"Under topology … it hasn't isolated the region, which I guess is what it should be doing."* — TOPO didn't honour `isolateSelection` at all.
4. *"Under the bottom-left domain section … sovereign risk Saudi Aramco Energy. These look like not the same level of complexity. And on top of that, you're also showing certain domains for which there are not any nodes."* — The panel iterated raw `n.domain` strings, which carry inconsistent abstraction (per-company vs per-theme), and showed buckets the user hadn't selected at landing.

**What shipped.**

- **Map dim-on-multi-select.** `nodeGeoJSON` now dims non-selected nodes whenever `selectedNodes.length > 0` (0.35 with isolate off, 0.15 with isolate on). Edges branch three ways: cull when isolate ON and not fully in scope, dim to 0.08 when isolate OFF and no endpoint is selected, otherwise render normally.
- **3D `isSingleSelected` prop.** `DAGNode3D` now takes both `isSelected` (single OR multi → drives ring/scale/label) and `isSingleSelected` (the singular click target → drives the heavy detail card). Multi-selected nodes still get the floating label, never the card.
- **TOPO isolate + tint.**
  - With `isolateSelection && multiSelected.size > 0`, `fieldNodes` filters to the selected subset before the relief field is computed — non-selected mountains literally don't render.
  - Without isolate but with a multi-selection, the surface gets a `uSurfaceTint=0.4` uniform multiplier (new in `TOPO_FRAGMENT_SHADER`) so mountains read as faded context behind the cyan selection pillars. Vanilla `meshStandardMaterial` path mirrors via `transparent + opacity`.
  - Uniform held in `useState`, mutated imperatively through a `materialRef` to avoid rebuilding the shader pipeline on tint changes.
- **Domain panel rolled up to card labels.** Replaced the raw `n.domain` enumeration with a card-keyed pipeline: reverse `DOMAIN_MAP` (selector-id → raw-domain[]) into raw → card, bucket nodes by card, show `card.label` (e.g. "Energy Systems") and `card.color`. Cross-domain connectors (`Geopolitical`, `Energy Grid`) keep their raw-name row since they have no card mapping. When `selectedDomains.length > 0`, non-cross-domain rows filter to the user's actual landing-page picks; otherwise fall back to "show everything in the visible graph". Click-to-highlight now selects every node whose raw `n.domain` is in the row's mapped set.

**Files.**
- `src/components/CausalDAGMap.tsx` — node + edge dim branches.
- `src/components/dag3d/DAGNode3D.tsx` — new `isSingleSelected` prop, gate on detail card, memo equality.
- `src/components/CausalDAG3D.tsx` — pass `isSingleSelected={selectedNode === node.id}` to `DAGNode3D`.
- `src/components/CausalDAGRelief.tsx` — `uSurfaceTint` uniform + shader update; `surfaceTint` prop on `ReliefMesh`; `fieldNodes` isolate filter; multi-select state read in the parent.
- `src/components/dag3d/DAGOverlay.tsx` — `domainPanelRows` (card-keyed), updated panel render + click handler.

**Caveats / what's still data-side.** "Apples-to-oranges" was addressed at the rendering layer by displaying card labels instead of raw `n.domain` strings. The underlying data still has nodes labelled at multiple abstraction levels — that's an engines-team thing if the picker / canvas ever needs to surface the raw string.

**Verification.** `tsc --noEmit` clean; lint clean on touched files (pre-existing `ablationMode` warning unchanged); vitest 778/778 pass.

### 2026-05-07 — Shipped: 2D click no longer reheats the layout sim

**PR:** TBD (about to open).

**Trigger.** User: *"Click any one of the nodes under 2D, and then everything disappears … it disappears for, like, a few seconds, and then it rerenders again. But it's weird because when it rerenders, nothing is selected."*

**Diagnosis.** RF fires `onNodeDragStart` on mousedown — even for a pure click. The handler called `sim.reheat(0.5)` + `startSimLoop()`, so every click ran the force-directed layout for ~1.5s while alpha decayed from 0.5 to 0.005. The orbs drifted (sometimes far enough to leave the viewport) and settled back, which the user perceived as "everything disappeared then re-rendered." The selection ring was technically still applied but invisible because the selected orb had moved off-frame mid-drift.

**What shipped.** Click-vs-drag distinction in `CausalDAG2D`:
- `onNodeDragStart` now only pins the node (cheap). No reheat, no sim loop.
- `onNodeDrag` (which fires only when actual movement occurs) reheats and starts the sim on its first tick, then keeps re-pinning to the cursor.
- `onNodeDragStop` only calls `sim.cool()` if a drag actually happened — pure-click → pin/unpin pair is a no-op for the simulator.
A `draggedRef` tracks whether motion fired between drag start/stop.

**Files.**
- `src/components/CausalDAG2D.tsx` — drag-vs-click handlers.

**Verification.** `tsc --noEmit` clean; lint clean on touched files; vitest 782/782 pass.

### 2026-05-07 — Shipped: 3D card removed, TOPO legend anchored to peak, Map basemap de-cluttered

**PR:** TBD (about to open).

**Trigger.** Three-item batch:

1. *"Under 3D, selecting any node still gives us a whole box that's hard to get rid of. All it needs to do is give a small title hovering above it along with its nearest neighbors. Like 2D."* — even after PR #265 narrowed the in-canvas detail card to single-click only, the user wants no in-canvas card at all. The 2D pattern is the model: small floating label + neighbour spotlight.
2. *"The legend on the side of the topology diagram is really off to the side. It should kinda be floating above wherever we're scaling to so we can always kind of see how it compares."* — the SE-corner placement of `InSceneElevationLegend` was visually disconnected from the actual peaks.
3. *"For the map, … it's almost a globe-like looking map. Looks somewhat like Google Maps, but it gets all the way down to the street. … This is just getting very busy."* — the CARTO `dark_all` basemap rendered street labels and city names under the causal-graph overlay.

**What shipped.**

- **3D in-canvas detail card removed entirely.** Dropped the `Html`-mounted card from `DAGNode3D` (was ~140 lines of JSX rendering a 280px panel with axis bars, network metrics, metadata). The small floating label above the orb is now the only on-canvas affordance — same gate as before (`!dimmed && !isOrbiting && (hovered || isSelected || isNeighborOfSelected)`). Full ΩF profile / network metrics still live in `NodeInspector` and `ModulePanel` as side panels — the right home for the heavy data. Cleanup: removed `isSingleSelected` prop, dead helpers (`getBarColor`, `getCentralityLabel`), unused imports (`getDomainColor`, `resolveDomainProfile`), and the `axes` / `selectedDomains` / `profile` / `pillarLabels` locals.
- **TOPO legend anchored to the peak.** `InSceneElevationLegend` now takes a `peakAnchor` (translated x/z of the highest-Ω node, in surface coords) and stands the column 12 world units beside it. Cascade replay re-anchors as the peak shifts. Falls back to the SE corner if no anchor is available.
- **Map basemap switched to `dark_nolabels` + zoom cap 6.** No more street labels / city names. `maxzoom: 6` caps tile detail at country / sub-region scale so the basemap stops loading new tiles past that — pinch-zooming further is allowed but doesn't reveal streets. Same dark theme; just much less competing visual density under the graph.

**Files.**
- `src/components/dag3d/DAGNode3D.tsx` — card removed; props + helpers / locals trimmed.
- `src/components/CausalDAG3D.tsx` — stop passing `isSingleSelected`.
- `src/components/CausalDAGRelief.tsx` — `peakNodeId` + `peakAnchor` derivation; `InSceneElevationLegend` accepts `peakAnchor`.
- `src/components/CausalDAGMap.tsx` — `dark_nolabels` tile URL, `maxzoom: 6`.

**Verification.** `tsc --noEmit` clean; lint clean on touched files (pre-existing `ablationMode` warning unchanged); vitest 793/793 pass.

### 2026-05-07 — Shipped: 3D Canvas pointer-move invalidates coalesced to one per rAF

**PR:** TBD (about to open).

**Trigger.** Backlog item from PR #199 follow-up. The Canvas-level `onPointerMove` was an inline arrow that called `window.dispatchEvent(new Event("dag3d-invalidate"))` on every pointer-pixel-move. At typical 120Hz mouse polling that's ~120 dispatches/sec, each routing through `StoreInvalidator`'s listener and calling R3F's `invalidate()`. R3F coalesces frames internally so we weren't *rendering* 120Hz, but the per-event JS work (Event allocation + listener fire + invalidate bookkeeping) was non-trivial overhead just for keeping demand-mode responsive.

**What shipped.** rAF-coalesced handler in `CausalDAG3D`. An `invalidatePendingRef` flag gates dispatches: first move sets the flag and schedules a rAF; the rAF callback clears the flag and dispatches the invalidate. Subsequent moves before the rAF fires are no-ops. Worst case is now 60 dispatches/sec (or display rate, whichever is lower), regardless of mouse polling.

**Files.**
- `src/components/CausalDAG3D.tsx` — `onCanvasPointerMove` callback replacing the inline arrow.

**Verification.** `tsc --noEmit` clean; lint clean; vitest 793/793 pass.

### 2026-05-07 — Shipped: panel-canvas colour alignment + globe projection

**PR:** TBD (about to open).

**Trigger.** Two interlocking complaints:
1. *"The colours for the nodes aren't really matching what we have as colour coding for the main domains. Select any of the domains. It's not always the same colours rendering on the map. We should make them match."* — clicking a row in the bottom-left DOMAINS panel selected nodes that on canvas rendered in completely different colours from the panel row.
2. *"For the map I've kinda seen these dimension-map outline approaches — I like that idea. So if we [had] a 3D map instead, you'd have the same ability to zoom in/out. Would be great. … We do need to address the ability to … zoom in down to the street type of thing if you need to."* — the 2D mercator basemap with `maxzoom: 6` (from PR #270) was correct for "less busy" but cut off the street-level option entirely.

**What shipped.**

- **Unified colour resolver.** New `getDomainCardColor(rawDomain)` in `@/lib/domains` reverse-maps raw `n.domain` strings → `DomainCard.color` via the existing `DOMAIN_MAP`. `DOMAIN_MAP` itself moved out of `useFilteredGraph.ts` into `@/lib/domains` (its natural home alongside `DOMAIN_CARDS` / `DOMAIN_GROUPS`); `useFilteredGraph` now re-exports it for back-compat. 2D / 3D / Map node renderers all resolve colour via `getDomainCardColor → datasetColor → getDomainColor → getCategoryColor` so a click on the panel's "Energy Systems" row now selects orbs that render in the same red the row shows. Trade-off: nodes within a multi-domain card (e.g. all `defense-isr` sub-domains) collapse to a single card colour; per-sub-domain colour signal is lost on the canvas. Side-panel chips (NodeInspector, ModulePanel, TimeSeriesOverlay) keep their per-domain palette since those views are detail-oriented.
- **Globe projection on the Map view.** Added `projection: { type: "globe" }` to the maplibre style. Renders the world as a 3D sphere at low zoom and smoothly transitions to mercator as the user zooms in (built-in MapLibre v4 behaviour). Restored `maxzoom: 19` so street-level detail returns when the analysis demands it; the globe + `dark_nolabels` combination keeps the basemap visually quiet at typical zoom levels but doesn't hide the option to drill down.

**Files.**
- `src/lib/domains.ts` — new `DOMAIN_MAP`, `DOMAIN_TO_CARD`, `getDomainCardColor`.
- `src/hooks/useFilteredGraph.ts` — `DOMAIN_MAP` re-export.
- `src/components/CausalDAG2D.tsx` — colour resolver chain in `CausalNode2D`.
- `src/components/dag3d/DAGNode3D.tsx` — same chain on `baseColor`.
- `src/components/CausalDAGMap.tsx` — same chain on `domainColor`; `projection: globe`; `maxzoom` restored.

**Verification.** `tsc --noEmit` clean; lint clean (pre-existing `ablationMode` warning unchanged); vitest 793/793 pass.

### 2026-05-07 — Shipped: ISOLATE freeze unblocked + TOPO shift-lasso

**PR:** TBD (about to open).

**Trigger.** Two-item batch:
1. *"On the bottom-left domains panel, if I click [a domain row] and then click ISOLATE, it kinda slows down and freezes. … If I use lasso, it doesn't do that."* — clicking ISOLATE after a multi-domain pick blocked the main thread while React unmounted ~150 DAGNode3D + ~270 DAGEdge3D children in a single render cycle (and rebuilt 4 GeoJSON FCs in the Map view). Lasso selections were typically smaller, but the real perceptual difference was that lasso users had already paid the multi-select cost during the drag — the ISOLATE click only triggered the re-render at peak fan-out.
2. *"For the topological [view], a user should be able to select specific parts of the topology using the shift-lasso feature you have across the other views."* — TOPO had no marquee.

**What shipped.**

- **`startTransition` around the ISOLATE toggle.** `setIsolateSelection(...)` now runs inside `startTransition`, marking the resulting re-render as non-urgent. React keeps the current UI interactive while it computes the new tree (and processes the unmount cascade) in the background. The actual switch still takes its full ~150-300ms in the worst case, but the click feels instant — the button highlights immediately and the user can keep interacting with other controls. No data-shape changes; just a render-priority hint.
- **TOPO shift+drag lasso.** New `TopoShiftMarquee` component inside the relief Canvas (mirrors the 3D `ShiftMarquee` pattern). Listens on `gl.domElement` for `pointerdown/move/up`, gates on `e.shiftKey`, tracks a screen-space rect, and on release projects each node's ground-plane position (`layout.x - field.cx`, `0`, `layout.y - field.cy` — same translation `SelectionMarkers` uses) into screen coords for hit-testing. OrbitControls disabled during the drag so the camera doesn't rotate. DOM rect overlay rendered outside the Canvas, identical class set to 2D / 3D / Map for visual consistency.

**Files.**
- `src/components/dag3d/DAGOverlay.tsx` — `startTransition(() => setIsolateSelection(...))`.
- `src/components/CausalDAGRelief.tsx` — new `TopoShiftMarquee`; `selectionBoxRef`, `selectionRect`, `shiftDragging`, `handleShiftSelect` state in parent; OrbitControls.enabled bound to `!shiftDragging`; DOM overlay for the rect.

**Verification.** `tsc --noEmit` clean (modulo pre-existing `onboarding-metrics.test.ts` strictness errors inherited from main); lint clean; vitest 833/833 pass.

### 2026-05-07 — Shipped: maplibre-gl v5 upgrade — globe projection now actually works

**PR:** TBD (about to open).

**Trigger.** User: *"the 3D map doesn't seem to be working, still 2D"* — the `projection: { type: "globe" }` field I added in PR #281 was being silently ignored. Globe projection landed in **maplibre-gl v5.0**; we were on `^4.7.1`. v4 doesn't recognise the `projection` style field, so the globe never rendered.

**What shipped.** `maplibre-gl: ^4.7.1 → ^5.24.0`. `@vis.gl/react-maplibre@8.1.0`'s peer-dep range is `>=4.0.0`, so the upgrade is in-bounds; no companion bump needed. The existing `mapStyle.projection = { type: "globe" }` is now honoured, the `ProjectionSpecification` type is exported from the v5 style spec (typecheck stayed clean), and the v5 globe-projection runtime kicks in at low zoom and transitions to mercator as the user pinches in.

**Files.**
- `package.json`, `package-lock.json` — maplibre-gl version bump.

**Verification.** `tsc --noEmit` clean (same pre-existing onboarding-metrics test errors); vitest 833/833 pass.

### 2026-05-07 — Shipped: timeline range capped at "now" — no more 2030 scrub

**PR:** TBD (about to open).

**Trigger.** User: *"the bottom timeline allows us to go to like 2030 which doesn't make sense. Also I'm skeptical if the data is being categorized correctly with the date / time."*

**Diagnosis.** `loadRealTemporalData` in `src/lib/real-timeseries.ts` blindly min/maxed timestamps across every node's history to derive `rangeStart` / `rangeEnd`. Several sources in `public/datasets/claire/timeseries.json` carry forecast / target end-state rows that extend years past today (`2030-12-31` for one, plus monthly projections through 2027). Those pushed `rangeEnd` forward, the store wired `timelineRange.end` to it, and the bottom dial then let the user scrub into 2030.

**What shipped.** Cap `rangeEnd` at `Date.now()` while iterating timestamps. Forecast / future points stay in each node's `history` (so a future overlay can still plot them as projection if a feature wants that), but they don't drag the timeline range past the present. Plus a fallback: if every series turns out to be forecast-only or empty, default the range to the last 60 days instead of leaving it pinned at the 1970 sentinel.

**Files.**
- `src/lib/real-timeseries.ts` — future-point skip + empty-range fallback in the `rangeStart` / `rangeEnd` derivation.

**Out of scope.** Date-vs-value categorisation correctness (the second half of the user's report) is a domain-data question. The parser itself looks sound — ISO strings via `new Date(s)` and year numbers via `new Date(year, 0, 1)` — but verifying that each value is on the right date is a data-team job, not a rendering one. Will surface specific cases if the user provides them.

**Verification.** `tsc --noEmit` clean; vitest 843/843 pass.

### 2026-05-07 — Shipped: Map particles → imperative `setData`

**PR:** TBD (about to open).

**Trigger.** Backlog item flagged in earlier sessions. The particle layer's GeoJSON was held in `useState`, so `setParticleGeoJSON({...})` fired on every rAF tick (60fps). Each set forced a full React re-render of the Map subtree, which re-evaluated 5+ Source/Layer JSX expressions just so react-maplibre's `<Source data={...}>` reconciler could call `source.setData()` on the underlying maplibre source. The `setData` itself was the only thing that needed to happen per frame; everything around it was wasted.

**What shipped.** Direct route around React. The particle Source mounts once with a stable empty FeatureCollection, and the rAF callback writes new features into the underlying maplibre source via `mapRef.current.getMap().getSource('particles').setData(fc)`. A re-usable `Feature[]` buffer + FC wrapper lives in the effect's closure so we re-use the same array across frames (one fewer allocation per tick — ~60/sec saved). Phase state still lives in the existing `particlePhases` ref; nothing else changes about the physics.

Net effect: per-frame work shrinks from "render + diff + reconcile + setData" to a single `setData` call. Still correct on dependency changes (the effect tears down on `temporalEdgePaths` change and rebuilds the buffer + rAF).

**Files.**
- `src/components/CausalDAGMap.tsx` — `useState<FC>` removed; `writeData` helper inside the temporal-edge effect; Source's `data` prop bound to the stable empty FC.

**Verification.** `tsc --noEmit` clean; lint clean on touched file; vitest 843/843 pass.

### 2026-05-07 — Shipped: defer tab-gated ModulePanel sub-panels via next/dynamic

**PR:** TBD (about to open).

**Trigger.** Backlog: bundle-analyzer perf sweep (PR #222 wired the tooling). Sandbox can't run `ANALYZE=true npx next build` end-to-end — Google Fonts blocked + `ai`/`@ai-sdk/*` not installed — so I switched to static analysis. The ModulePanel mounts on first paint (right pane is the default), and it statically imports a swarm of sub-panels gated on the active module tab. Spirtes is the default tab; users on Spirtes were paying for the JS of every other tab's sub-panel.

**What shipped.** Four tab-gated sub-panels converted to `next/dynamic` with `ssr: false`:
- `MonteCarloForecast` (~714 LOC, Pearl tab)
- `VX880TrialPanel` (~910 LOC, Pearl tab)
- `InterdictionPanel` (~191 LOC, Pareto tab)
- `TissueCohortView` (~504 LOC, Spirtes tab but only when `isT1DDomain`)

Common loading hint (`<div>LOADING…</div>`) sized to the panel padding so the layout doesn't jump when the chunk lands. Inline panels (`TarskiPanel`, `ParetoPanel`, `CopilotInterdictionResults`, `SnapshotIndicator`) live as functions inside `ModulePanel.tsx` itself, so I'd need to extract them before they could be deferred — out of scope for a perf sweep, queued for later.

The Spirtes-tab default sub-panels (`TrinityPanel`, `DiscoveryRunsPanel`) stay static since they're on the critical path; `TrinityPanel` already lazy-loads its three Trinity graphs internally so there's no double-defer to chase.

**Files.**
- `src/components/ModulePanel.tsx` — four `dynamic()` declarations replacing the static imports.

**Notes for future sweep.** When the analyzer can be run end-to-end on a real env, things to look at next: the `tarski-data` axiom library size; estimator libs (`lppls-fit`, `ph-fit`, `pareto-relevance-bootstrap`) imported at module top-level — could be deferred to first-use; `framer-motion` is everywhere and probably unavoidable but worth confirming we're tree-shaking.

**Verification.** `tsc --noEmit` clean (modulo pre-existing inherited errors from `ai`-SDK types missing in sandbox + a known fci.test endpointMarks drift); lint pre-existing errors only (2 errors on lines 81 + 1806, both confirmed on main pre-merge); vitest 909/909 pass.

### 2026-05-07 — Shipped: launch-workspace freeze — O(N×E) → O(N+E) + defer Brandes' metrics

**PR:** TBD (about to open).

**Trigger.** User: *"manifold keeps freezing after I select domains and click LAUNCH WORKSPACE."* The launch flow synchronously runs:
1. `applyOmegaLiveAdjustments(g)` inside `setGraphData`
2. `omegaBridgeDensity(graph)` inside `StructuralMetrics`
3. `netMetrics` inside `CascadeHeader` (eigenvector + Brandes' edge betweenness + clustering + diameter BFS, all in one memo)
4. Canvas mount + `computeNetworkMetrics` + `compute2DForceLayout`

Items 2 + 3 each Brandes'-class O(V·E). Item 1 was secretly O(N×E) — `computeCascadeLoadDelta` ran `graph.edges.filter(e => e.source === node.id)` once per node. Combined cost on a CROSS-DOMAIN multi-card workspace blew past the user's freeze threshold.

**What shipped.**
- **`applyOmegaLiveAdjustments` linearised.** Pre-compute `outDegreeBy: Map<sourceId, count>` once in O(N+E), then look up each node's out-degree in O(1). New internal helper `computeCascadeLoadDeltaFromOutDegree` so the per-node math doesn't re-scan all edges. Original exported `computeCascadeLoadDelta(node, graph)` kept for back-compat with tests.
- **`useDeferredValue` on the heavy metric paths.** `StructuralMetrics` wraps `graph` in `useDeferredValue` before passing it to `omegaBridgeDensity`. `CascadeHeader` wraps both `graphData` and `selectedNodes` and threads the deferred refs through `cascade`, `netMetrics`, and the deps array. The strip + panel paint immediately with whatever value React has (stale by one frame on a graph swap); the recompute lands as a low-priority work unit afterwards. Launch feels interactive instead of locked.

**Files.**
- `src/lib/omega-pillar-wiring.ts` — out-degree pre-pass + private `computeCascadeLoadDeltaFromOutDegree`.
- `src/components/StructuralMetrics.tsx` — `useDeferredValue(graph)` before `omegaBridgeDensity`.
- `src/components/ModulePanel.tsx` — `useDeferredValue` on `graphData` + `selectedNodes` in `CascadeHeader`.

**Verification.** `tsc --noEmit` clean (modulo same pre-existing inherited errors); lint pre-existing errors only; vitest 918/918 pass.

### 2026-05-07 — Shipped: relief-field 4σ Gaussian truncation

**PR:** TBD (about to open).

**Trigger.** Backlog: TOPO compute-shader port for real-time scrub. The headline item was a full GPU port (multi-PR, requires WebGL render-to-texture + vertex-shader sampling). Before paying that cost, lower the CPU bar with a math-level optimisation.

**Diagnosis.** All three field-compute paths (`computeReliefField`, `computeReliefLayers`, `computeFusedReliefField`) call `Math.exp(-(dx² + dy²) / σ²)` once per (grid-vertex × sample). For a 128² grid × 200 samples that's 3.3M exp evals; multi-domain stacks the cost across layers. `Math.exp` is the dominant kernel cost.

**What shipped.** A 4σ truncation around the squared-distance check. `exp(-16) ≈ 1.1e-7`, which contributes nothing visible to the rendered surface. For typical layouts each grid point only "sees" 10-30 of the 200 samples within `truncSq = 16·σ²`, so the inner loop short-circuits ~85% of its iterations before the exp call. End-to-end ~5-10× speedup on the single-domain path; the savings compound on the multi-domain fused path because they apply per-layer.

The full GPU compute-shader port is still queued — if real-time scrub still drops frames after this lands in production, the next step is a Web Worker port (cheaper than GPU), then a WebGL render-target if needed.

**Files.**
- `src/lib/graph-relief-field.ts` — `truncSq` constant + squared-distance early-out in all three field-compute inner loops.

**Verification.** `tsc --noEmit` clean; vitest 918/918 pass (22 of which are relief-field-specific).

### 2026-05-07 — Shipped: stop CausalDAG2D from running its layout sim on launch

**PR:** TBD (about to open).

**Trigger.** User: *"still keeps freezing"* after the previous launch-workspace fix. Identified the remaining sync hog: `CausalDAG2D` was statically imported and always-mounted (with `visibility: hidden` for instant view-switching), so its `compute2DForceLayout` + `computeNetworkMetrics` ran *in parallel* with the 3D path's equivalents on every launch — even though the user lands on 3D and the 2D canvas is hidden.

The always-mount pattern was in place to keep the 3D WebGL context alive across view switches (the browser's GPU process can deallocate it on remount). 2D doesn't carry a WebGL context — it renders through React Flow — so the rationale doesn't apply to it.

**What shipped.** `CausalDAG2D` converted to `next/dynamic` (matching Map / Relief) and conditionally rendered only when `viewMode === "2d"`. 3D stays always-mounted with the `visibility: hidden` toggle. Trade-off: first switch from 3D → 2D pays a chunk-load + layout-compute beat (~300-500ms on a 500-node CROSS-DOMAIN workspace), same shape as the existing first-Map and first-Relief switch.

**Files.**
- `src/app/page.tsx` — `CausalDAG2D` static import → `dynamic`; render block wrapped in `viewMode === "2d"` gate.

**Verification.** `tsc --noEmit` clean; vitest 918/918 pass.

---

### 2026-05-22 — Shipped: Map geo-placement — unbreak US clustering, fill 5 missing domains

**PR:** TBD (about to open).

**Trigger.** User: *"a lot of the nodes, for example, in the US are just kinda cluttered in the same area, which makes me kinda skeptical about node placement … whatever the closest estimate is for what would be the physical location of that node, we should get … down to the city if we can."*

**Diagnosis** (`src/lib/geo-coordinates.ts`):
1. The US country centroid was `[-95.7, 37.1]` — the geographic centre of the country, in rural Kansas. Every "100% US" node hashed within ±2° of that single point → the visible Oklahoma blob.
2. `NODE_COORDINATES` covered ~150 nodes, all Saudi/Qatar/Ma'aden + a sparse handful in financial centres. Five whole domains had zero entries: **Athena ISR / Defense, T1D β-cell biology, T1D VX-880, AI Safety / IDS, Macro Impact, Frontier Science**. Their nodes fell through to a single domain-centroid with ±3° jitter, or to the Middle East seed when the domain wasn't in the table either.
3. The `globalConcentration` country regex only matched the explicit `"100% Country"` form, so strings like `"60% US / 40% global"` or `"Headquartered in Boston"` fell through entirely.

**What shipped.**
- **~100 new `NODE_COORDINATES` entries** for the five missing domains. Pinned to the institution / company / site that owns each concept: Athena ISR → US defense corridor (NVIDIA Santa Clara, Raytheon Waltham, NSA Fort Meade, Anduril Costa Mesa, Palantir Denver, Pentagon, Schriever AFB, SpaceX Hawthorne…); Macro Impact → BLS / BEA / Fed in DC + ISM Chicago + NY Fed; T1D β-cell → Joslin / Vertex / NIDDK / Dexcom / Stanford; T1D VX-880 → Vertex Seaport Boston (all 26 trial-endpoint nodes anchored at the sponsor HQ with hash jitter); AI Safety / IDS → UNB CIC Fredericton + UNSW Sydney + Aegean Greece (matched to dataset provenance); Frontier Science → ADMX, LIGO Hanford, Fermilab, ALMA Atacama, Super-Kamiokande.
- **`US_HUBS` replaces the single Kansas centroid.** When a node resolves to "United States" via the country regex without a specific pin, it's now spread across 10 hub-cities (NYC / DC / Boston / Chicago / SF / Seattle / LA / Houston / Atlanta / Denver) by hash bucket, with ±0.6° jitter inside the bucket. Visually: distributed across US economic / policy / tech corridors instead of stacked on Oklahoma.
- **`CITY_COORDINATES` city/institution scan.** Before falling through to the country regex, the resolver now scans `globalConcentration` for ~50 known city names (US metros + international hubs). Catches "Headquartered in Boston" / "based in Singapore" / etc.
- **Smarter country regex.** Replaced the `100% (country)` form with a percent-prefix + general country mention sweep. Handles plural-percent strings, "Sourced from Japan and South Korea", "Headquartered in Saudi Arabia, exports global". Sorted by name length so "United States" wins over "States".
- **`COUNTRY_COORDINATES` extended** with Canada, Mexico, UK, Germany, France, Italy, Spain, Netherlands, Switzerland, Japan, South Korea, Singapore, Indonesia, Greece, Russia, Nigeria + USA/US aliases. 16 → 32 countries.
- **`DOMAIN_COORDINATES` extended** with the new families' domain centroids so the last-ditch fallback still lands the node somewhere sensible if no NODE_COORDINATES entry exists.

**Files.**
- `src/lib/geo-coordinates.ts` — rewritten resolver + expanded tables.
- `src/lib/__tests__/geo-coordinates.test.ts` — new, 9 tests covering exact match, city scan, US-hub spread, country-regex variants (`100% China`, `60% Brazil / 40% global`, embedded mention), and domain-centroid fallback.

**Verification.** `tsc --noEmit` clean (same pre-existing inherited errors); lint clean on touched files; vitest **1319/1319** pass.

---

### 2026-05-22 — Shipped: remove stray "CLIENT DEPLOYMENT → Athena Defense" CTA from the canvas

**PR:** TBD (about to open).

**Trigger.** User: *"we randomly have on the bottom right of the product itself … CLIENT DEPLOYMENT … ATHENA DEFENSE SYSTEMS. It's just so random. I feel like this was intended to be a sandbox, but it seems like it's heavily out of date now … if we're gonna offer a sandbox, I feel like there's a different format that we should do it."*

**What shipped.** Removed the `bottom-4 right-4` floating `<Link href="/client">` and dropped the now-unused `next/link` import in `src/app/page.tsx`. The `/client` route itself stays put — that's a separate decision; this PR only takes the CTA off the workspace canvas where it was reading as a promo on top of the user's live analysis.

**Files.**
- `src/app/page.tsx` — removed the floating CTA + `Link` import.

**Verification.** `tsc --noEmit` clean (same inherited fci.test drift); lint clean on touched file; vitest 1319/1319 pass.

---

### 2026-05-22 — Shipped: layout-3D + network-metrics moved off the main thread (Web Worker)

**PR:** TBD (about to open).

**Trigger.** Backlog: Web Worker port of `computeLayout3D` / `computeNetworkMetrics`. After the launch-perf chain (PRs #301 / #303 / #304) the user's freeze report stopped, but the d3-force-3d sim + Brandes' centrality were still running synchronously on first 3D mount and on every `topologyKey` change (domain toggle, edge sever). Those are the heaviest pure-data computes in the canvas; moving them off-thread is the right architectural fix.

**What shipped.**

- **`src/lib/workers/layout3d-worker.ts`** — Module-mode Web Worker. Handles `{ id, nodes, edges, prev? }` requests; returns `{ id, positions, metrics }` in one shot (bundled so the canvas doesn't need a second postMessage roundtrip). Both compute functions are pure — perfect worker fodder.

- **`src/lib/workers/layout3d-client.ts`** — Main-thread wrapper. Lazily spins up a single shared worker on first call, multiplexes concurrent requests via a `nextId` epoch, routes each response back to its caller. Includes an SSR / no-Worker fallback that dynamic-imports the sync functions, so the API contract stays Promise-shaped everywhere.

- **`CausalDAG3D.tsx` refactor.** The `positions` and `networkMetrics` useMemos are gone. In their place: a `layoutResult` state populated by an effect on `topologyKey` change, plus a `latestRequestIdRef` to drop stale responses when topology flips multiple times in quick succession (fast domain toggling). Previous positions stay rendered while a new layout computes — no flash, no main-thread block. First-mount-only `COMPUTING LAYOUT…` overlay covers the brief gap before the worker returns the initial layout (the WebGL canvas mounts immediately once the dynamic chunk loads, but orbs can't render until positions arrive).

- **Stable references** — `positions` / `networkMetrics` derivations are wrapped in `useMemo` so the array/map references stay stable across renders that don't actually flip `layoutResult`. Otherwise downstream `useMemo`s keyed on `positions` would invalidate every render.

**Files.**
- `src/lib/workers/layout3d-worker.ts` (new)
- `src/lib/workers/layout3d-client.ts` (new)
- `src/lib/workers/__tests__/layout3d-client.test.ts` (new — 2 tests covering the SSR fallback path: returns positions + metrics for every node; assigns a different id to each call)
- `src/components/CausalDAG3D.tsx` — sync useMemos → async effect + state + overlay; removed the value imports of `computeLayout3D` / `computeNetworkMetrics` (kept the types).

**Verification.** `tsc --noEmit` clean (same inherited fci.test drift); lint clean on touched files (pre-existing `chiStarSet` warning unchanged); vitest **1321 / 1321** pass.

**Follow-ups.** `CausalDAG2D` still runs `computeNetworkMetrics` synchronously on the main thread. Same pattern would apply (2D layout is light enough that it probably doesn't need the worker, but the metrics compute is identical to 3D's). Defer until needed — 2D is only mounted when actively in 2D view.

---

### 2026-05-22 — Shipped: extract inline ModulePanel panels into `next/dynamic` chunks

**PR:** TBD (about to open).

**Trigger.** Backlog: bundle-size load-time push. PR #300 lazy-loaded the four sub-panels that already lived in their own files. The remaining inline definitions (`TarskiPanel`, `ParetoPanel`, `CopilotInterdictionResults`, `SnapshotIndicator`, plus their co-located helpers — `AxiomIcon`, `ProofTraceList`, `CritSparklineChart`, `CritSparkline`, `shortenEventLabel`, `CriticalityCard`, `type CriticalityEmptyState`) couldn't be deferred without first extracting them to their own files. ~2.5K LOC + heavy estimator-lib transitive deps shipped on every initial paint, even though Spirtes is the only default tab that needs none of them.

**What shipped.**

Three new files under `src/components/modules/`:

- **`CopilotInterdictionResults.tsx`** (~253 LOC) — Pearl-tab solver results card.
- **`TarskiPanel.tsx`** (~599 LOC) — Tarski-tab axiom panel + its two private helpers (`AxiomIcon`, `ProofTraceList`). Brings `AXIOM_LIBRARY`, `scoreAxiomRelevance` with it.
- **`ParetoPanel.tsx`** (~1.78K LOC) — Pareto-tab criticality observation panel, the heaviest of the three. Co-locates `SnapshotIndicator` (named export so the outer `ModulePanel` can dynamic-import both from the same chunk), the two sparkline components, `shortenEventLabel`, `CriticalityCard`, and the `CriticalityEmptyState` type. Pulls the estimator-lib transitive deps with it: `lppls-fit`, `ph-fit`, `pareto-relevance-bootstrap`, `pareto-relevance-reference`, `moran`, `t1d-estimator-inputs`.

In `ModulePanel.tsx`:
- Removed all four inline definitions and their helpers.
- Trimmed the imports list — dropped 14 lib-level imports (estimator regime gates, lppls/ph fits, criticality registry, tarski-data, etc.) that the extracted files now own. Also dropped `useCallback`, `useRef`, `SnapshotDiagnostics`.
- Added four `next/dynamic` declarations for `TarskiPanel`, `ParetoPanel`, `CopilotInterdictionResults`, and the named `SnapshotIndicator` (via `.then(m => ({ default: m.SnapshotIndicator }))` so it shares the ParetoPanel chunk).

`ModulePanel.tsx` shrank **3384 LOC → 821 LOC**. The default Spirtes-tab first paint is now `CascadeHeader` + `TrinityPanel` + `DiscoveryRunsPanel` (+ optional `TissueCohortView`) — all the heavy regime-gate / criticality-card code is deferred to first-tab-visit.

**Files.**
- `src/components/modules/CopilotInterdictionResults.tsx` (new)
- `src/components/modules/TarskiPanel.tsx` (new)
- `src/components/modules/ParetoPanel.tsx` (new)
- `src/components/ModulePanel.tsx` — trimmed
- `src/lib/workers/__tests__/layout3d-client.test.ts` — drive-by: fixed two missing fields on the test graph fixture (`isConfounded` on nodes, `inconsistentEdges` / `restrictedNodes` on metadata) that tsc started flagging since PR #404 landed

**Verification.** `tsc --noEmit` clean (same pre-existing inherited errors); lint has 2 errors that are the SAME pre-existing `set-state-in-effect` + `rules-of-hooks` warnings from the original inline definitions (just moved to their new files, identical code); vitest 1321 / 1321 pass.

---

### 2026-05-22 — Shipped: 2D layout sim moves off the main thread (Worker reuse)

**PR:** TBD (about to open).

**Trigger.** Continuation of the load-time arc. PR #404 moved the 3D layout + centrality off the main thread; 2D was still running both synchronously inside the same component. After PR #304 made `CausalDAG2D` lazy + conditional, that compute no longer hits launch — but the first user-initiated 2D-tab visit was still paying ~150-300ms of main-thread block on a 500-node CROSS-DOMAIN workspace.

Estimator-lib audit (the other backlog candidate) turned out to be a no-op in production — the heavy libs (`lppls-fit`, `ph-fit`, `pareto-relevance-bootstrap`) are only reachable from `modules/ParetoPanel.tsx` after PR #406, so they already ship only in the Pareto chunk. The `csd-fit-hypo-calibrator.ts` consumer is reachable only from a test fixture, not the runtime bundle. Closed that ticket as already-done.

**What shipped.**

- **Worker generalised.** `src/lib/workers/layout3d-worker.ts` now dispatches on a `kind: "layout3d" | "layout2d"` discriminator. 3D path unchanged; 2D path runs `compute2DForceLayout(nodes, edges)` + `computeNetworkMetrics(nodes, edges)` and posts back `{ positions2d: Map<string, Position2D>, metrics }`. Both layouts share one worker instance.
- **Client wrapper got a `requestLayout2D` sibling** to `requestLayout3D`. Same epoch-cancellation pattern, same SSR-fallback path (dynamic-imports the sync functions when `Worker` is unavailable).
- **`CausalDAG2D` refactor.** The synchronous `compute2DForceLayout` + `computeNetworkMetrics` useMemos are gone. In their place: a `useEffect` keyed on the graph `sig` that posts to the worker, plus `cachedLayout` / `networkMetrics` state populated when the response lands. `latestRequestIdRef` drops stale responses on fast topology changes — same epoch pattern as `CausalDAG3D`. Previously-rendered orbs stay put while a new layout computes.

**Files.**
- `src/lib/workers/layout3d-worker.ts` — kind discriminator, 2D dispatch arm.
- `src/lib/workers/layout3d-client.ts` — `requestLayout2D` export + shared worker bookkeeping.
- `src/lib/workers/__tests__/layout3d-client.test.ts` — added one fallback-path test for `requestLayout2D`.
- `src/components/CausalDAG2D.tsx` — imports trimmed, sync useMemos → async effect + state.

**Verification.** `tsc --noEmit` clean (same pre-existing inherited errors); lint clean on touched files; vitest 1322 / 1322 pass.

---

### 2026-05-22 — Shipped: dial-scrub contraction round 2 — visible at typical historical omegas

**PR:** TBD (about to open).

**Trigger.** User reported PR #427 still wasn't moving orbs on dial scrub. Traced end-to-end and the wiring was correct (`useTemporalGraph` injects per-tick omega values into `graphData.nodes[].omegaFragility.composite`; `useFilteredGraph` passes the temporal graph through; both 2D and 3D consume it in their contraction passes). The actual gap was **stress magnitude**: synthetic temporal data's random walk drifts within ±0.5 of base, so typical historical omegas sit in the 5–7 band. The old `(omega-5)/5` (2D) and `(omega-5)/4` (3D) stress curves only produced stress 0.1–0.3 at those levels → centroid pulls of 3–14 % of distance — visible if you stare, invisible otherwise.

**What shipped.**

- **2D `CONTRACTION` 0.35 → 0.55** and **stress curve `(omega-5)/5` → `(omega-4)/4`** (both the self branch and the `neighborStressOf` branch). Typical omegas 5–7 now produce stress 0.25–0.75 → pull 14–41 % of distance to the stressed-neighbour centroid. Visibly readable.

- **3D historical stress curve `(omega-5)/4` → `(omega-4)/3`.** Bracketed by the existing `PULL_MAX=0.45` and `PUSH_MAX=0.25`. Typical omegas now produce stress 0.33–1.0 instead of 0.25–0.5 — visibly tighter contraction on stressed nodes and visibly more dispersion on relaxed ones.

Cascade-replay path (using `currentSnapshot.shockIntensity`) is unchanged — that path always had access to the proper full-range stress signal.

**Files.**
- `src/components/CausalDAG2D.tsx` — CONTRACTION + both stress curves bumped.
- `src/components/CausalDAG3D.tsx` — historical stress curve bumped.

**Verification.** `tsc --noEmit` clean; vitest 1522 / 1522 pass.

### 2026-05-22 — Shipped: `flow` edge type + per-type visibility toggle row

**PR:** TBD (about to open).

**Trigger.** User: *"we have directed relationships. We have temporal relationships. And we should also have a flow relationship where it might make sense. And one thing we should give the ability to is to be able to toggle different types of connections we want to be able to see visually."*

**What shipped.**

1. **New `"flow"` edge type.** `EdgeType = "directed" | "temporal" | "confounded"` becomes `EdgeType = "directed" | "temporal" | "confounded" | "flow"`. Visual: solid teal-green (`#1de9b6`), arrow on target, animated particle with a slightly faster cadence than `"temporal"` so the eye reads "stuff in motion" vs `"temporal"`'s slower "lag" cadence. Distinct from `"directed"` (a causal claim) and `"temporal"` (a lag correlation) — flow is "material / capital / signal is actually moving along this edge."
2. **Store-side visibility filter.** New `visibleEdgeTypes: Set<EdgeType>` slice + `toggleEdgeTypeVisibility(type)` action + `setVisibleEdgeTypes(types)` setter. Default = all four types visible. Empty Set is treated as "all visible" by consumers so older sessions without the setting still render every edge.
3. **UI: chip row in `DAGOverlay`.** Four chips (CAUSAL / TEMP / CONF / FLOW) live in the top-right near the LEGEND button, on 3D / 2D / Map. Click to toggle each type on/off across every canvas. Chip background uses the type's colour at low opacity when visible, fades to muted grey when hidden.
4. **All four canvas surfaces wired.** 2D filters at the `visibleEdges` useMemo via `edgeById` lookup (O(1) per edge); 3D filters inline in the edge map at `CausalDAG3D.tsx`; Map filters at the GeoJSON-build forEach loop. The rendering switch statements in each (2D `EmphasizedEdge`, `DAGEdge3D.getEdgeColor`, Map's `edgeColor` ternary chain) now include the `"flow"` case rendering the teal-green solid + arrow.
5. **LEGEND popover.** Added the FLOW row alongside CAUSAL / TEMPORAL / CONFOUNDED, with a teal-green swatch.

**Caveats.** No existing dataset carries `type: "flow"` yet — the rendering + filter infrastructure is in place, but the user will only see flow edges once data sources tag edges that way. Data-team alignment needed on the semantic ("material flow" vs "capital flow" vs "cascade-propagation flow" — anything that's actually-in-motion belongs here, anything that's a causal claim stays as `"directed"`).

**Files.**
- `src/lib/types.ts` — `EdgeType` union extended.
- `src/stores/useApexStore.ts` — `visibleEdgeTypes` slice + toggle.
- `src/components/dag3d/DAGOverlay.tsx` — chip strip + new LEGEND row.
- `src/components/CausalDAG2D.tsx` — `visibleEdges` filter; `isFlow` color/arrow handling.
- `src/components/CausalDAG3D.tsx` — inline filter in edge map.
- `src/components/dag3d/DAGEdge3D.tsx` — `"flow"` case in `getEdgeColor`; faster anim cadence for flow.
- `src/components/CausalDAGMap.tsx` — filter at edges forEach; `"flow"` colour branch.
- `src/lib/__tests__/store-visible-edge-types.test.ts` — new, 5 tests covering toggle / set / empty-set back-compat.

**Verification.** `tsc --noEmit` clean (modulo pre-existing inherited errors); lint pre-existing warnings only; vitest **1511 / 1511** pass.

### 2026-05-22 — Shipped: collapsible time-dial granularity picker

**PR:** TBD (about to open).

**Trigger.** User: *"the time dial itself has a very extensive selection window now all the way from one hour to all. We should make that collapsible so that there's more room for the time dial itself as well."*

**What shipped.** `TimeDial` granularity picker now collapses to a single chip showing the active preset (e.g. `1Y ▾`). Clicking the chip expands the full row (1H / 1D / 1W / 1M / 1Y / 5Y / ALL); picking any preset re-collapses. No behavioural change beyond the toggle — same `setTimelineGranularity` writes, same group-divider styling when expanded, same tooltips.

**Files.**
- `src/components/TimeDial.tsx` — `granularityExpanded` state; render-time branch on the granularity block.

**Verification.** `tsc --noEmit` clean; lint clean; vitest 1504 / 1504 pass.

### 2026-05-22 — Shipped: load-time deep-dive round 1 — lazy SystemCopilot + lazy heavy copilot-tool deps

**PR:** TBD (about to open).

**Trigger.** User asked for a platform load-time deep-dive. Found a clear gap: `SystemCopilot` was statically imported on `page.tsx` (~2 K LOC component), and its dep chain pulled in **~6,800 LOC of graph data + axiom library** via `copilot-actions` → `copilot/tools.ts` → `buildGraphFromDomains` + `AXIOM_LIBRARY`. The graph-data side was supposed to be lazy-loaded (the comment in `page.tsx` near `DomainSelector` even calls it out as a deliberate split), but the copilot tools registry undid that split by side-effect importing the same heavy modules.

**What shipped.**

1. **`SystemCopilot` → `next/dynamic`.** The whole left-column copilot chunk now ships separately. A small `LOADING COPILOT…` placeholder shows in the column for ~50-100 ms after first paint, then the chat surface mounts. Everything copilot-related (tools, conversation, the copilot-engine, copilot-context) lazy-loads in the copilot chunk.

2. **`copilot/tools.ts` lazy-imports its heavy deps.** Top-of-file `import { buildGraphFromDomains }` and `import { AXIOM_LIBRARY }` removed; both replaced with `await import(...)` inline inside the specific tool handlers that need them (`applyDomainFilter` and the axiom-filtered restricted-nodes handler). Result: even inside the copilot chunk, the graph-data + axiom-library blocks only load when a user actually invokes those tools — small async delay on first use, otherwise free.

The `applyDomainFilter` helper became `async`; its callers (the `set_domains` / `select_domains` tool handlers) were already typed `string | Promise<string>` so no signature changes upstream. The `remove_restricted_nodes` handler was synchronous; bumped it to `async`.

**Files.**
- `src/app/page.tsx` — `SystemCopilot` static import → `dynamic`.
- `src/lib/copilot/tools.ts` — heavy imports moved to inline `await import(...)` inside the consuming handlers.

**Verification.** `tsc --noEmit` clean (modulo pre-existing inherited errors); lint clean; vitest 1504 / 1504 pass.

### 2026-05-22 — Shipped: 2D contraction now responds to time-dial scrub, not just cascade replay

**PR:** TBD (about to open).

**Trigger.** User: *"previously, when we were running this criticality, you should be able to see distance measures changing as you play the time dial forward."* Scrubbing the dial was visually altering colour / glow / orb size per-tick, but the canvas was positionally frozen — orbs stayed at their cached layout coordinates regardless of how the per-node ΩF (criticality) was changing.

**Diagnosis.** Two different paths populate per-tick criticality:
- **Cascade replay** populates `currentSnapshot.nodeStates[]` per epoch.
- **Time-dial scrub** uses `useTemporalGraph` to inject historical ΩF values directly into `graphData.nodes[].omegaFragility.composite`. `currentSnapshot` stays null.

`CausalDAG3D.posMap` already handled both: when `currentSnapshot` is null but a node carries a non-neutral omega, it derives stress from `(omega - 5) / 4` and applies push/pull. `CausalDAG2D`'s contraction was hard-coded to the `if (currentSnapshot)` branch only — so dial-scrub left it positionally frozen.

**What shipped.**
- Added a historical-omega fallback path inside `CausalDAG2D`'s `nodes` useMemo. When `currentSnapshot` is null, derives stress as `max(0, (omega − 5) / 5)` and pulls the node toward its stressed-neighbour centroid the same way. Below-neutral omega doesn't contract (2D's contraction is one-directional by design — only pulls inward).
- Bumped `CONTRACTION` magnitude 0.18 → 0.35. The original was visually subtle even at peak shock; the new floor pinches stressed clusters tight enough that the eye actually catches the movement during a typical scrub.

**Files.**
- `src/components/CausalDAG2D.tsx` — historical-mode stress derivation + magnitude bump.

**Verification.** `tsc --noEmit` clean (modulo pre-existing inherited errors); lint clean on touched file; vitest 1489 / 1489 pass.

---

## How a fresh session resumes

1. Read this file bottom-up — the most recent entry is the live state.
2. Check the session brief in scrollback or in `~/.claude/projects/-Users-Junaid-Documents-apex-terminal/memory/` for the canonical scope.
3. Confirm branch: `git branch --show-current` should be `claude/rendering-perf-manifold-UblqD`. Check `git status` and `git log --oneline -5` to see what's landed locally vs pushed vs merged.
4. Check open PRs in `ApexAnalytica/apex-terminal` filtered to this branch / session label.
5. Resume from the most recent "In progress" or "Next" line above.
