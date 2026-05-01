# Session: TARSKI (Constraint Verification)

Owns the engine that audits every edge in the causal graph against domain-aware axioms in three tiers: PHYSICAL, REGULATORY, HEURISTIC.

> **Status:** Active. Live API feeds wired into A-04 (Hormuz throughput) and R-01 / R-02 (sanctions) as of PR #142 / #145.

## Scope summary (in)

- The three axiom tiers:
  - **PHYSICAL** (Level 0) — immutable laws (e.g. A-01 Temporal Priority, A-02 Flow Conservation, A-03 DAG Integrity, A-04 Strait of Hormuz, A-05 Single-Source Fragility, plus the T1D physiological set TA-01..TA-06).
  - **REGULATORY** (Level 1) — sanctions, export controls, treaties, FDA tiers, IRB constraints (R-01..R-04 geopolitical, TR-01..TR-05 T1D).
  - **HEURISTIC** (Level 2) — anomaly flags (H-01, H-02 geopolitical; TH-01..TH-04 T1D).
- Auto-ranking constraints by relevance to active domains via `scoreAxiomRelevance(graph, activeProfileId)` in `src/lib/tarski-data.ts`.
- The VERIFY action: toggle axioms, run verification, recolor canvas (violating edges → red), expose clickable proof traces explaining which constraint failed.
- Constraint catalog and proof-trace logic.
- Snapshot validator: `src/lib/snapshots/tarski-validator.ts` (thinner — currently 5 axioms; see Open work).
- **Live API feeds** that drive engine state — feed proxies, polling hooks, store mutators, validator branches.
- Engine-side ΩF wiring: Tarski violations → pillar **J** (jurisdictional hazard). Spirtes-metrics → pillar **C** (cascade) is owned in the SPIRTES doc.

## Scope summary (out — route elsewhere)

- Right-panel chrome and tab UX → **UX & Onboarding**.
- Canvas recoloring of violating edges → **Rendering** does the recolor; TARSKI decides which edges violate.
- Graph data (the edges being verified) → **data sessions** (Geopolitical/Macro, T1D).
- Discovery of new edges (which TARSKI then verifies) → **SPIRTES**.
- Auth / API gating → **Platform**.
- Pentagon ΩF radar plot in node-detail box → **UX & Onboarding** (punted from this session).
- Live ticks → continuous TimeSeriesOverlay curves with omegaComposite projection → **Rendering**.

## Boundary clarifications

