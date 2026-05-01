# Spirtes + Tarski Engine Session — State & Recovery Doc

> Living document capturing the scope, decisions, file map, and open work for
> the persistent Claude Code session focused on the **Spirtes** (causal
> discovery) and **Tarski** (formal axiom verification) engines.
>
> If a session ends abruptly, a future Claude can read this file end-to-end
> and pick up exactly where we left off without losing context.

**Last updated:** 2026-05-01 (after PR #142 + layout fix)
**Working branch:** `claude/spirtes-tarski-engines-tbQHn`
**Latest production deploy:** PR #142 merged as `06b3ba4` on main

---

## 1. Session scope

### In scope (this session owns)
- Spirtes algorithms: DCD, PCMCI+, FCI panels, network analysis metrics
- Tarski validator + 32-axiom library + RAW/VERIFIED truth filter
- Discovery-panel scoping (`isolateSelection`, multi-domain)
- Engine-side ΩF wiring: Tarski → **J** (jurisdictional hazard), Spirtes-metrics → **C** (systemic cascade load)
- Engine info panels / `?` explainers
- **Live API feeds** that drive engine state (feed proxies, polling hooks, store mutators, validator branches)

### Out of scope (other sessions)
- **Pearl** (counterfactuals, MC, interdiction) → separate session
- **Pareto** (criticality, tail depth, estimators) → separate session
- **Graph data, nodes, edges, domain profile definitions** → Geopolitical/Macro or T1D data sessions
- **2D/3D canvas, layout, rendering perf** → Rendering session
- **Tour, persona, UI chrome, copy** → UX & Onboarding session
- **Auth, payments, platform plumbing** → Platform / Payments sessions

### Boundary calls made in this session
- **Node-detail pentagon ΩF radar** (replacing per-pillar gauges) → punted to **UX & Onboarding** session
- **Live ticks → continuous TimeSeriesOverlay curves** (omegaComposite projection) → punted to **Rendering** session
- **Status-strip layout / placement** → kept in this session because it surfaces engine state (mirrors the brief's "status string, badge rendering" carve-out for Truth Filter mechanics)
- **TimeDial event markers** → engine-side store mutation only; dial subscribes reactively, no rendering changes

---

## 2. What's shipped on `main`

### PR #142 — Live API feeds → Tarski engine (merged as `06b3ba4`)

Three commits squashed:

#### Commit `b5f4066` — EIA Persian Gulf throughput → A-04 Hormuz
- New route `/api/feeds/eia/hormuz` queries EIA v2 international/data summed across the six Persian Gulf producers (SAU/ARE/IRN/IRQ/KWT/QAT), scaled by 0.85 Hormuz transit fraction.
- 6-hour server cache, 5-minute client poll cadence.
- Mock fallback (clearly tagged `(mock — EIA_API_KEY unset)`) when key absent.
- A-04 check rewritten: prefers `liveData.value / liveData.capacity > 0.9` when present; falls back to edge-weight sum > 3.0 when no liveData attached. Quantitative proof-trace detail.

#### Commit `cd61807` — OFAC SDN → R-01 + new R-02 runtime
- New route `/api/feeds/ofac/sdn` proxies Treasury's pipe-delimited SDN.csv, parses entries → programs → ISO-2 country codes.
- 24-hour server cache, 30-minute client poll.
- Mock-fallback on upstream errors (Treasury sometimes 403s bot UAs from cloud egress).
- R-01 prefers live sanctions signal on either endpoint; static `max(J) ≥ 8` is the fallback.
- **R-02 gained its first runtime check.** Was previously only a relevance score (no validator code). Now: node with live sanctions OR static J ≥ 7, AND restorationLatency ≥ 7 → flag.
- **Multi-signal `liveData` migration:** `CausalNode.liveData` changed from `LiveDataPoint` to `LiveDataPoint[]` with a `kind` discriminator. Forced by Hormuz being both a chokepoint AND in a sanctioned jurisdiction. Helpers `getLiveSignal(node, kind)` / `upsertLiveSignal(arr, point)` exported from `types.ts`.

#### Commit `4258380` — Status strip + TimeDial event markers
- `<LiveFeedStatus />` chip strip (was top-right, moved to bottom-left in follow-up).
- `applyHormuzLiveData` / `applyOfacLiveData` now also append `TemporalEvent` to `temporalData.events` on each NEW reading. Deduped by id from observedAt/fetchedAt.
- TimeDial subscribes to `temporalData` reactively → refresh markers appear automatically without touching the dial.
- `feedModeFromSource(source, observedAt)` parses each feed's source string into `live | mock | mock-fallback | stale`.

### Layout-fix follow-up (in this PR)
- Status strip moved from top-right to **bottom-left** of DAG canvas (top-right was busy with TOP-Ω panel).
- Stale chips render at lower opacity to de-emphasize feeds that haven't fetched yet.
- OFAC route adds defensive zero-entry fallback: if upstream returns 200 OK but the parser yields zero jurisdictions, treat as parse failure and serve mock so the engine path still exercises.

---

## 3. Key architectural decisions

### `liveData` data shape (chose array)
- `CausalNode.liveData?: LiveDataPoint[]`
- Each `LiveDataPoint` has `kind: "throughput" | "sanctions" | string`, plus `value`, `capacity`, `unit`, `observedAt`, `source`.
- Multiple feeds attach distinct kinds to one node without clobbering. Hormuz currently carries both.
- Reasoning logged: single-slot would have signal-clobbered every poll cycle.

### Validator branches (the pattern)
- **A-04**: `getLiveSignal(cp, "throughput")` → ratio check; else structural sum.
- **R-01**: live sanctions on either endpoint → bump J; else static `max(J) ≥ 8`. Edge-weight `>= 0.7` always required.
- **R-02**: live sanctions OR static J ≥ 7, AND restorationLatency ≥ 7. Was a no-op before this session.

### Feed proxy pattern (reusable for any future feed)
1. **Server route** at `/api/feeds/<provider>/<endpoint>/route.ts`:
   - Holds API keys (server-side env vars).
   - Module-level cache with TTL.
   - Mock fallback on upstream error / parse failure.
   - Response headers: `x-feed-cache: hit|miss`, `x-feed-mode: live|mock|mock-fallback`.
2. **Library** at `src/lib/feeds/<provider>-<endpoint>.ts`:
   - URL builder, response parser, mock generator, types.
   - Pure functions, easy to unit test.
3. **Client hook** at `src/hooks/use<Provider>Feed.ts`:
   - `setInterval` + `AbortController`, no SWR/RQ dependency.
   - Gated to relevant profile (geopolitical for both current feeds).
4. **Store action** in `useApexStore.ts`:
   - Maps feed payload → graph mutation (heuristic node matching, jurisdiction inference).
   - Upserts `liveData` via `upsertLiveSignal`.
   - Appends `TemporalEvent` via `appendFeedEvent` helper.
   - Re-runs Tarski validation when `truthFilter === "verified"`.
5. **Mount** in `src/app/page.tsx`.

### TimeDial integration discipline
- Engine-side only: store action appends `TemporalEvent`, sets new `temporalData` reference.
- TimeDial / TimeSeriesOverlay subscribe via Zustand selector → React picks up the change.
- Never edit TimeDial.tsx — that's rendering territory.
- `appendFeedEvent` lives in `useApexStore.ts` as a local helper.

### Two-validator fork (deferred)
- `src/lib/snapshots/tarski-validator.ts` only runs 5 axioms; called from `setSnapshot()`.
- `runTarskiValidation` in `tarski-data.ts` runs all 32; called from `runTarskiWithAxioms()` in store, used by TarskiPanel.
- The live signal feeds the **full** validator. Snapshot validator is currently disconnected from live feeds.
- Cleanup planned but not done — flagged in commit message body as follow-up.

---

## 4. File map

```
src/
├── lib/
│   ├── types.ts                              ← LiveDataPoint type, CausalNode.liveData[], getLiveSignal/upsertLiveSignal helpers, ProofTrace.detail
│   ├── tarski-data.ts                        ← AXIOM_LIBRARY (32), runTarskiValidation, A-04/R-01/R-02 with liveData branches
│   ├── feeds/
│   │   ├── eia-hormuz.ts                     ← EIA v2 URL builder, parser, mock; HORMUZ_CAPACITY_MBD = 21
│   │   └── ofac-sdn.ts                       ← OFAC pipe-CSV parser, PROGRAM_PREFIX_TO_COUNTRY map, mock
│   ├── temporal-data.ts                      ← TemporalDataset, TemporalEvent (existing — feeds append events here)
│   └── snapshots/tarski-validator.ts         ← THIN snapshot validator (5 axioms) — DEFERRED CLEANUP
├── stores/
│   └── useApexStore.ts                       ← applyHormuzLiveData, applyOfacLiveData, appendFeedEvent helper
├── hooks/
│   ├── useHormuzFeed.ts                      ← 5-min poll, geopolitical-only gate
│   └── useOfacFeed.ts                        ← 30-min poll, geopolitical-only gate
├── components/
│   ├── LiveFeedStatus.tsx                    ← Chip strip (bottom-left of DAG canvas)
│   ├── ModulePanel.tsx                       ← TarskiPanel + Spirtes module tabs
│   ├── TimeDial.tsx                          ← Reads temporalData.events
│   ├── TimeSeriesOverlay.tsx                 ← Reads temporalData.nodes.history
│   └── trinity/
│       ├── DcdGraph.tsx                      ← Spirtes DCD panel (precomputed tags)
│       ├── PcmciGraph.tsx                    ← PCMCI+ panel (precomputed)
│       └── FciGraph.tsx                      ← FCI panel (precomputed)
└── app/
    ├── page.tsx                              ← Mounts useHormuzFeed + useOfacFeed + <LiveFeedStatus />
    └── api/feeds/
        ├── eia/hormuz/route.ts               ← EIA proxy
        └── ofac/sdn/route.ts                 ← OFAC proxy with zero-entry defensive fallback
```

### Test files (this session contributed)

| File | Tests | Covers |
|---|---:|---|
| `feeds/eia-hormuz.test.ts` | 7 | EIA URL builder, parser, mock |
| `feeds/ofac-sdn.test.ts` | 10 | OFAC URL constant, programToCountry, CSV parser, mock |
| `tarski-a04-livedata.test.ts` | 4 | A-04 liveData branch + structural fallback |
| `tarski-r01-r02-livedata.test.ts` | 7 | R-01/R-02 liveData + static branches |
| `live-feed-status.test.ts` | 10 | feedModeFromSource, timeAgoLabel |
| `store-feed-events.test.ts` | 7 | TemporalEvent emission, dedup, no-op when temporalData null |

**45 new tests** added in this session. Project total: 375 / 375 passing.

---

## 5. Env vars

| Name | Required | Behavior if unset |
|---|---|---|
| `EIA_API_KEY` | optional | `/api/feeds/eia/hormuz` returns mock data tagged `(mock — EIA_API_KEY unset)`. Register at https://www.eia.gov/opendata/register.php |
| `OFAC_SDN_URL` | optional | Defaults to `https://www.treasury.gov/ofac/downloads/sdn.csv`. Mock-fallback on errors / zero-entry parse |

Both documented in `docs/DEPLOYMENT.md`.

---

## 6. How to verify on production

1. Open `manifold.apexanalytica.co`, log in, pick any geopolitical domain
2. Look at **bottom-left of DAG canvas** → "LIVE FEEDS" header + two chips
3. Mode dot color tells the truth:
   - 🟢 **green pulse** = real upstream
   - 🟠 **amber** = upstream blocked, mock-fallback
   - ⚪ **grey** = mock (no key) or stale
4. Hover any chip → source string reveals provenance (period number for live, "(mock)" suffix otherwise)
5. DevTools Network tab → `GET /api/feeds/eia/hormuz` and `GET /api/feeds/ofac/sdn` → response header `x-feed-mode` confirms chip color
6. Click Strait of Hormuz node in VERIFIED mode → proof-trace details show:
   - A-04: `Strait of Hormuz: 18.50/21.00 mb/d = 88.1% — EIA …`
   - R-01: `OFAC SDN — Iran: IRAN, IRAN-EO13599, … (4 active programs)`
   - R-02: `Strait of Hormuz: OFAC SDN — Iran: …; restoration latency 7.5 ≥ 7`
7. TimeDial markers appear at refresh timestamps with hover details

### Currently observed (as of last verification)
- **EIA**: `mock` (no `EIA_API_KEY` set in Vercel) — register a key + add to Production env to flip green.
- **OFAC**: was `stale` immediately after PR #142 deploy. Defensive zero-entry fallback shipped in this PR — should now flip to `mock-fallback` (amber) if Treasury isn't reachable, or `live` (green) if it is.

---

## 7. Open follow-ups (priority-ordered)

### Engine session — ready to start anytime

1. **Two-validator fork resolution** — route `setSnapshot()`-side validation through the full 32-axiom library so snapshots reflect the same axioms users see. Files: `src/lib/snapshots/tarski-validator.ts`, `src/stores/useApexStore.ts:setSnapshot`.
2. **Profile-agnostic universal axiom library** (#75 follow-up) — A-01/A-02/A-03/H-01/H-02 are all `appliesTo: ["geopolitical"]` because their language is energy-flavored. Build a clean cross-profile version so they reuse on T1D and any future profile.
3. **More live feeds** — same proxy pattern as EIA/OFAC. Candidates:
   - **USGS critical minerals** → A-05 Single-Source Fragility (where one country dominates supply)
   - **NOAA storm tracks** → conflict-zone proxies (storm-disrupted shipping lanes ≈ chokepoint stress)
   - **World Bank governance indicators** → R-04 Cross-Domain Dependency (low-confidence cross-domain edges)
4. **ΩF pillar wiring audit** — confirm Tarski violations actually feed pillar **J** scalar in the per-node ΩF profile, and Spirtes network metrics (centrality, clustering, density) feed pillar **C**. Verification task more than build.
5. **More T1D axioms** as clinical evidence lands (MODY exclusions, LADA, age-of-onset, exogenous insulin half-life). Wait for clinical advisor input.
6. **More geopolitical axioms** as Lisa/Junyi/Claire data lands (supply-chain, infrastructure, macro-inflation, macro-labor verticals).

### Cross-session boundaries (waiting on other sessions)

- **Pentagon ΩF radar plot** in node-detail box → UX & Onboarding session
- **Live-tick → continuous TimeSeriesOverlay curves** with omegaComposite projection → Rendering session
- **Demo-data sanctions coverage** — only Hormuz currently matches a sanctioned jurisdiction. Need explicit Iranian/Russian/etc. nodes (Gazprom, NIOC, Aeroflot, etc.) → Geopolitical/Macro data session

### Spirtes-specific (deferred to phase 2)

- **Algorithm fidelity confirmed**: all four panels (DCD/PCMCI+/FCI/network metrics) render PRECOMPUTED tags from `graph-data.ts` static constants. No real algorithm runs in browser. Layout + temporal-window deltas only.
- **Spirtes-live (phase 2)** — real DCD/PCMCI+/FCI on rolling windows. Multi-week project; needs separate scoping conversation. Options: (a) browser-side via small lib, (b) server-side with results streamed, (c) keep tags precomputed but recompute network metrics live.

---

## 8. How a future session resumes

1. **Read this file end-to-end** before doing anything else.
2. Check `git log --oneline main -10` for any commits since this doc's "Last updated" date.
3. Check open PRs against `main`: `gh pr list --base main` (or via the GitHub MCP).
4. Confirm the working branch state: `git checkout claude/spirtes-tarski-engines-tbQHn && git pull`.
5. Re-read the **original session brief** (the long onboarding message at the start of the chat history that begins "I'm starting a persistent Claude Code session scoped to the Spirtes (causal discovery) + Tarski (axiom verification) engines for Manifold").
6. Pick from §7 "Open follow-ups" or take fresh user direction.
7. **Update this doc** at the end of every material change (new feed, new axiom, refactor, etc.). Keep it living.

---

## 9. Useful commands

```bash
# Develop
npm run dev                    # Next.js dev server
npx tsc --noEmit               # Typecheck
npx vitest run                 # Full test suite (375 / 375 pass at last update)
npx eslint src/...             # Lint specific files

# Verify a specific feed test
npx vitest run src/lib/__tests__/feeds/eia-hormuz.test.ts
npx vitest run src/lib/__tests__/feeds/ofac-sdn.test.ts

# Curl a feed locally (after auth via the UI in the same browser)
curl -i http://localhost:3000/api/feeds/eia/hormuz
curl -i http://localhost:3000/api/feeds/ofac/sdn
# Look at x-feed-mode header for definitive live/mock answer
```
