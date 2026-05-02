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

### 2026-05-02 — Next up

- TBD — open for direction.

---

## How a fresh session resumes

1. Read this file bottom-up — the most recent entry is the live state.
2. Check the session brief in scrollback or in `~/.claude/projects/-Users-Junaid-Documents-apex-terminal/memory/` for the canonical scope.
3. Confirm branch: `git branch --show-current` should be `claude/rendering-perf-manifold-UblqD`. Check `git status` and `git log --oneline -5` to see what's landed locally vs pushed vs merged.
4. Check open PRs in `ApexAnalytica/apex-terminal` filtered to this branch / session label.
5. Resume from the most recent "In progress" or "Next" line above.
