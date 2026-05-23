# Session: Geopolitical / Macro

Owns the geopolitical, financial, macro, and defense graph data and the corresponding domain profile entries. These sit under the **Analyst** persona with `dataset: main | athena`.

> **Status:** session brief is being inferred from cross-references — fill in detail as the session establishes itself.

## Scope summary (in)

- Graph data:
  - `src/lib/graph-data.ts` — main geopolitical/macro causal graph (`dataset: main`).
  - `src/lib/athena-graph-data.ts` — Athena dataset (`dataset: athena`).
- Domain profile entries in `src/lib/domain-profiles.ts` for: ENERGY SYSTEMS, FERTILIZER & AGROCHEMICAL, SUPPLY CHAIN SHOCK, FINANCIAL CONTAGION, EMERGING MARKET SOVEREIGN, FRONTIER (frontier-science), etc.
- Persona mapping: Analyst persona — geopolitical / financial / macro / defense.
- Domain-specific vocabulary in sidebar / inspector / pillar labels for these domains. Top-bar module tabs stay canonical SPIRTES/TARSKI/PEARL/PARETO.
- Geo-coordinate mapping for MAP-view domains: `src/lib/geo-coordinates.ts`.
- Domain-specific shock library (PARETO scenario injector presets — Strait of Hormuz closure, Abqaiq attack, LNG train outage, etc.). Authoring lives here; PARETO consumes.
- Constraint authoring (REGULATORY tier — sanctions, export controls, treaties) co-authored with **TARSKI**.
- Athena copilot engine: `src/lib/athena-copilot-engine.ts` (the *data side* — the copilot framework itself is shared).

## Scope summary (out — route elsewhere)

- Engine logic (SPIRTES, TARSKI, PEARL, PARETO) → respective **engine sessions**. This session supplies the graph and domain-specific constants.
- Persona pill UX, Domain Workspace card rendering → **UX & Onboarding**. We define the domain entries; UX renders them.
- MAP-view projection mechanics → **Rendering**. We supply geo-coordinates; Rendering projects.
- Canvas, layout, viewport → **Rendering**.
- Auth / API gating → **Platform**.

## Boundary clarifications

