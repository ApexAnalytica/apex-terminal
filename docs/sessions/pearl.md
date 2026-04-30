# Session: PEARL (Do-Calculus, Interventions, CASCADE DEFENSE)

Owns the structural-intervention engine: do-calculus, manual ablations (SEVER / ABLATE), and the auto-interdiction optimizer rebranded as **CASCADE DEFENSE**.

> **Status:** session brief is being inferred from cross-references — fill in detail as the session establishes itself.

## Scope summary (in)

- **Do-calculus** — `do(X)` interventions that isolate a node from its causes.
- **Manual ablations** — SEVER (cuts an edge; goes amber, functionally removed but physically possible), ABLATE (deletes nodes/edges entirely).
- **CASCADE DEFENSE** (auto-interdiction):
  - Minimax optimization to find the cheapest set of edges whose removal maximally reduces downstream cascade damage.
  - When attacker-defender min-cut is solvable: explicit SEVER / ABLATE buttons per recommended cut.
  - When not: fallback to a structural-vulnerability ranking of the next-most-brittle edges.
  - Auto-triggers a Monte Carlo forecast so the user sees the expected damage distribution before committing.
- Counterfactual timeline support — the Time Dial gains a second timeline (BASELINE vs INTERVENTION) when an intervention exists. PEARL produces the counterfactual data; the time-dial UI mechanics are shared with Rendering.
- VX-880 trial fits as a survival prior into Monte Carlo (ref #107).
- Engine modules:
  - `src/lib/intervention-engine.ts`
  - `src/lib/ablation-engine.ts`
  - `src/lib/interdiction-engine.ts`
  - `src/lib/monte-carlo-engine.ts`
  - `src/lib/cascade-simulator.ts`
  - `src/lib/trial-prior.ts`

## Scope summary (out — route elsewhere)

- Vocabulary distinction between manual interdiction (PEARL) and CASCADE DEFENSE (auto) → **UX & Onboarding** owns the copy; PEARL owns the underlying mechanic.
- Canvas state changes (amber edges, deleted nodes) → **Rendering** draws; PEARL decides the state.
- Right-panel UI and module tabs → **UX & Onboarding**.
- Time-dial scrubber UI → **Rendering** / **UX**; PEARL provides the counterfactual data.
- Graph data → respective **data sessions**.
- SPIRTES / TARSKI / PARETO outputs that feed PEARL inputs → respective engine sessions.

## Boundary clarifications

- **CASCADE DEFENSE rename**: vocabulary is locked at "CASCADE DEFENSE" (replacing "Interdiction") per #31. UX session enforces; PEARL respects in any new copy added inside engine output.
- **Trial-prior plumbing**: PEARL consumes VX-880 trial data (`src/lib/vx880-trial-data.ts`). The data file itself is a data-session concern (T1D); PEARL is a consumer.

## Anchor files

- `src/lib/intervention-engine.ts`
- `src/lib/ablation-engine.ts`
- `src/lib/interdiction-engine.ts`
- `src/lib/monte-carlo-engine.ts`
- `src/lib/cascade-simulator.ts`
- `src/lib/trial-prior.ts`
- `src/components/VX880TrialPanel.tsx` (right-panel surface for trial data)
- TODO: identify any PEARL-specific API routes.

## Shipped PRs (representative)

- **#31** — rename "Interdiction" → "CASCADE DEFENSE"; AI ablation interpretation engine-side
- **#107** — wire VX-880 trial fits as a survival prior into Monte Carlo
- **#108** — tighten PROTECT GRAFT shock; default MC target to trial outcome

## Likely upcoming themes

- Counterfactual visualization quality (BASELINE vs INTERVENTION clarity in the time dial).
- Auto-interdiction performance on larger graphs.
- More trial priors as additional T1D / other-domain trials are digitized.
- TODO: fill in as the session ships work.

## How to start a task

1. Confirm in-scope (interventions, ablations, CASCADE DEFENSE, Monte Carlo, counterfactuals).
2. Coordinate with PARETO when intervention output drives criticality changes.
3. Coordinate with Rendering for any new visual treatment of intervened edges/nodes.
