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

### What landed (10 PRs, all merged into main)

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
| #387 | `<merged>` | **`1Y / 5Y / ALL` dial preset buttons.** Direct follow-up to #375's chip — the chip says "no data inside the window" but the only way out was the small `ZOOM OUT` button to the right of LIVE. This adds three long-cadence presets next to the existing four, with a slightly heavier border between the short-cadence group and the long-cadence group so the tier boundary reads visually. `TimeGranularity` type extended with `"year" \| "5year" \| "all"`. The long presets bypass the `fullRange.start` clamp (which had capped at the 60-day synthetic-data baseline) and widen `timelineFullRange` so a subsequent ZOOM OUT lands at the chosen extent. After this lands, the user's repro for fertilizer / debt-to-GDP nodes produces real curves at `5Y` or `ALL`. |

### Coverage state at end of session (2026-05-21)

Verified against prod after the FRED redeploy:

```
=== FRED ===       51 expected · LIVE 51 · MOCK 0  (poll 30 min, history depth 22–23 obs/series)
=== World Bank === 13 returned · LIVE 13 · MOCK 0  (poll 1 h, history depth 17–19 obs/series)

Catalog entries:                FRED 52 · WB 15  (PPIFGS upstream-discontinued; 2 WB tuples return all-null)
Unique graph nodes wired:       FRED 53 · WB 15  (union 68, disjoint sets — 35.4 % of graph's 192 nodes)
Unique graph nodes LIVE now:    49  (FRED 30 / WB 19 — counted via cross-ref of live observations × matcher patterns)
```

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

**Remaining open threads:**

1. **`EIA_API_KEY` (unrelated to FRED, still unset).** Free at https://www.eia.gov/opendata/register.php. Unlocks the live Strait of Hormuz throughput feed driving the Tarski A-04 chokepoint axiom. Same procedure as the FRED key — register, add to Vercel, redeploy without cache.

2. **FRED `PPIFGS` is upstream-discontinued.** "PPI Final Demand Goods" has not published since 2015-12 — `check:feeds` shows it as LIVE only because the FRED API still returns the last-known value with a 2015 timestamp. Whichever node it's wired to is rendering a 10-year-old value as if current. Swap to a current PPI series (`WPSFD4111` family, or `PPIACO` for headline). Small fix PR.

3. **2 WB tuples return all-null from upstream.** WB endpoint returns 13 observations from 15 catalog entries. The 2 missing rows are upstream null-data (WB hasn't published recent years for those series), not a config bug — but the catalog should either be pruned or swapped to a current-data alternative the same way #350 did for PAK.

4. **✅ Resolved 2026-05-21 (later same day) — Annual cadence vs daily TimeDial.** The original FIT toggle (#353) was insufficient — user discovered the one-way trap when dial preset clicks silently ignored a chart stuck in DATA mode. PR #375 added auto-reset on `timelineRange.start` change + the OUT OF WINDOW chip. PR #387 added `1Y / 5Y / ALL` dial presets so users can widen the window directly instead of needing to discover the FIT button or ZOOM OUT. With #387 landed, the annual-cadence UX has three escape hatches that work together: (a) widen the dial via long preset, (b) FIT: DATA toggle (now safely auto-reverts on dial click), (c) ZOOM OUT. The OUT OF WINDOW chip on legend entries communicates which curves need a wider window.

**Continuation prompt for the next Claude window (paste verbatim):**

> I'm picking up the live-data thread for the geopolitical/macro vertical of apex-terminal. Read `docs/sessions/geopolitical-macro.md` for full context. The 2026-05 coverage push is done (10 PRs merged through #387, FRED_API_KEY live on prod, 49 of 192 graph nodes flowing real data, 0 MOCK 0 MISS, annual-cadence UX iterated through three PRs to land at: long dial presets + FIT auto-reset + OUT OF WINDOW chip). Open threads on the doc: (1) `EIA_API_KEY` setup unlocks the Hormuz throughput feed for Tarski A-04; (2) `PPIFGS` is upstream-discontinued and needs a swap to a current PPI series; (3) 2 WB tuples return all-null from upstream and need pruning or swapping. Pick whichever I tell you, or — if I say "audit" — re-run `npm run check:feeds` and report any drift from the doc's coverage numbers.

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
- **FRED `PPIFGS` is a known-stale time bomb** — FRED still returns the last-known value with a 2015-12 timestamp, so it passes `check:feeds` as LIVE despite being upstream-discontinued. The freshness audit in 2026-05-21's deep-dive caught it; needs a small fix PR to swap to a current PPI series.

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