- **Vocabulary**: domain-specific module names / pillar labels live in the relevant `DomainProfile` entries. They flow through sidebar and inspector. They do **not** flow through the top-bar tabs (#70).
- **Cross-domain edges**: the Cross-Domain persona allows multi-select across dataset families. Cross-domain edge logic and rendering are coordinated; this session contributes the edges, Rendering draws.
- **Geo-coordinates**: this session owns whether a domain *has* geo-coordinates and what they are. MapLibre projection is Rendering's.

## Anchor files

- `src/lib/graph-data.ts`
- `src/lib/athena-graph-data.ts`
- `src/lib/athena-copilot-engine.ts`
- `src/lib/domain-profiles.ts`
- `src/lib/geo-coordinates.ts`
- `src/lib/node-timeseries-map.ts` (geopolitical/macro entries)

## Shipped PRs (representative)

- TODO: fill in as the session ships work / from `git log`.

## 2026-05 Live-Data Coverage Push

### What landed (16 PRs, all merged into main)

| PR | Commit | What |
|---|---|---|
| #221 | `2035f04` | DXY → EM FX panel refit (β=0.520 [0.10, 0.94] on 15-EM annual PIMCO panel including Turkey/Argentina) · Frontier-science scaffold (6 placeholder fs_* nodes + 4 intra-domain edges) · Time-series overlay tooltip + legend chip now show raw underlying metric (e.g. "6.76 %" food inflation) instead of duplicating per-card omega sparkline · 5 new FRED series (HOUST, RSAFS, ULCNFB, CUSR0000SEHC, JTSHIR) · README empirical playbook (FRED → mirror → PIMCO → statsmodels → literature ladder) |
| #255 | `8e67d00` | Tile sparkline (OmegaSparkline in RiskPropagationFlow) switched from index-based x to timestamp-based x mapped onto the global timelineRange. Every tile now shares the same x-axis as the TimeDial scrubber and the bottom overlay. Sparse-data: 1 point → horizontal hold-forward; 2+ → polyline + hold-forward to right edge. Date labels read the timeline window. |
| #267 | `4696e77` | 3 more FRED series — PAYEMS(units=chg) for `mi_nonfarm_payrolls`, DTWEXBGS for `ip_dxy`, CES0500000003(units=pch) for `mi_ahe_mom`. Transform-aware routing key `{id}_{units?}` so duplicate FRED ids with different transforms don't collide in the provider matcher. |
| #268 | `9ecf57e` | 9 historical-only nodes promoted to live: 6 FC nodes via World Bank (SAU FI.RES.TOTL.CD, MEX DT.DOD.DECT.CD, PAK GC.DOD.TOTL.GD.ZS, TUR BN.CAB.XOKA.CD, EGY PA.NUS.FCRF, ARG PA.NUS.FCRF) + 3 food nodes via FRED PFOODINDEXM (level for qf/mn global-food-price-stress; pc1 for sc_food_price_inflation). |
| #333 | `0ef7599` | `.env.example` template at repo root · `scripts/check-feed-health.ts` + `npm run check:feeds` (hits FRED + WB endpoints, prints LIVE/MOCK/MISS verdict per series) · DEPLOYMENT.md §2.1a documenting the rotate-and-verify flow. |
| #347 | `c98d60c` | **WB matcher fan-out** — replaced single-match `nodes.find(...)` with Set-based `matchSeriesToNodes(...)` so one (country, indicator) tuple can drive N graph nodes. Promotes 4 fertilizer-market nodes (`qf_/mn_` India + Brazil) to live via WB `AG.CON.FERT.ZS` (Fertilizer consumption, kg/ha). Both `IND` and `BRA` rows fan out to 2 nodes each (QAFCO + Ma'aden export-market labels). Closes the multi-match bug flagged in PR #268's handoff. |
| #350 | `de28f41` | Cleared the 2 WB `MISS` entries that were left over from the May audit. **PAK debt** swapped `GC.DOD.TOTL.GD.ZS` (null for Pakistan since 2000) → `DT.DOD.DECT.GN.ZS` (external debt % GNI, 35.6 % at 2024) — same downstream node, recalibrated capacity 80 → 50. **WLD CPI** entry deleted outright — WB doesn't aggregate CPI to any region (WLD/LMY/HIC/EMU/OED all null), and the `"global cpi"` label pattern matched zero graph nodes anyway. Net: 0 MISS lines remain in `check:feeds`. |
| #353 | `1737a89` | **FIT toggle** in `TimeSeriesOverlay`. Adds an explicit `FIT: DIAL ⇄ DATA` button in the overlay header that flips between the dial-aligned 60-day x-axis (default, chart cursor lines up with TimeDial scrubber) and a data-span axis (curves' actual history extents). Solves the cadence-mismatch UX bug where annual WB series rendered as flat hold-forward lines because every published timestamp fell before `timelineRange.start`. Button only surfaces when ≥1 pinned curve has history extending >25 % of dial span before `xStart` — pure-daily pin sets stay clean. Header indicator `· ZOOMED 2005–2024` appears in DATA mode. |
| #375 | `3cb14b5` | **FIT-mode auto-reset + OUT OF WINDOW chip.** PR #353 turned out to be a one-way trap: once a user landed in DATA mode (intentionally or accidentally), subsequent dial preset clicks (`1H / 1D / 1W / 1M`) silently had no effect on the chart because the chart was no longer reading `timelineRange`. User-reported repro: `1D → 1M → 1D` left the chart stuck as a flat line. Fixed with a `useEffect` that resets `xAxisMode` to `"dial"` whenever `timelineRange.start` changes — dial preset clicks change `.start`, the live tick only advances `.end`, so DATA mode survives live ticks but always loses to an explicit dial click. Also added a per-curve amber **OUT OF WINDOW** chip in the legend that surfaces when 0 history points fall inside `[xStart, xEnd]` — tells the user the flat line is a cadence-vs-window mismatch, not broken data. |
| #387 | `4ce4bbc` | **`1Y / 5Y / ALL` dial preset buttons.** Direct follow-up to #375's chip — the chip says "no data inside the window" but the only way out was the small `ZOOM OUT` button to the right of LIVE. This adds three long-cadence presets next to the existing four, with a slightly heavier border between the short-cadence group and the long-cadence group so the tier boundary reads visually. `TimeGranularity` type extended with `"year" \| "5year" \| "all"`. The long presets bypass the `fullRange.start` clamp (which had capped at the 60-day synthetic-data baseline) and widen `timelineFullRange` so a subsequent ZOOM OUT lands at the chosen extent. After this lands, the user's repro for fertilizer / debt-to-GDP nodes produces real curves at `5Y` or `ALL`. |
| #393 | `8e598d5` | **PPIFGS swap + STALE verdict in `check:feeds`.** Two related changes. (1) FRED `PPIFGS` ("PPI Final Demand Goods") was upstream-discontinued since 2015-12 but FRED still returned the 10-year-stale value, so `check:feeds` reported it as LIVE — the silent worst case. Compounded by a labelPatterns typo (`"ppi final demand energy"` while PPIFGS is the *Goods* sub-index). Replaced with three correctly-routed current series: `PPIFIS` (headline, 156.5 @ 2026-04), `PPIFDS` (Services, 156.1), `WPSFD4131` (Energy, 267.9). Net: 3 previously-unwired PPI graph nodes promoted to live; stale time-bomb removed. (2) New 4th verdict tier in `check:feeds`: any series with a real (non-mock) source whose `observedAt` exceeds the per-feed staleness threshold (FRED 365d, WB 5y) is flagged STALE. Bold-red age annotation in the legend; STALE > 0 is a hard CI exit code. The "what to do" note in the script points operators at the PR #350/#393 precedent for fixing each flagged series. |
| #394 | `cd9010c` | **Remove deprecated WB WGI series + wire Core PPI YoY.** Probed all 6 WGI indicator codes (`RL.EST` / `GE.EST` / `CC.EST` / `PV.EST` / `RQ.EST` / `VA.EST`) against the WB v2 API; every one returns `"The indicator was not found. It may have been deleted or archived."` The entire WGI dataset has been retired from the v2 endpoint. Removed the `CHN/RL.EST` + `BRA/RL.EST` entries (previously showing as MISS, contributing zero to R-04's governance-tightening logic). R-04 gracefully degrades to its static threshold via the existing null-guards in `tarski-data.ts`. Bonus: wired `ip_core_ppi_yoy` to `PPICOR` with `units=pc1` (5.23 % @ 2026-04). The `kind: "governance"` discriminator on `WbSeriesConfig` is kept for future re-wiring if a non-WB governance source ever lands. |
| #408 | `570f855` | **Phase 14 #1 — DFII10 (10y TIPS yield) → `ip_real_rate_10y`.** Wires the previously-historical-only real-rate node. The graph data already explicitly noted this target in an inline comment on the `ip_real_rate_10y__ip_dxy` edge: *"Literature-cited until FRED DFII10 (TIPS yield) becomes reachable."* It became reachable when FRED_API_KEY landed 2026-05-21. 2.18 % at 2026-05-21, daily. +1 node. |
| #411 | `c0fa101` | **Phase 14 #2 — Brazil + China Sovereign Risk PWT via WB proxies.** The 8 PWT (Penn World Table) sovereign-risk nodes for BRA + CHN were historical-only — PWT publishes annually with a ~3y lag and has no public REST API. Wired 2 of the 4 PWT dimensions via WB annual proxies: Capital Stock → `NE.GDI.TOTL.KD` (Gross Capital Formation, constant 2015 US$); TFP Index → `SL.GDP.PCAP.EM.KD` (GDP per employed person, constant 2017 PPP $). MPK + K/L Ratio are DERIVED quantities (require K and L jointly) and stay historical-only until a derivations-provider extension. +4 nodes. WB catalog 13 → 17. |
| #412 | `15c36fb` | **Phase 14 #3 — Fertilizer PPI → `sc_fertilizer_price_index`.** FRED `PCU3253132531` (Fertilizer Manufacturing PPI by Industry) covers both nitrogenous + phosphatic sub-industries. Monthly, current to 2026-04 = 302.87. +1 node. Supply Chain Food Security domain: 3/10 → 4/10 live. |
| #413 | `f43d107` | **Phase 14 #4 — Cass Freight Expenditures → `sc_shipping_cost_index`.** FRED `FRGEXPUSM649NCIS` captures both rate and volume — best single-number freight cost proxy on FRED. The canonical Red Sea / Suez container indices (Drewry, Shanghai SCFI) referenced by the graph mechanism comment are not publicly available; Cass is the closest free alternative. Monthly, 3.382 at 2026-04. +1 node. Supply Chain Food Security domain: 4/10 → 5/10 live. |

### Coverage state at end of session (2026-05-22, after Phase 14 lands)

Projected post-deploy state (`check:feeds` dry-run from local build):

```
=== FRED ===       58 expected · LIVE 58 · MOCK 0 · STALE 0 · MISS 0   (poll 30 min)
=== World Bank === 17 expected · LIVE 17 · MOCK 0 · STALE 0 · MISS 0   (poll 1 h)
EIA Hormuz:        1 live (Strait of Hormuz throughput, 5-min poll)
Overall:           75+ live signals across the four providers · clean
```

Changes from the 2026-05-21 snapshot:
- FRED catalog: 52 → 58 entries. Net +6: removed PPIFGS (#393); added
  PPIFIS / PPIFDS / WPSFD4131 / PPICOR (#393/#394); added DFII10 (#408),
  PCU3253132531 (#412), FRGEXPUSM649NCIS (#413).
- WB catalog: 15 → 17 entries. Net +2: removed 2 WGI (#394); added 4
  Sovereign-Risk PWT proxies (#411).
- EIA: Hormuz throughput live since 2026-05-22 (`EIA_API_KEY` rollout).
- New STALE verdict in `check:feeds` (FRED 365d, WB 5y thresholds).

### Graph-node live coverage (post-Phase 14)

Audited 2026-05-22 via cross-ref of FRED_SERIES × WB_SERIES × graph nodes
+ EIA Hormuz + derivations:

| Tier | Nodes | % of 192 |
|---|---:|---:|
| 🟢 LIVE (real-time API polling) | ~80 | ~42% |
| 🟡 HISTORICAL (CSV snapshot, no polling) | ~81 | ~42% |
| 🟠 SYNTHETIC (omega-fragility seeded) | 25 | 13% |
| ⚪ BARE (placeholder "blank-needs-data") | 6 | 3% |

Phase 14 net delta: +7 nodes promoted from HISTORICAL → LIVE
(38% → 42% live coverage).

Live-node coverage by domain (intersection of live signal + graph node, after today's three PRs):

| # nodes | Domain |
|---:|---|
| 16 | Macro Impact: Labor, Growth & Housing |
| 12 | Macro Impact: Inflation & Policy |
|  9 | Financial Contagion |
|  4 | Sovereign Risk |
|  3 | QAFCO Fertilizer |
|  3 | Ma'aden Phosphate |
|  2 | Supply Chain Food Security |

Fan-out (one upstream signal driving N graph nodes — only possible after #347):

| Signal | Nodes fed |
|---|---|
| FRED `PFOODINDEXM` | `qf_global_food_prices`, `mn_global_food_price_stress` |
| WB `IND/AG.CON.FERT.ZS` | `qf_india_fertilizer_market`, `mn_india_fertilizer_market` |
| WB `BRA/AG.CON.FERT.ZS` | `qf_brazil_fertilizer_market`, `mn_brazil_fertilizer_market` |

Remaining bare nodes (no public source available): same intentional set as before the push — 6 frontier-science placeholders (`dataStatus: "blank-needs-data"`), 5 Ma'aden private infra, 2 ISM PMI proprietary since ~2015, 1 NY Fed SCE non-FRED.

### Open handoff for next session

**✅ Resolved 2026-05-21 — `FRED_API_KEY` is live on prod.** Set via Vercel UI on the manifold project (Production + Preview, Sensitive), redeployed with build cache disabled, all 51 FRED series flipped MOCK → LIVE. Key also saved to `.env.local` in the repo root for local-dev `check:feeds` runs. Local fingerprint: 32 chars, starts `aebd…`, ends `…be68`.

**Resolved threads (all closed during 2026-05-21 → 2026-05-22 session):**

- ✅ **`FRED_API_KEY` live on prod** (set 2026-05-21). Local fingerprint: 32 chars, starts `aebd…`, ends `…be68`. Saved to `.env.local` (chmod 600, gitignored).

- ✅ **PPIFGS upstream-discontinued → swapped (#393).** Replaced with PPIFIS (headline) + PPIFDS (Services) + WPSFD4131 (Energy). Plus added STALE verdict to `check:feeds` so the next discontinuation can't silently ride on prod.

- ✅ **WB null-tuple investigation → entries removed (#394).** Turned out to be a bigger finding: WB retired the entire WGI dataset from their v2 API. All 6 WGI codes return "deleted or archived." Cleanly removed; R-04 axiom gracefully degrades. Bonus: wired Core PPI YoY (PPICOR pc1) to `ip_core_ppi_yoy` while in the area.

- ✅ **Annual cadence vs daily TimeDial UX** (3-PR iteration: #353 → #375 → #387). FIT toggle + auto-reset + OUT OF WINDOW chip + `1Y/5Y/ALL` dial presets land users at a discoverable solution.

- ✅ **Phase 14 — Live-data Coverage Extension** (2026-05-22, 4 PRs: #408 / #411 / #412 / #413). Pipeline audit identified the most-actionable historical-only nodes. Shipped 4 PRs promoting 7 nodes from HISTORICAL → LIVE: DFII10 (real rate), 4× WB PWT proxies for Sovereign Risk, Fertilizer Manufacturing PPI, Cass Freight Expenditures. Overall live coverage 38% → 42%.

**All threads now resolved.**

- ✅ **`EIA_API_KEY` live on prod** (2026-05-22). User registered at https://www.eia.gov/opendata/register.php, key saved to `.env.local` (chmod 600, alongside `FRED_API_KEY`), added to Vercel manifold project (Sensitive, Production + Preview), redeployed with "Use existing Build Cache" UNCHECKED. Hormuz endpoint flipped from `(mock — EIA_API_KEY unset)` to live `EIA v2 / Persian Gulf producers (period 2026-01)` after ~3 min. First live values:

  ```
  value: 26.053 mb/d   (115% of 21 mb/d stated chokepoint capacity)
  observedAt: 2026-01-01

  Breakdown by producer:
    Saudi Arabia  11.930 mb/d
    UAE            4.779 mb/d
    Iran           4.692 mb/d
    Iraq           4.508 mb/d
    Kuwait         2.882 mb/d
    Qatar          1.859 mb/d
  ```

  This is the signal driving the Tarski A-04 chokepoint axiom — value > capacity flags concentration risk.

### Pipeline audit (2026-05-22) — what's left after Phase 14

The audit categorized each of the 192 graph nodes by data status. The
remaining HISTORICAL-only and SYNTHETIC nodes break down into three
buckets, sorted by what's actually movable:

**Bucket A — Physical-asset moat (52 nodes, unlikely to wire live)**.
Per-asset APIs don't exist publicly for individual refineries, pipelines,
ports, mines, or undersea cables.

- Saudi Aramco Energy (14 hist) — Abqaiq, Ras Tanura, MGS, Fadhili, etc.
- QatarEnergy LNG (11 hist) — Ras Laffan, NFE, Pearl GTL.
- Undersea Cable Infrastructure (12 hist) — 2Africa, AAE-1, FLAG, SEA-ME-WE.
- QAFCO Fertilizer (15 hist) and Ma'aden Phosphate (12 hist + 5 synth)
  beyond their fan-out export-market nodes — same physical-asset pattern.

Aggregate proxies could lift some of these via the `derivations` provider
(e.g. EIA aggregate KSA production driving multiple Aramco nodes), but
that's a derivations-extension shape, not a simple FRED/WB add.

**Bucket B — Bespoke / fund-specific (8 nodes, no public source)**.
- Financial Contagion: PIMCO EMD, BlackRock EMD, Fund Concentration,
  Crisis Window, Haircut Transmission, Cross-Border Banking (BIS dead
  on FRED since 2019-2020 anyway).
- Supply Chain Food Security: Bunge / Almarai (company-specific),
  Strategic Reserves, Subsidy Program (government data, varies by country).

**Bucket C — Intentionally synthetic / placeholder (23 nodes)**.
- AI Safety / IDS (17 nodes) — CICIDS-2017, UNSW-NB15, DDoS, etc.
  Dissertation-derived BENCHMARK references; meant to be conceptual,
  not live signals.
- Frontier Science (6 bare) — Neutrino Mass, Dark Matter Direct,
  Axion, GW Observatory, Proton Decay, Hubble Tension. Research-
  aspirational placeholders.

**Realistic next-batch ceiling**: ~5 more nodes via a derivations-
provider extension (MPK + K/L for sovereign risk, MENA Currency
Depreciation, possibly a generic CB policy rate). Past that, we hit
the moat. The 42% live coverage we're at is probably ~80% of the
practically-reachable ceiling.

**Continuation prompt for the next Claude window (paste verbatim):**

> I'm picking up the geopolitical/macro vertical of apex-terminal. Read `docs/sessions/geopolitical-macro.md` for full context. The 2026-05 live-data push and Phase 14 extension are FULLY CLOSED — 16 code PRs + 5 docs PRs merged, FRED_API_KEY + EIA_API_KEY both live on prod, all four feed providers (FRED 58, WB 17, EIA Hormuz, derivations) reading clean (0 mock / 0 stale / 0 miss). Live coverage at ~42% of 192 graph nodes. No remaining easy-to-wire live data open threads — the rest of the gap is physical-asset moat (Aramco/QatarEnergy/Ma'aden facilities, undersea cables — no per-asset APIs), bespoke fund-specific data (PIMCO/BlackRock/Bunge/Almarai snapshots), and intentionally-synthetic dissertation references (AI Safety / IDS, Frontier Science placeholders). See "Pipeline audit" section for the full breakdown. Likely next themes if user wants to keep going on live data: derivations-provider extension to compute MPK / K-L Ratio / MENA Currency Depreciation from already-live primitives (~5 additional nodes via composition, no new APIs needed). Otherwise pivot to "Likely upcoming themes": new domain cards for customer pilots, MAP-view geo-coordinates, or sanction/export-control axiom expansion with TARSKI.

### Empirical playbook (the data ladder)

When wiring a new edge or live feed, work the sources in this priority order — each tier is a strictly weaker fallback. Documented in full in `research/macro/README.md`.

```
1. FRED API     (FRED_API_KEY set)
2. GitHub mirror of the FRED-equivalent series (datasets/* org)
3. PIMCO annual EM panel (claire/timeseries.json → pimco_sovereign)
4. statsmodels.macrodata bundled quarterly (1959-2009)
5. Literature-cited weight, transparently disclosed
```

DXY → EM FX (PR #221) is the canonical worked example: tier-2 monthly fit for the high-confidence point estimate, tier-3 annual fit for panel breadth (Turkey + Argentina), final edge weight is a defensible blend (0.44, between the two point estimates).

### Notable internals worth remembering

- **FRED provider routing key is `{id}_{units?}` not just `{id}`** since PR #267 — multiple entries with the same series + different transforms (PAYEMS level + chg, CES0500000003 Y/Y + M/M) live in `FRED_SERIES[]`. Both `parseFredSeriesResponse` and `mockFredFeed` emit observations with the transform-aware key.
- **WB provider routing key is `(country, indicator)` tuple** — `PA.NUS.FCRF` appears for both Egypt and Argentina, distinguished by country.
- **WB provider matcher is fan-out (multi-match-per-observation) since PR #347** — `matchSeriesToNodes(...)` returns a Set of all label-pattern matches. One (country, indicator) tuple can drive N graph nodes. Concrete use: `IND/AG.CON.FERT.ZS` feeds both `qf_india_fertilizer_market` and `mn_india_fertilizer_market`; same for Brazil. The old `nodes.find(...)` single-match behaviour was a latent bug that surfaced when the fertilizer batch needed wiring.
- **Tile sparkline x-axis (OmegaSparkline in RiskPropagationFlow) binds to `timelineRange`** — pan/zoom the TimeDial → every tile responds in lockstep. Sparse-data nodes render hold-forward lines edge-to-edge. The Hormuz "LIVE — building" empty tile from the screenshot user-report no longer happens.
- **`TimeSeriesOverlay` has two x-axis modes since PR #353** — `dial` (default, mirrors `timelineRange`, cursor aligns with TimeDial scrubber) and `data` (spans pinned curves' actual history). `FIT: DIAL ⇄ DATA` button surfaces in the overlay header only when ≥1 curve has history extending >25 % of dial span before `xStart`. In `data` mode, the chart cursor visually decouples from the TimeDial — by design, since the comment in `TimeSeriesOverlay.tsx` lines 319–326 captures the explicit trade-off. Local component state (`useState`), not persisted — chart defaults to `dial` on every remount.
- **Since PR #375, `xAxisMode` auto-resets to `"dial"` whenever `timelineRange.start` changes.** Dial preset clicks change `.start`; the live tick only advances `.end`. So `data` mode survives live ticks but always loses to an explicit dial click — the click is treated as the strongest signal that the user wants chart-follows-dial behaviour. Eliminates the one-way trap where users got stuck in DATA mode with seemingly-broken dial buttons.
- **OUT OF WINDOW chip (PR #375)** — amber chip in the legend that surfaces per-curve when 0 history points fall inside `[xStart, xEnd]`. Tells the user the flat hold-forward line is a cadence-vs-window mismatch, not broken data. Hidden in DATA mode by definition. `inWindowCounts` is a `useMemo` over `[curves, xStart, xEnd]` — cheap linear scan, ~5 curves × ~5–20 history points.
- **Dial preset buttons are tiered (PR #387)** — `1H / 1D / 1W / 1M` for fast-moving signals (FRED daily, EIA 5-min), then a visual divider, then `1Y / 5Y / ALL` for annual-cadence signals (WB, WGI). The long presets bypass the `fullRange.start` clamp in the store action — they're allowed to widen the window beyond the synthetic 60-day default. Also widens `timelineFullRange` when picked so a subsequent ZOOM OUT lands at the chosen extent.
- **Time-series overlay tooltip + legend chip now show raw value with unit** (e.g. "6.76 %") not the omega-normalized 0-10 number. `NodeTemporalState.rawValue` carries the unnormalized number; `formatRawValue()` picks decimal precision by magnitude regime.
- **`scripts/check-feed-health.ts`** is the verification entry point. `npm run check:feeds` runs against prod by default; `BASE=http://localhost:3000 npm run check:feeds` for local dev. The script reads `FRED_API_KEY` from `.env.local` (added 2026-05-21).
- **STALE verdict in `check:feeds` (PR #393)** — when an observation has a real (non-mock) source but its `observedAt` exceeds the per-feed staleness threshold (FRED 365d, WB 5y), it's flagged as a 4th tier `STALE` alongside LIVE/MOCK/MISS. STALE rows show age in bold red; LIVE rows get a faint age annotation. STALE > 0 is a hard CI exit code. Catches the class of upstream-discontinued series that the API keeps returning the last-known value for (PPIFGS-style failure). The WB threshold is 5y not 3y because WB has a normal 2-3y publication lag for annual series — fertilizer was a false positive at 3y. Calibrated by dry-run.
- **WB WGI dataset is fully retired from v2 API (PR #394 finding)** — `RL.EST` / `GE.EST` / `CC.EST` / `PV.EST` / `RQ.EST` / `VA.EST` all return `"The indicator was not found. It may have been deleted or archived."` If a future session needs governance signals, look outside the WB v2 endpoint. The `kind: "governance"` discriminator on `WbSeriesConfig` and the formatter's "governance" branch in `feeds-display` are kept in code for that future wiring.
- **PPIFGS / PPILFE upstream-discontinued at 2015-12** — same class of failure as the WGI deprecation but caught via different signal (observation age vs. error response). PPIFGS swapped in PR #393. PPILFE was never actively wired (only probed during the PR #393 investigation); not a real time-bomb, just documented in the fred.ts comment as a known-dead candidate.
- **FRED `PPICOR` (units=pc1) is the current Core PPI YoY series since PR #394** — supersedes the long-discontinued PPILFE. 5.23 % at 2026-04. Wires `ip_core_ppi_yoy`.

### Lessons from the 3-iteration UX arc (#353 → #375 → #387)

A single observation — "annual WB curves render as flat lines in the dial window" — produced three PRs in rapid succession, each fixing something the previous didn't. Worth remembering when shipping UX over data:

1. **#353 was the first-order fix.** Add a FIT button that zooms the chart to the data span. Solves the visible problem. But created a one-way trap because nothing reverts the user out of DATA mode.

2. **#375 was the trap fix.** Auto-reset on dial click + an OUT OF WINDOW chip explaining why curves look flat in tight windows. But left users with no good escape hatch from the chip — they'd have to know about the small ZOOM OUT button (off-screen-right for many viewports).

3. **#387 was the discoverable fix.** Long presets (`1Y / 5Y / ALL`) live in the same place as the existing dial buttons — no hunting for a hidden control.

The pattern: each PR addressed a real bug introduced by the previous. The first PR's design wasn't wrong, but its scope was wrong. The full solution required three mechanisms that work together — long presets are the primary path, FIT toggle is a power-user shortcut, OUT OF WINDOW chip is the diagnostic when neither has been used. **Default to shipping the smallest first-order fix, then iterate based on use.** Trying to design all three mechanisms upfront would have meant scope-bloating PR #353 into a major rewrite; instead we shipped three small focused PRs that each closed an identifiable gap.

User feedback after each PR was the unblocker. Listening for "still doing it" / "stretched to a line" / "1D didn't restore" surfaced the trap that wouldn't have shown up in unit tests.

## Likely upcoming themes

- New domain cards as customer pilots demand them.
- Real-world coordinate coverage for MAP-view domains.
- Sanction / export-control axiom expansion (TARSKI co-auth).
- Time-series coverage for currently sparse nodes.
- TODO: fill in.

## How to start a task

1. Confirm in-scope (geopolitical / financial / macro / defense data and profiles).
2. Coordinate with TARSKI when adding regulatory constraints.
3. Coordinate with PARETO when adding scenario-injector presets.
4. Coordinate with UX when adding/renaming domain cards or changing persona-mapped grouping.
5. Coordinate with Rendering when changing MAP-view geo-coordinates or layout assumptions.
