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

### 2026-05-02 — Next up

- **Issue #1 — 3D Sugiyama layout.** Highest-leverage rendering item still open. Next on deck unless redirected.

---

## How a fresh session resumes

1. Read this file bottom-up — the most recent entry is the live state.
2. Check the session brief in scrollback or in `~/.claude/projects/-Users-Junaid-Documents-apex-terminal/memory/` for the canonical scope.
3. Confirm branch: `git branch --show-current` should be `claude/rendering-perf-manifold-UblqD`. Check `git status` and `git log --oneline -5` to see what's landed locally vs pushed vs merged.
4. Check open PRs in `ApexAnalytica/apex-terminal` filtered to this branch / session label.
5. Resume from the most recent "In progress" or "Next" line above.