- **Constraint authoring**: domain-specific constraints (T1D regulatory tiers, geopolitical sanctions) are authored *with* the relevant data session but the verification mechanism stays here.
- **Profile-specific axioms**: each `DomainProfile` may surface its own axioms — TARSKI consumes the profile via `appliesTo: string[]`, doesn't define it.
- **Live feeds in node attributes**: the engine session owns the *consumption* of live data into validator checks (via `liveData?: LiveDataPoint[]` on `CausalNode`). The data session owns the topology (which nodes exist, what jurisdictions they're in).
- **Status surfacing**: a small `<LiveFeedStatus />` chip strip lives in `src/components/LiveFeedStatus.tsx`. This is engine state surfacing (mirrors the brief's "status string, badge rendering" carve-out), not UI restyling.

## What's shipped (in chronological order)

### PR #7 — original dynamic Tarski engine
Rewrote axioms from generic physics to Middle East energy/petrochemical. Shipped VERIFIED-mode live validation, red/dashed flagging, proof traces, restricted-node lists, per-axiom violation counts.

### PR #14 — copilot routes to live Tarski state
System copilot answers about graph consistency now route to the live engine state instead of static text.

### PR #65 — 15 T1D axioms
TA-01..06 physiological, TR-01..05 clinical/regulatory, TH-01..04 heuristic biology with `relevantDomains` matching the five T1D graph-domain names.

### PR #66 — `appliesTo` profile filter
`TarskiAxiom.appliesTo: string[]` filters the library by active profile. T1D no longer surfaces chokepoint/sanctions axioms; geopolitical no longer surfaces glycemic/C-peptide axioms.

### PR #75 — fixed 7 leaking "universal" axioms
A-01, A-02, A-03, A-05, R-04, H-01, H-02 had geopolitical-flavored language (Aramco, LNG, Hormuz). Tagged `appliesTo: ["geopolitical"]`. Open follow-up: build a genuinely profile-agnostic universal axiom library.

### PR #142 — Live API feeds → Tarski engine *(latest material change)*
Three squashed commits introducing the first live API feeds:

1. **EIA Persian Gulf throughput → A-04 Hormuz**
   - `/api/feeds/eia/hormuz` queries EIA v2 international/data summed across Saudi/UAE/Iran/Iraq/Kuwait/Qatar, scaled by 0.85 Hormuz transit fraction.
   - 6h server cache, 5min client poll. Mock fallback (clearly tagged `(mock — EIA_API_KEY unset)`) when key absent.
   - A-04 prefers `liveData.value / liveData.capacity > 0.9`; structural edge-weight sum > 3.0 is the fallback.

2. **OFAC SDN → R-01 + new R-02 runtime**
   - `/api/feeds/ofac/sdn` proxies Treasury's pipe-CSV, parses entries → programs → ISO-2 country codes via static `PROGRAM_PREFIX_TO_COUNTRY` map.
   - 24h cache, 30min poll, mock-fallback on Treasury error.
   - R-01 prefers live sanctions on either endpoint; static `max(J) ≥ 8` falls through.
   - **R-02 gained its first runtime check** (was relevance-only before): live sanctions OR static J ≥ 7, AND restorationLatency ≥ 7 → flag.
   - Multi-signal `liveData` migration: `CausalNode.liveData` → `LiveDataPoint[]` with `kind` discriminator. Forced by Hormuz being both a chokepoint AND in a sanctioned jurisdiction.

3. **Status strip + TimeDial markers**
   - `<LiveFeedStatus />` chip strip at bottom-left of DAG canvas.
   - Each new feed reading appends a `TemporalEvent` to `temporalData.events`. TimeDial subscribes reactively; markers appear automatically without touching the dial.

### PR #145 — Layout fix + OFAC zero-entry fallback
- Strip moved from top-right (overlapped TOP-Ω panel) to bottom-left.
- Stale chips render at `opacity-50` to de-emphasize unfetched feeds.
- OFAC route: if parser returns 0 jurisdictions on 200 OK (Treasury redirect / maintenance), serve mock-fallback so the engine path still exercises rather than going stale.

## Architectural decisions

### `liveData` shape
- `CausalNode.liveData?: LiveDataPoint[]` — array, not single field.
- Each `LiveDataPoint` has `kind: "throughput" | "sanctions" | string`, plus `value`, `capacity`, `unit`, `observedAt`, `source`.
- Helpers `getLiveSignal(node, kind)` and `upsertLiveSignal(arr, point)` exported from `types.ts`.
- Reasoning: single-slot would clobber on every poll cycle when a node carries two signals.

### Validator branches (the pattern)
- Validator checks first try `getLiveSignal(node, kind)`; if present, use the quantitative ratio. Fall back to static omega-profile fields when absent so demos without a live feed attached still produce sensible flags.
- Proof trace gains an optional `detail: string` field for the quantitative readout ("Strait of Hormuz: 18.50/21.00 mb/d = 88.1% — EIA …").

### Feed proxy pattern (reusable)
1. **Server route** at `/api/feeds/<provider>/<endpoint>/route.ts` — holds keys, module-level cache with TTL, mock fallback on upstream error / parse failure. Headers `x-feed-cache`, `x-feed-mode`.
2. **Library** at `src/lib/feeds/<provider>-<endpoint>.ts` — URL builder, response parser, mock generator, types. Pure functions.
3. **Client hook** at `src/hooks/use<Provider>Feed.ts` — `setInterval` + `AbortController`, gated to relevant profile.
4. **Store action** in `useApexStore.ts` — maps payload → graph mutation, upserts `liveData`, appends `TemporalEvent`, re-runs validation when VERIFIED.
5. **Mount** in `src/app/page.tsx`.

### TimeDial integration discipline
Engine-side only: `applyHormuzLiveData` / `applyOfacLiveData` append `TemporalEvent` via the `appendFeedEvent` helper, returning a new `temporalData` reference. TimeDial subscribes reactively. **Never edit `TimeDial.tsx`** — that's rendering territory.

### Two-validator fork (deferred)
- `src/lib/snapshots/tarski-validator.ts` runs only 5 axioms; called from `setSnapshot()`.
- `runTarskiValidation` in `tarski-data.ts` runs all 32; called from `runTarskiWithAxioms()`, used by TarskiPanel and the live feeds.
- The live signal feeds the **full** validator. Snapshot validator is currently disconnected.
- Cleanup planned but not done.

## Anchor files

```
src/lib/types.ts                              LiveDataPoint, getLiveSignal/upsertLiveSignal helpers, ProofTrace.detail
src/lib/tarski-data.ts                        AXIOM_LIBRARY (32), runTarskiValidation, A-04/R-01/R-02 with liveData branches
src/lib/feeds/eia-hormuz.ts                   EIA URL builder, parser, mock; HORMUZ_CAPACITY_MBD = 21
src/lib/feeds/ofac-sdn.ts                     OFAC pipe-CSV parser, PROGRAM_PREFIX_TO_COUNTRY, mock
src/lib/snapshots/tarski-validator.ts         THIN snapshot validator (5 axioms) — deferred cleanup
src/stores/useApexStore.ts                    applyHormuzLiveData, applyOfacLiveData, appendFeedEvent helper
src/hooks/useHormuzFeed.ts                    5-min poll, geopolitical-only gate
src/hooks/useOfacFeed.ts                      30-min poll, geopolitical-only gate
src/components/LiveFeedStatus.tsx             Chip strip (bottom-left of DAG canvas)
src/app/api/feeds/eia/hormuz/route.ts         EIA proxy
src/app/api/feeds/ofac/sdn/route.ts           OFAC proxy with zero-entry defensive fallback
```

### Tests contributed by this session

- `src/lib/__tests__/feeds/eia-hormuz.test.ts` — 7 (URL builder, parser, mock)
- `src/lib/__tests__/feeds/ofac-sdn.test.ts` — 10 (URL constant, programToCountry, CSV parser, mock)
- `src/lib/__tests__/tarski-a04-livedata.test.ts` — 4 (A-04 liveData branch + structural fallback)
- `src/lib/__tests__/tarski-r01-r02-livedata.test.ts` — 7 (R-01/R-02 liveData + static branches)
- `src/lib/__tests__/live-feed-status.test.ts` — 10 (feedModeFromSource, timeAgoLabel)
- `src/lib/__tests__/store-feed-events.test.ts` — 7 (TemporalEvent emission, dedup)

**45 new tests** total. Project total: 375 / 375 passing.

## Env vars (operator)

| Name | Required | Behavior if unset |
|---|---|---|
| `EIA_API_KEY` | optional | `/api/feeds/eia/hormuz` returns mock data tagged `(mock — EIA_API_KEY unset)`. Register at https://www.eia.gov/opendata/register.php |
| `OFAC_SDN_URL` | optional | Defaults to `https://www.treasury.gov/ofac/downloads/sdn.csv`. Mock-fallback on errors / zero-entry parse |

## Verifying live status on production

1. `manifold.apexanalytica.co` → log in → pick any geopolitical domain.
2. Bottom-left of DAG canvas → "LIVE FEEDS" header + two chips.
3. Mode dot color: 🟢 green pulse = real upstream · 🟠 amber = mock-fallback · ⚪ grey = mock/stale.
4. DevTools Network → response header `x-feed-mode` confirms.
5. Click Strait of Hormuz node in VERIFIED mode — proof-trace details show quantitative readouts (A-04 ratio, R-01 program count, R-02 force majeure rationale).

## Open follow-ups (priority-ordered)

1. **Two-validator fork resolution** — route `setSnapshot()`-side validation through the full 32-axiom library.
2. **Profile-agnostic universal axiom library (#75 follow-up)** — A-01/A-02/A-03/H-01/H-02 are all `appliesTo: ["geopolitical"]` because their language is energy-flavored. Build a clean cross-profile version.
3. **More live feeds** — same proxy pattern as EIA/OFAC. Candidates:
   - USGS critical minerals → A-05 Single-Source Fragility
   - NOAA storm tracks → conflict-zone proxies
   - World Bank governance indicators → R-04 Cross-Domain Dependency
4. **ΩF pillar wiring audit** — confirm Tarski violations actually feed pillar **J** scalar; verification task.
5. **More T1D axioms** as clinical evidence lands (MODY exclusions, LADA, age-of-onset, exogenous insulin half-life). Coordinate with T1D session.
6. **More geopolitical axioms** as new data verticals land. Coordinate with Geopolitical/Macro session.

## How to start a task

1. Read this file end-to-end.
2. `git log --oneline main -10` for any commits since "Status" line above.
3. Check open PRs: GitHub MCP `mcp__github__list_pull_requests`.
4. Pick from "Open follow-ups" or take fresh user direction.
5. **Update this file** at the end of every material change.
