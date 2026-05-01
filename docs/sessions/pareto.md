# Session: PARETO (Criticality Horizons & Ω-Fragility)

Owns the criticality-monitoring engine: three independent signals each with a T-N countdown and confidence, plus the Ω-Fragility composite framework that drives node coloring across the app.

> **Status:** session brief is being inferred from cross-references — fill in detail as the session establishes itself.

## Scope summary (in)

- **CSD** — Critical Slowing Down. Watches recovery-rate decay via λmax approaching 1.0.
- **PH** — Persistent Homology. Sweeps a filtration for topological fragility holes.
- **LPPLS** — Log-Periodic Power Law Singularity. Fits the Sornette crash model.
- Each criticality card surfaces: observed vs model signal, formula, methodology, current assessment, expandable temporal chart with residual.
- **Ω-Fragility** composite (0–10) on every node, broken into five pillars:
  - Irreplaceability
  - Restoration Latency
  - Jurisdictional Hazard
  - Cascade Load
  - Tail Depth
- Ω-Fragility Assessment summary in the panel: NOMINAL / ELEVATED / CRITICAL / OMEGA_BREACH.
- Top critical nodes ranked by Ω-score.
- **CDΩ Doomsday Monitor** — header strip showing buffer depletion (green → amber → red), T-Nd, regime classification (STABLE, MELT_UP, CRASH, PHASE_TRANSITION, STAGNATION), Dragon-King probability, active-shock count.
- **Scenario Injector** — preset shocks calibrated for the active domain (Strait of Hormuz closure, Abqaiq attack, LNG train outage, insulin supply-chain disruption, etc.). Each depletes the buffer per its severity.
- News interpreter ingestion (article → graph interventions): the *engine logic* is here — the in-app paste/URL/loading panel UX is **UX**.
- Engine modules:
  - `src/lib/omega-engine.ts`
  - `src/lib/pareto-relevance.ts`
  - `src/lib/criticality-registry.ts`

## Scope summary (out — route elsewhere)

- Right-panel chrome, tabs, expand-panel UX → **UX & Onboarding**.
- Canvas color encoding of Ω-Fragility (hotter = higher Ω) → **Rendering** draws; PARETO supplies values.
- News-interpreter UI (paste affordance, URL fetch button, loading skeletons, error copy) → **UX**.
- Graph data → **data sessions**.
- Interventions / Monte Carlo cascade simulation → **PEARL** (PARETO consumes intervention output to update criticality; PEARL produces it).
- Auth / API gating → **Platform**.

## Boundary clarifications

- **News interpreter**: engine logic and the article→intervention transformation are PARETO. The panel where users paste a URL/article, the loading state, and the error message wording are UX.
- **Empty-state copy** (e.g. "NO DATA — static Ω only" on ΩF SERIES cards): the *trigger condition* is PARETO; the *wording* is UX.

## Anchor files

- `src/lib/omega-engine.ts`
- `src/lib/pareto-relevance.ts`
- `src/lib/criticality-registry.ts`
- `src/lib/cascade-simulator.ts` (shared with PEARL)
- News interpreter UI surface: `src/components/news/*` (UX-owned chrome around PARETO logic).
- TODO: identify any PARETO-specific API routes.

## Shipped PRs (representative)

- **#52** — news interpreter panel: article → graph interventions
- **#58** — URL-fetch button: paste a link instead of full article text
- **#109** — real F·E·G·S relevance score with LPPLS and PH grid-fits

## Likely upcoming themes

- Tighter LPPLS / PH fits as more time-series land.
- Scenario library expansion per active domain.
- Cross-domain Ω composition for multi-domain workspaces.
- TODO: fill in as the session ships work.

## How to start a task

1. Confirm in-scope (criticality signals, Ω-Fragility, scenario injection, news interpretation logic).
2. Coordinate with PEARL when intervention output should update criticality estimates.
3. Coordinate with UX when changing user-visible copy on cards / news panel / empty states.
