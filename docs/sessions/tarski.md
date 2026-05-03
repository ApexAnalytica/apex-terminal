# Session: TARSKI (Constraint Verification)

Owns the engine that audits every edge in the causal graph against domain-aware axioms in three tiers: PHYSICAL, REGULATORY, HEURISTIC.

> **Status:** Active. Live API feeds wired into A-04 (Hormuz throughput), R-01 / R-02 (sanctions). Live Coverage Program: 7 providers shipped (EIA, OFAC, FRED, World Bank, OpenFDA, ClinicalTrials.gov, Derivations) covering **~43 graph nodes** including the T1D side, EM FX, sovereign default, and MENA import dependency. **Real-data-only goal reached: 0 synthetic composites remaining** — all 4 originally synthetic composites are now live-derived from real data. All free-tier; mock fallback when keys/upstream missing.
>
> **Stated end-state goal:** every node carries continuously-pulled real data. **No synthetic composites.** 4 composites still synthetic as of this writing — all 4 have a concrete path to real-data backing (see "Real-data-only goal" section below).

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

### Per-card live-data rows + scalable display layer
- Standalone `<LiveFeedStatus />` component **deleted**. Live data now surfaces per-node, where it belongs.
- Each `RiskPropagationFlow` card (the "ΩF TIME SERIES" cards) renders one row per `node.liveData[]` entry between the domain-badge row and the sparkline. Card without live data → renders nothing.
- Global feed summary inlined in the `ΩF TIME SERIES` header (right-aligned): counts distinct feed `kind`s by mode (`live | mock-fallback | mock`), so "is anything flowing?" is answered at a glance without scanning every card.
- New shared display module `src/lib/feeds/display.ts`:
  - `feedModeFromSource`, `timeAgoLabel`, `feedDotClass` — utility helpers.
  - `KIND_FORMATTERS` registry: per-`kind` formatter producing `{shortLabel, primaryValue, qualifier}`. Throughput → "EIA · 18.50 mb/d · 88%". Sanctions → "OFAC · Iran · 4 prog". Generic fallback for unknown kinds → "value unit · ratio%".
  - `summarizeLiveFeeds(nodes)` → mode counts.
- **Adding a new feed now requires zero card changes.** New feed writes a new `kind` to `liveData[]` via the proxy → cards iterate and render the entry automatically. Optionally add a `KIND_FORMATTERS` entry for nicer display; otherwise generic fallback handles it.

### Profile-agnostic polling
- Both `useHormuzFeed` and `useOfacFeed` now gate on `graphData.nodes.length > 0` instead of "selectedDomains looks geopolitical".
- Justification: the cards layer, store actions, and display registry are all profile-agnostic. The hooks were the only place hardcoding "geopolitical" — a contradiction with the rest of the design.
- Each feed self-gates via the store action's node-matching: EIA matches "strait of hormuz"/"chokepoint" labels (no T1D node has those), OFAC matches sanctioned-country keywords (same). Sessions with no matches receive nothing — no waste in the UI, no special-casing per profile.
- A future cross-profile feed (T1D ADA targets, CGM streams, USGS minerals affecting either profile, etc.) plugs in identically — no profile gates to add or update.

### Phase 1 — Provider registry refactor *(latest material change)*

**Why:** The "one hook + one route + one store action per feed" pattern doesn't scale. The "Live coverage program" goal (every node on a real feed, ~167 nodes today) would explode into ~700 files. This refactor introduces the registry pattern so adding a new feed = one provider file + one server route + one registry entry, regardless of how many nodes the provider covers.

**New shape:**

```
src/lib/feeds/
  providers/
    types.ts             FeedProvider interface, FeedDispatchBatch, FeedDispatchEvent
    eia-hormuz.ts        EIA provider (matchPayload + cadence + label)
    ofac-sdn.ts          OFAC provider
  registry.ts            FEED_PROVIDERS list — single source of registered providers
  display.ts             (existing — KIND_FORMATTERS + utilities)
  eia-hormuz.ts          (existing — server-side URL builder + parser + mock, used by route)
  ofac-sdn.ts            (existing — same)

src/hooks/
  useFeedRegistry.ts     Single generic hook — iterates registry, polls each provider
                         on its cadence, dispatches batches to the store

src/stores/useApexStore.ts
  applyFeedBatch         Single generic action: upserts liveData[] from updates,
                         drops stale signals of `signalKinds` from non-matching nodes,
                         emits TemporalEvent if event provided, reruns Tarski validation
                         if VERIFIED mode is active
```

