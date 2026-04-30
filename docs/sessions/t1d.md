# Session: T1D / Life Sciences

Owns the Type-1 Diabetes graph data, β-cell dynamics, T1D-specific domain profile, and the vocabulary that flows through the sidebar/inspector when a T1D dataset is active.

> **Status:** session brief is being inferred from cross-references — fill in detail as the session establishes itself.

## Scope summary (in)

- T1D graph data:
  - `src/lib/t1d-graph-data.ts` — main T1D causal graph.
  - `src/lib/t1d-vx880-graph-data.ts` — VX-880 trial-specific graph.
  - `src/lib/vx880-trial-data.ts` — trial cohort data, NLME decay, Cox HR readout (#105).
  - `src/lib/t1d-estimator-inputs.ts` — estimator input wiring.
- T1D domain profile entries in `src/lib/domain-profiles.ts`.
- Persona mapping: T1D datasets are **Scientist** persona under Analyst/Scientist/Cross-Domain (`dataset: t1d`).
- T1D-specific vocabulary surfaced in sidebar / inspector / pillar labels (note: per #70, top-bar module tabs stay canonical SPIRTES/TARSKI/PEARL/PARETO regardless of profile).
- Pillar / regulatory tier definitions specific to T1D (FDA accelerated-approval, pediatric trial restrictions, orphan designation, ex-US approval divergence).
- Time-series mappings for T1D nodes — `src/lib/node-timeseries-map.ts` Tier-A entries (digitised published sources). Nodes without Tier-A mapping fall back to NO-DATA sparklines.
- Trial-cohort UI surface: `src/components/VX880TrialPanel.tsx`.
- Constraint authoring (regulatory tier definitions) co-authored with **TARSKI**.

## Scope summary (out — route elsewhere)

- Engine logic (SPIRTES discovery, TARSKI verification, PEARL interventions, PARETO criticality) → respective **engine sessions**. T1D supplies the data and domain-specific constants; engines compute on it.
- Persona pill UX, Domain Workspace card layout, persona switching mechanics → **UX & Onboarding**. T1D defines the domain entries; UX renders the cards and pills.
- Canvas, layout, viewport → **Rendering**.
- Auth / API gating → **Platform**.

## Boundary clarifications

- **Vocabulary**: T1D-specific module names / pillar labels live in the T1D `DomainProfile` entry. They flow through sidebar and inspector. They do **not** flow through the top-bar tabs (those are pinned canonical labels per #70).
- **Trial priors**: T1D owns the trial-data files (VX-880, etc.). PEARL consumes them as a survival prior into Monte Carlo (#107). Adding a new trial means updating both — coordinate.

## Anchor files

- `src/lib/t1d-graph-data.ts`
- `src/lib/t1d-vx880-graph-data.ts`
- `src/lib/vx880-trial-data.ts`
- `src/lib/t1d-estimator-inputs.ts`
- `src/lib/node-timeseries-map.ts` (Tier-A T1D entries)
- `src/lib/domain-profiles.ts` (T1D profile entries)
- `src/components/VX880TrialPanel.tsx`
- Reference doc: [`docs/MANIFOLD_FOR_T1D.md`](../MANIFOLD_FOR_T1D.md) and the T1D restoration HTMLs under `docs/`.

## Shipped PRs (representative)

- **#61** — M-T1D-02 estimator suite: Python reference + TS ports (BOCPD, TE, Moran, Takens)
- **#105** — VX-880 trial cohort analysis panel: NLME decay + Cox HR readout
- **#106** — wire `t1d-vx880` selector id to T1D VX-880 graph domain
- **#107** — wire VX-880 trial fits as a survival prior into Monte Carlo
- **#108** — tighten PROTECT GRAFT shock; default MC target to trial outcome

## Likely upcoming themes

- Additional digitized trials (beyond VX-880) as Tier-A data lands.
- Tier-B / Tier-C dataset onboarding (the sparkline NO-DATA fallbacks).
- Profile-specific shock library expansion (PARETO scenario injector).
- TODO: fill in as the session ships work.

## How to start a task

1. Confirm in-scope (T1D data, profile, vocabulary, trial digitization).
2. Coordinate with the relevant engine session when adding/editing data they consume.
3. Coordinate with UX when adding new persona-mapped domain cards.
