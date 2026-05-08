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
- **Communities are now real.** Previously the "Communities" zone in `ModulePanel.tsx` was just a relabeling of `node.domain` — a fake "label propagation, 10 iterations" comment masked a one-line domain regroup. As of the modularity-greedy work, `src/lib/community-detection.ts` runs Louvain phase 1 (local-move modularity optimization) on the actual edge topology. The panel now surfaces emergent groupings, the modularity-proxy intra-edge fraction, and badges cross-domain communities (the interesting cases — communities the topology says belong together that the curator-assigned domain partition splits).

## Cross-references to TARSKI live-feed work

The TARSKI session has shipped two live API feeds (EIA Persian Gulf throughput, OFAC SDN sanctions) that mutate `CausalNode.liveData[]` and feed the validator. Spirtes panels read the same `graphData`, so any live mutation surfaces on the discovery panels too — but Spirtes has no algorithm-side response to live data yet (no recompute on tick). See `docs/sessions/tarski.md` for the feed-proxy pattern; reusing it for any Spirtes-driven live signal is straightforward.

## Likely upcoming themes

- Phase-2 Spirtes-live: real algorithm runs on rolling windows.
- ~~Hardening of latent-confounder detection (FCI) for production graphs.~~ ✅ shipped (FCI v0.1) — `src/lib/discovery/algorithms/fci.ts`. Skeleton phase (PC-stable) + v-structure orientation, returns a Partial Ancestral Graph with `endpointMarks: { sourceMark, targetMark }` (`circle`/`arrow`/`tail`) on every edge. Linear-Gaussian CI tests via the existing `partialCorrelation` helper. Registered in `algorithm-registry.ts`. 10 unit tests cover independence, chain, fork, collider patterns + output-shape contracts. Open follow-ups: orientation rules R1–R4 (Zhang 2008) to propagate endpoints beyond v-structures; nonparametric CI tests; UI wiring (current SPIRTES discovery panels still render precomputed `isConfounded` labels — wiring FCI's PAG output into the FCI panel is a separate small PR).
- ~~Confidence/uncertainty surfacing in the right panel.~~ ✅ shipped — `src/lib/discovery-uncertainty.ts` + `summarizeDiscoveryUncertainty(nodes, edges)` returns mean / median edge confidence, low-confidence count (`< 0.7`, matching Tarski A-06), and node-level breakdown by `discoverySource` (DCD / PCMCI+ / FCI / merged). New UNCERTAINTY zone in StructuralMetrics surfaces all of it; header chip shows `μ <mean>` and an amber `· N low-conf` badge when any edges are below the threshold.
- ~~Wiring network metrics → ΩF pillar **C** (systemic cascade load) — verify present and quantitatively sane.~~ ✅ verified — `src/lib/omega-pillar-wiring.ts` + 16 tests in `omega-pillar-wiring.test.ts`. Uses out-degree above structural-median threshold (5) as cheap proxy, capped at +3.0. Future refinement candidate: weight by *cross-community* out-degree (using the new `detectCommunities`) — a hub bridging communities is more cascade-prone than a hub serving its own community.
- **Communities on the canvas (Rendering follow-up).** `detectCommunities` returns a stable `membership: Map<nodeId, communityId>`. Rendering can pick this up and add a "color-by-community" toggle alongside the existing color-by-domain mode (in 2D, 3D, and Relief views). Optionally a translucent hull overlay around each community. SPIRTES side is done; the work is in the Rendering session.
- **Louvain phase 2 (multilevel).** Current implementation is single-pass — communities found, but no super-node aggregation + recursion. For larger graphs this can leave the modularity below optimum. Phase 2 would aggregate communities into super-nodes and re-run, repeating until modularity stops improving. Defer until graph size warrants it.

## How to start a task

1. Confirm in-scope (structure discovery algorithms, their outputs, the structure API route).
2. Coordinate with TARSKI when discovered edges affect verification.
3. Coordinate with Rendering when changing how edge types are encoded visually.
4. **Update this file** at the end of every material change.