**Removed:**
- `src/hooks/useHormuzFeed.ts` (deleted)
- `src/hooks/useOfacFeed.ts` (deleted)
- `applyHormuzLiveData` and `applyOfacLiveData` actions (replaced by `applyFeedBatch`)

**Adding a new feed now requires:**
1. New `src/lib/feeds/providers/<name>.ts` implementing `FeedProvider` (matchPayload + cadence + label).
2. New `src/app/api/feeds/<path>/route.ts` matching the provider's `endpoint` (existing pattern).
3. One line added to `src/lib/feeds/registry.ts`.
4. (Optional) one entry in `KIND_FORMATTERS` (`src/lib/feeds/display.ts`) for nicer display.

**Adding more nodes to coverage of an existing provider:**
- Extend that provider's `matchPayload` to recognise more nodes. Zero other changes.

### Live coverage program — sequenced roadmap

A multi-PR program of work to migrate the graph from snapshot data → live feeds, one provider at a time.

| Phase | Provider(s) | Nodes | Status |
|---|---|---|---|
| 1 | Registry refactor (no new feeds) | 0 | **shipped (#149)** |
| 2 | FRED — initial batch | 18 macro/financial series (Fed Funds Effective/Target, SOFR, U-3 / U-6 unemployment, INDPRO, PAYEMS/MANEMP, JOLTS openings/quits/layoffs, building permits, 30Y mortgage, CPI YoY / Core CPI YoY, 5Y/10Y breakeven inflation, Case-Shiller YoY) | **shipped (#150)** |
| 3 | World Bank — country indicators | 5 series: China + Brazil Real GDP, China + Brazil Employment-to-Population, Global CPI Inflation YoY. Keyless. | **shipped (#151)** |
| 4a | FRED expansion | 7 more series: Labor Force Participation, Employment-Population Ratio, GDP QoQ Annualized, PPI All Commodities, PPI Final Demand Energy, 5Y5Y Forward Inflation Expectation, Global Wheat Price | **shipped (#152)** |
| 4b | OpenFDA — adverse events | 2 T1D drug nodes: Teplizumab, Insulin Glargine. Free, FAERS counts in last 12-month window. **First T1D-side feed.** | **shipped (#152)** |
| 5 | ClinicalTrials.gov — trial counts | 2 T1D therapy nodes: Teplizumab + VX-880 (with stem-cell-derived β-cell replacement label match). Free, JSON v2 API. Total + recruiting subset surfaced. | **shipped (#153)** |
| 5b | FRED expansion — EM FX | 3 emerging-market FX rates from FRED: Turkey FX Stress (TRY/USD via DEXTUUS), South Africa FX Stress (ZAR/USD via DEXSFUS), Brazil FX Stress (BRL/USD via DEXBZUS). Daily updates. | **shipped (#154)** |
| 7 | **Sovereign Default real data** — eliminates 3rd of 4 synthetic composites. ICE BofA US High Yield OAS (FRED `BAMLH0A0HYM2`) wired to the Sovereign Default / Restructuring node as a credit-stress proxy: HY spreads widen when sovereign + corporate default risk co-moves up. Capacity = 8% (stress regime threshold). | **shipped** |
| 8 | **MENA Import Dependency real data — goal reached** — eliminates the 4th and final synthetic composite. World Bank `NE.IMP.GNFS.ZS` (Imports of goods and services, % of GDP) for MEA aggregate region wired to the MENA Import Dependency Index node. Capacity = 50% (high-dependency regime). Pivoted from a separate UN Comtrade provider (rate-limited, auth-required) to a single-line addition to the existing keyless WB provider — ships faster, same fidelity for the regional aggregate. | **shipped** |
| 5c | Per-card live-data sparkline | `LiveDataPoint.history` field + `upsertLiveSignal` accumulation (capped at 60 entries, sorted, deduped). Card sparkline prefers live history when present, falls back to synthetic omega when not. LIVE badge + mode-colored stroke distinguish live curves visually. | **shipped** |
| 6 | USGS critical minerals | Phosphate / potash / sulfur — needs Excel-scraping (no JSON API) | blocked: needs scraper |
| 7 | BLS labor stats | ~10 labor/employment nodes | not started |
| 8 | NOAA storm tracks | ~5 conflict-zone proxies | not started |
| 9 | World Bank Pink Sheet | Commodity prices (wheat, fertilizer, phosphate, urea, ammonia) — needs CSV scraper | blocked: needs scraper |
| 10 | EIA expansion | Saudi crude production, US refinery utilization, Henry Hub natural gas | not started |

**Honest scoping notes:**
- Not every node has a public real-time data source. Specific corporate operations ("Refinery Throughput", "Aramco production") don't have free public APIs. Options: paid sources (Bloomberg/Vortexa), inferred from related public series (EIA international), or stay synthetic and tag `mode: "modeled"` (vs `"live"` / `"static"`) so the chip color reflects honest provenance.
- Polling load grows with coverage. Each provider declares its cadence; per-provider server-side caching keeps upstream calls bounded.
- A `mode` field on registry entries (live | modeled | static) is a likely Phase 2.5 addition so the UI can distinguish empirical from inferred.

## Real-data-only goal — no synthetic composites

**Stated objective:** every node in the active graph carries continuously-pulled real data. No synthetic composites in the end state.

This is the target; the current state is a work-in-progress program of incremental provider additions. The synthetic composites still in the graph as of this writing fall into three categories:

### A. Composites that can be derived from real primitives we already pull

- **Currency Contagion Channel** — derivable from FRED EM FX series (DEXTUUS / DEXSFUS / DEXBZUS) — e.g. average normalized depreciation across the basket.
- **Exchange Rate Pressure Index** — same primitives, different aggregation (weighted depreciation index).

These need a **derivation provider**: a `FeedProvider` whose `matchPayload` reads other nodes' existing `liveData[]` from the `nodes` parameter and emits computed composites. Same registry pattern, no new upstream API required. Ready to build when prioritized; one PR.

### B. Composites that need a real source we haven't wired yet

- **Sovereign Default / Restructuring** — closest free proxies: World Bank IDS external-debt service ratios, FRED's EM HY corporate bond yields (BAMLEMHB...), or IMF Article IV staff reports. Best candidate is a new provider on top of FRED's existing key.
- **MENA Import Dependency Index** — needs UN Comtrade, WITS, or IMF Direction of Trade. UN Comtrade has a free JSON API but tight rate limits on the unauthenticated tier.

### C. Composites with no defensible free source

If a composite ends up in this category after a real search, the rule is: **keep the node visible but blank** — no synthetic value, no live data, no qualifier. The empty slot itself is the signal that real data is still needed for that node, so future-you (or future Claude) can come back to it. Do **not** delete the node — deletion erases the TODO; blanking preserves it.

The principle, restated: a node we can't measure shows nothing rather than something fake. Synthetic-as-placeholder is rejected, but the slot remains as a known-incomplete marker.

The card render already does the right thing here: a node with no `liveData[]` simply doesn't render any live rows. The card still shows up (with its label, domain badge, and Ω score) but the live block is absent. That's the "blank" state — already implemented, just needs a corresponding entry in the registry to mark the node as "data needed" rather than left ambiguous.

**Future enhancement:** add an explicit `dataStatus: "live" | "modeled" | "blank-needs-data"` field on `CausalNode` (or a parallel registry) so blank nodes are visually distinguished from "no provider has matched yet" nodes. Both look identical today; the distinction matters for the program's tracking. Flag for a small follow-up PR when needed.

### Status of the goal as of last update

| Total nodes covered live | ~43 |
| Synthetic composites still present in graph | **0** |
| Synthetic composites with a clear path to real data | n/a (goal reached) |
| Synthetic composites with no defensible source (target: 0) | 0 |

**Implication: goal reached.** All 4 originally-synthetic composites (Currency Contagion, Exchange Rate Pressure, Sovereign Default, MENA Import Dependency) are now backed by live data — derivations on top of FRED EM FX for the first two, FRED HY OAS for the third, World Bank MEA imports for the fourth. The graph is fully real-data-driven on the engine side; remaining work is widening node coverage rather than replacing synthetics.

### Next phases against this goal

| Phase | Scope | Eliminates |
|---|---|---|
| 6 | **Derivation provider — shipped** — FeedProvider reads other providers' liveData and emits composites. Currency Contagion = mean ratio across FRED EM FX (DEXTUUS / DEXSFUS / DEXBZUS); Exchange Rate Pressure = max ratio. Source string tagged "Derived · mean EM FX stress" / "max EM FX stress" with per-country breakdown. Stub `/api/feeds/derivations/trigger` route, 5-min cadence (faster than primitives so derivations always catches up within one cycle). | 2 of 4 composites — **shipped** |
| 7 | **Sovereign-debt provider** — World Bank IDS or FRED EM HY proxies for the Sovereign Default node. | 3 of 4 composites |
| 8 | **UN Comtrade provider** — for MENA Import Dependency. Rate-limited; need careful caching. | 4 of 4 composites — goal reached |

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

### Two-validator fork (resolved)
- `src/lib/snapshots/tarski-validator.ts` is now an adapter on top of `runTarskiValidation` from `tarski-data.ts`.
- `validateSnapshot(snapshot, { liveGraph, enabledAxioms })` runs the full 32-axiom validator and converts its `TarskiValidationReport` into the snapshot-side `TarskiValidationResult` via `reportToValidationResult`.
- `setSnapshot` now passes `s.graphData` and `s.enabledAxioms` so snapshots get full coverage.
- The original 5-axiom checks are preserved as a degraded fallback for callers that can't supply a live graph (e.g. the EngineProvider interface).
- Snapshots now reflect the same axiom set users see in TarskiPanel — fork eliminated.

## Anchor files

```
src/lib/types.ts                              LiveDataPoint, getLiveSignal/upsertLiveSignal helpers, ProofTrace.detail
src/lib/tarski-data.ts                        AXIOM_LIBRARY (32), runTarskiValidation, A-04/R-01/R-02 with liveData branches
src/lib/feeds/display.ts                      Shared display helpers — feedModeFromSource, KIND_FORMATTERS, summarizeLiveFeeds, feedDotClass
src/lib/feeds/eia-hormuz.ts                   EIA URL builder, parser, mock (server-side); HORMUZ_CAPACITY_MBD = 21
src/lib/feeds/ofac-sdn.ts                     OFAC pipe-CSV parser, PROGRAM_PREFIX_TO_COUNTRY, mock (server-side)
src/lib/feeds/fred.ts                         FRED v1 URL builder, parser, mock; FRED_SERIES list (18 macro series)
src/lib/feeds/providers/types.ts              FeedProvider interface, FeedDispatchBatch, FeedDispatchEvent
src/lib/feeds/providers/eia-hormuz.ts         EIA provider — matchPayload + cadence + label
src/lib/feeds/providers/ofac-sdn.ts           OFAC provider — matchPayload + jurisdiction inference
src/lib/feeds/providers/fred.ts               FRED provider — series→node label-pattern matching
src/lib/feeds/registry.ts                     FEED_PROVIDERS — single source of registered providers
src/hooks/useFeedRegistry.ts                  Single generic poll hook (replaces useHormuzFeed + useOfacFeed)
src/lib/snapshots/tarski-validator.ts         THIN snapshot validator (5 axioms) — deferred cleanup
src/stores/useApexStore.ts                    applyHormuzLiveData, applyOfacLiveData, appendFeedEvent helper
src/hooks/useHormuzFeed.ts                    5-min poll, geopolitical-only gate
src/hooks/useOfacFeed.ts                      30-min poll, geopolitical-only gate
src/components/RiskPropagationFlow.tsx        Per-card live-data rows + global feed summary in header
src/app/api/feeds/eia/hormuz/route.ts         EIA proxy
src/app/api/feeds/ofac/sdn/route.ts           OFAC proxy with zero-entry defensive fallback
```

### Tests contributed by this session

- `src/lib/__tests__/feeds/eia-hormuz.test.ts` — 7 (URL builder, parser, mock)
- `src/lib/__tests__/feeds/ofac-sdn.test.ts` — 10 (URL constant, programToCountry, CSV parser, mock)
- `src/lib/__tests__/tarski-a04-livedata.test.ts` — 4 (A-04 liveData branch + structural fallback)
- `src/lib/__tests__/tarski-r01-r02-livedata.test.ts` — 7 (R-01/R-02 liveData + static branches)
- `src/lib/__tests__/feeds-display.test.ts` — 18 (feedModeFromSource, timeAgoLabel, formatLiveSignal, KIND_FORMATTERS registry, summarizeLiveFeeds, shortLabelFromSource)
- `src/lib/__tests__/store-feed-events.test.ts` — 7 (TemporalEvent emission, dedup)

**53 tests** total from this session. Project total: 459 / 459 passing.

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

1. ~~**Two-validator fork resolution**~~ — ✅ shipped. `validateSnapshot` now delegates to `runTarskiValidation` when a live graph is supplied; snapshots now run the full 32-axiom library.
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
