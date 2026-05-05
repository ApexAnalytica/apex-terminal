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

### 2026-05-03 — Next up

- Verify replay animation on production: load any demo flow → hit play → watch the topo surface morph as epochs advance. Expect the REPLAY · EPOCH N pill in the top-right and label Ω values updating in sync. Remaining follow-ups: onboarding tooltip (most users still won't intuit the topographic mental model on first glance), real-time scrub perf (preview-resolution-during-drag or compute-shader port). Outside TOPO: deferred 3D `onPointerMove` throttle, map-view imperative-setData refactor, real bundle-analyzer perf sweep using PR #222's tooling.

---

## How a fresh session resumes

1. Read this file bottom-up — the most recent entry is the live state.
2. Check the session brief in scrollback or in `~/.claude/projects/-Users-Junaid-Documents-apex-terminal/memory/` for the canonical scope.
3. Confirm branch: `git branch --show-current` should be `claude/rendering-perf-manifold-UblqD`. Check `git status` and `git log --oneline -5` to see what's landed locally vs pushed vs merged.
4. Check open PRs in `ApexAnalytica/apex-terminal` filtered to this branch / session label.
5. Resume from the most recent "In progress" or "Next" line above.
