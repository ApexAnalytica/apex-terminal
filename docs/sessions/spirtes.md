# Session: SPIRTES (Causal Structure Discovery)

Owns the engine that discovers causal structure from data. Runs three discovery algorithms in parallel and surfaces results to the UI as edges and edge annotations.

> **Status:** session brief is being inferred from cross-references — fill in detail as the session establishes itself.

## Scope summary (in)

- **DCD / NOTEARS** — nonlinear structure discovery.
- **PCMCI+** — time-lagged causal effects across T-2 / T-1 / T-0 columns.
- **FCI** — hidden-confounder detection. Latent common causes surface as dashed edges with `?` markers.
- Cascade-header readouts driven by SPIRTES output (e.g. spectral radius λmax — below 1.0 the network is contractive and stable).
- Discovery API endpoint: `src/app/api/structure/route.ts`.
- Right-panel rendering of discovery results — *the engine's contribution* to the panel; the panel chrome itself is UX.

## Scope summary (out — route elsewhere)

- The right-panel layout, module tabs, and tab-switching UX → **UX & Onboarding**.
- The graph data and node/edge schema → respective **data sessions** (Geopolitical/Macro, T1D).
- Canvas rendering of edges (solid, dashed, color) → **Rendering**. SPIRTES *outputs* the edge type; Rendering draws it.
- Constraint verification of discovered edges → **TARSKI**. SPIRTES proposes; TARSKI audits.
- Auth / API gating → **Platform**.

## Boundary clarifications

- **Edge styling**: SPIRTES decides `solid` vs `dashed` vs `?` semantically. Rendering decides the visual treatment.
- **Snapshots**: when discovery results are part of a System State Snapshot for the copilot, the snapshot mechanics are shared with PEARL/PARETO/TARSKI; agree on a common snapshot schema.

## Anchor files (current / inferred — verify in session)

- `src/app/api/structure/route.ts` — discovery API.
- `src/lib/graph-data.ts`, `src/lib/athena-graph-data.ts` — graph data this engine reads. (Owned by data sessions; SPIRTES is a consumer.)
- TODO: identify the SPIRTES-specific engine module (if any) vs. logic spread across `copilot-engine.ts` / `omega-engine.ts` and consolidate.

## Notes on current state (verify in session)

- All four panels (DCD/PCMCI+/FCI + StructuralMetrics) currently render **precomputed** discovery tags from `src/lib/graph-data.ts` (`discoverySource: "DCD" | "PCMCI+" | "FCI" | "merged"` on each `CausalNode`, `lag` on edges, `isConfounded` on nodes). The panels do layout + temporal-window deltas, not real algorithm execution.
- "Spirtes-live" — running real DCD/PCMCI+/FCI on rolling windows — is a phase-2 effort that hasn't started. Needs separate scoping (in-browser library vs server-side with streamed results).
- Network metrics (eigenvector centrality, betweenness, clustering, density, community structure, spectral stability) computed live in StructuralMetrics from the current `graphData`.

## Cross-references to TARSKI live-feed work

The TARSKI session has shipped two live API feeds (EIA Persian Gulf throughput, OFAC SDN sanctions) that mutate `CausalNode.liveData[]` and feed the validator. Spirtes panels read the same `graphData`, so any live mutation surfaces on the discovery panels too — but Spirtes has no algorithm-side response to live data yet (no recompute on tick). See `docs/sessions/tarski.md` for the feed-proxy pattern; reusing it for any Spirtes-driven live signal is straightforward.

## Likely upcoming themes

- Phase-2 Spirtes-live: real algorithm runs on rolling windows.
- Hardening of latent-confounder detection (FCI) for production graphs.
- Confidence/uncertainty surfacing in the right panel.
- Wiring network metrics → ΩF pillar **C** (systemic cascade load) — verify present and quantitatively sane.

## How to start a task

1. Confirm in-scope (structure discovery algorithms, their outputs, the structure API route).
2. Coordinate with TARSKI when discovered edges affect verification.
3. Coordinate with Rendering when changing how edge types are encoded visually.
4. **Update this file** at the end of every material change.
