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

## Session log

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

### 2026-05-03 — Next up

- TBD — open for direction. Two remaining of the original three-way split: map orb batching (#3), or the deferred 3D follow-ups (Canvas onPointerMove throttle / hoist).

---

## How a fresh session resumes

1. Read this file bottom-up — the most recent entry is the live state.
2. Check the session brief in scrollback or in `~/.claude/projects/-Users-Junaid-Documents-apex-terminal/memory/` for the canonical scope.
3. Confirm branch: `git branch --show-current` should be `claude/rendering-perf-manifold-UblqD`. Check `git status` and `git log --oneline -5` to see what's landed locally vs pushed vs merged.
4. Check open PRs in `ApexAnalytica/apex-terminal` filtered to this branch / session label.
5. Resume from the most recent "In progress" or "Next" line above.
