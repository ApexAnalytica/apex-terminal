# Copilot Feature Manifest — Session 2026-05-31

Walk-throughs the in-app copilot (`SystemCopilot.tsx`) can use to
demonstrate, verify, or troubleshoot each feature shipped in this
session. Each entry is independently executable — the copilot can pick
a single feature on user request without reading the whole file.

Format per entry:

```
## <feature name> (<PR #>)

PREREQ      — domain / state required for this to fire
USER STEPS  — what the user clicks / types
EXPECT      — what the user should see if the feature is working
COPILOT
VERIFY      — assertions the copilot can make against DOM / store
FAILS IF    — concrete failure signatures
HONEST NOTE — gotchas, dormancy, limitations
```

When a user asks "show me what changed today" or "is the recommender
actually working?", the copilot picks the relevant section and walks
the user through it.

---

## Node-scoped calc trajectory persistence (#493)

**PREREQ** Any graph. A node selected with ≥ 2 inbound edges (so
Supply HHI applies).

**USER STEPS**
1. Select a node with concentrated inbound edges.
2. Right-rail → CALCULATIONS panel → find "Supply HHI" row.
3. Click `→ DIAL`. Confirm a row appears in the bottom WATCHLIST with a
   small `CALC` badge.
4. Hard-refresh the page (Cmd+Shift+R).
5. Reselect the same node.

**EXPECT** The Supply HHI value still shows in the CALCULATIONS panel
with its sparkline. The bottom WATCHLIST row reappears with the cyan
trajectory curve at the value it had pre-reload.

**COPILOT VERIFY**
- `localStorage["manifold:node-calc-history"]` contains an entry
  keyed by the node id with a `calc:supply-hhi` `LiveDataPoint`.
- After reload, the matching node's `liveData[]` still carries that
  point.

**FAILS IF**
- WATCHLIST row missing post-reload.
- `localStorage` key absent.
- Sparkline empty.

**HONEST NOTE** Conditional value — only matters if users push calcs
and return. Useless if they never press `→ DIAL`.

---

## HHI ≥ 2500 → A-05 / R-01 axiom elevation (#495)

**PREREQ** Geopolitical / non-T1D domain. A node with ≥ 2 inbound
edges that gives a Supply HHI ≥ 2500 (highly concentrated). For the
R-01 compound path, the node also needs `omegaFragility.jurisdictionalHazard
≥ 6`.

**USER STEPS**
1. Select a high-concentration node.
2. Confirm Supply HHI is red-toned (≥ 2500) in CALCULATIONS panel.
3. Press `→ DIAL` to write a `calc:supply-hhi` snapshot onto the
   node's `liveData[]`.
4. Open Tarski panel (toggle "Constraints" or use the SPIRTES sidebar
   route). Look at the **RECOMMENDED** list.

**EXPECT**
- **A-05 Single-Source Fragility** in RECOMMENDED.
- Score chip ≥ 0.65 (cyan badge).
- "why · Selected: \<node label\> has Supply HHI ≥ 2500 — concentrated
  supply" caption visible.
- "scoring on: selection (1) · structural (...)" line under the
  RECOMMENDED header mentions selection.
- If node also has J ≥ 6: **R-01 Jurisdictional Concentration** also
  surfaces with compound caption.

**COPILOT VERIFY**
- `scoreAxiomRelevance(graph, "geopolitical", {selectedNode, interactionHistory})`
  returns A-05 with `relevanceScore ≥ 0.65` and `reason` containing
  "Supply HHI ≥ 2500".

**FAILS IF**
- A-05 stays in OTHER section (calc-driven boost not firing).
- Reason caption shows the generic "Universal axiom" line.

**HONEST NOTE** This is one of the most concretely useful features
shipped. Fires only after the user pushes the snapshot — without that
step, the recommender doesn't read the calc.

---

## PCMCI+ panel wiring + synthetic CGM cohort (#498)

**PREREQ** A T1D domain selected (any id starting with `t1d-`).

**USER STEPS**
1. SPIRTES module → Discovery Runs panel.
2. Tab row shows `pcmci-plus · SYNTH-CGM` — click it.

**EXPECT**
- ~11 edges listed.
- At least one lagged edge: `meal_event → cgm_glucose_mgdl (+300s)`,
  r ≈ 0.45.
- At least one undirected contemporaneous edge:
  `meal_event o─o insulin_fast_units (contemp)`.
- pcmci-plus algorithm caveat block with inline PAG legend
  (`→`, `↔`, `o→`, `o─o`).

**COPILOT VERIFY**
- `fetch("/discovery-runs/synthetic-cgm-pcmci-plus-v0-2-0.json")` returns
  a `DiscoveryRun` with `algorithm.id === "pcmci-plus"` and
  `result.edges.length >= 10`.

**FAILS IF**
- Tab missing (panel didn't register the new run URL).
- All edges shown as `→` (PAG glyph helper not engaged).

**HONEST NOTE** **Synthetic substrate** — clearly labeled as such.
For real D1NAMO results, the user runs `scripts/run-d1namo-pcmci-plus.ts`
on a machine where the raw cohort is built. Demo-quality, not a
research result.

---

## PAG endpoint marks rendering (#499)

**PREREQ** A discovery run whose algorithm emits per-endpoint marks
(today: `pcmci-plus`; eventually FCI). Today the only user-visible
surface is the SYNTH-CGM PCMCI+ tab from PR #498.

**USER STEPS**
1. Open the `pcmci-plus · SYNTH-CGM` tab.
2. Scan the edge list.
3. Hover any non-directed edge.

**EXPECT**
- Directed edges: `→` (muted text).
- Bidirected: `↔` (amber — latent confounder).
- Possibly causal: `o→` (cyan).
- Uncertain: `o─o` (muted/60).
- Hovering surfaces the PAG semantics ("Bidirected (arrow-arrow):
  latent common cause…").

**COPILOT VERIFY**
- `pagGlyphFor("circle", "circle")` returns `{ glyph: "o─o", ...}`.
- The DOM contains at least one element with the `o─o` text and the
  `text-text-muted/60` class.

**FAILS IF** Every edge renders as `→` (helper not wired).

**HONEST NOTE** Requires the user to know PAG semantics. The legend
helps, but the audience for this feature is narrow.

---

## Recommender memory — decayed-recency boost (#501)

**PREREQ** Any session with the Tarski panel open.

**USER STEPS**
1. Tarski panel → expand an axiom (click its card) — pick R-04 for
   illustration.
2. Note R-04's score chip before and after.
3. Reload the page.
4. Expand 1–2 other axioms over the same session.
5. Observe the "scoring on:" caption under RECOMMENDED.

**EXPECT**
- After step 1: `memory (1 axiom)` appears in the scoring caption.
- R-04's score chip is +0.10 to +0.15 higher than baseline; reason
  caption either reads "Recently investigated (today)" OR keeps a more
  decision-relevant reason (selection or structural).
- After reload: state persists.
- Over time (≥ 21 days since last click): the boost decays past the
  0.005 cutoff and the axiom drops back to baseline.

**COPILOT VERIFY**
- `localStorage["manifold:axiom-interaction-history"]` contains
  `{"R-04": {lastClickedAt, clickCount}}`.
- Scoring caption substring `memory (` is present in DOM.

**FAILS IF**
- Score chip doesn't move after expanding.
- `localStorage` key absent.

**HONEST NOTE** Boost is **invisible to first-time users** — only
power users who repeatedly investigate the same axiom benefit.
Visibility comes from the scoring-layers caption added in #508; without
that, this PR would be entirely silent.

---

## New calcs: Gini, edge density, cycle count (#502)

**PREREQ** Any graph with edges.

**USER STEPS**
1. Select a node with ≥ 2 inbound edges → CALCULATIONS panel.
2. Confirm **Supply Gini** appears alongside **Supply HHI**.
3. Deselect → CALCULATIONS panel switches to graph-wide.
4. Confirm **Edge density** and **Cycle count** rows visible.

**EXPECT**
- Supply Gini value in [0, 1) with one of: `approximately equal`,
  `high inequality`, `extreme inequality`.
- Edge density value displayed as a fraction (e.g. `0.033 / 0.10`)
  with tone matching the threshold buckets.
- Cycle count = 0 on a healthy DAG (green); > 0 = red.

**COPILOT VERIFY**
- `availableCalculations({graph, selectedNode, selectedDomains})`
  includes `supply-gini`, `edge-density`, `cycle-count`.
- `cycleCountCalculation.compute(ctx).value.value` matches a DFS-counted
  SCC count.

**FAILS IF** Any of the three rows missing in their respective contexts.

**HONEST NOTE** **Gini overlaps heavily with HHI** for most practical
cases. I flagged it as a candidate to drop from default registry —
worth user-testing whether anyone actually compares the two. Edge density
is expert-level (confounder-leakage detection). Cycle count is the
most broadly useful of the three.

---

## Cycle-count → A-03, bridge-ratio → A-04 wiring (#504)

**PREREQ** A graph with a directed cycle (for A-03 path) OR with a
high bridge ratio (≥ 0.5; for A-04 path).

**USER STEPS — A-03 path**
1. Construct or import a graph containing `a → b → c → a`.
2. Open Tarski panel → look at RECOMMENDED.
3. Optionally select node `a` to escalate the reason.

**EXPECT**
- A-03 in RECOMMENDED with reason `"N cyclic SCCs detected — A-03 violation"`.
- With selection: `"Selected: a sits in a cyclic SCC — A-03 violation"`.

**USER STEPS — A-04 path**
1. Use a graph with no labeled chokepoint AND bridge-ratio ≥ 0.5
   (visible in CALCULATIONS).
2. Look at A-04's reason in RECOMMENDED.

**EXPECT** Reason `"Bridge ratio N% — load-bearing skeleton dominates"`.

**COPILOT VERIFY** Same scoreAxiomRelevance call as #495 — A-03 boost
should land when `countCyclicSCCs(nodes, edges) > 0`.

**FAILS IF** A-03 / A-04 stay at baseline score.

**HONEST NOTE — IMPORTANT** I flagged the **bridge-ratio → A-04 wiring
as semantically a stretch**. χ★ skeleton dominance isn't really
"chokepoint" — they're different shapes of brittleness. **This is
a candidate to back out.** The cycle-count → A-03 half is solid; the
bridge-ratio half is questionable.

---

## Score badges + scoring-layers caption (#508)

**PREREQ** Tarski panel open, recommended list non-empty.

**USER STEPS**
1. Open Tarski panel — observe baseline score chips on each
   recommended card.
2. Click any node — watch chips and caption update.
3. Expand any axiom card.

**EXPECT**
- Every RECOMMENDED card shows a `0.XX` cyan chip.
- Under RECOMMENDED header: "scoring on: selection (1) · structural
  (chokepoint, cross-domain)" or similar.
- Caption hides cleanly when no layer is active (empty graph, no
  selection, no memory).

**COPILOT VERIFY**
- DOM contains `[data-test-id="score-chip"]` (or similar) on every
  recommended card.
- The text matches `/^\d+\.\d{2}$/`.
- Scoring caption matches `/scoring on:/`.

**FAILS IF** No chips visible, or caption never appears.

**HONEST NOTE** **This is the most user-driven PR of the session** —
shipped in direct response to your "can't tell if it's live" feedback.
Without it, the underlying memory + selection-aware machinery is
invisible. Don't revert this one.

---

## Domain-leak fix — calc-watchlist tour copy (#509)

**PREREQ** SCIENTIST persona, T1D domain selected, deep-dive tour
re-launched.

**USER STEPS**
1. Open tour via the `?` button.
2. Navigate the "loop" track to the `calc-watchlist-row` step.

**EXPECT** Description reads `"...week-over-week drift on any metric,
daily cycle-count or bridge-ratio check..."`. Does NOT mention
"supply concentration drift".

**COPILOT VERIFY**
- `TOUR_STEPS.find((s) => s.id === "calc-watchlist-row").copy.description`
  does not include the substring `"supply concentration drift"`.

**FAILS IF** That string appears.

**HONEST NOTE** Tiny one-line fix. Mostly hygiene.

---

## Vercel deploy gating + branch protection (#511)

**PREREQ** Admin access to the GitHub repo.

**USER STEPS**
1. Open any new PR.
2. Try to merge while either Vercel check is `pending`.

**EXPECT** Merge button disabled until both Vercel checks flip to
`success`.

**COPILOT VERIFY** Not a runtime feature — verify via GitHub API:
```
GET /repos/ApexAnalytica/apex-terminal/branches/main/protection
```
should return `required_status_checks.contexts` containing both
`"Vercel – manifold"` and `"Vercel – apex-analytica-website"`.

**FAILS IF** PRs can be merged while Vercel checks are pending.

**HONEST NOTE** Infra hygiene. Already enabled (user ran the script).

---

## Pre-existing TS error cleanup (#512)

**PREREQ** Dev environment.

**USER STEPS**
```bash
npx tsc --noEmit
```

**EXPECT** Zero errors, zero output.

**COPILOT VERIFY** No errors mentioning `onboarding-metrics.test.ts`,
`fci.test.ts`, or `notears.test.ts`.

**FAILS IF** Any errors in those files.

**HONEST NOTE** Pure dev experience. No user impact.

---

## T1D axiom validators — TA-01, TA-02, TR-02 (#514)

**PREREQ** T1D domain selected, verified-mode toggle on, **a node
carrying `cgm_glucose_mgdl` and/or `insulin_*` live signals**.

**USER STEPS — TA-01 (glucose bounds)**
1. Push a `cgm_glucose_mgdl` snapshot < 40 or > 600 onto a node
   (via DevTools or a future feed).
2. Toggle verified mode on.
3. Tarski validation runs.

**EXPECT** The node is restricted; its highest-weight outbound edge
flagged. Proof trace mentions `"hypo"` or `"hyper"` and the value.

**USER STEPS — TA-02 (insulin non-negativity)**
1. Push any `insulin_*` kind with value < 0.
2. Verify.

**EXPECT** Edge flagged with verdict `REJECTED` (hard physical-law
violation, not soft flag).

**USER STEPS — TR-02 (CGM TIR)**
1. Push a `cgm_glucose_mgdl` snapshot with `history` of ≥ 14 entries
   where < 70% are in [70, 180].
2. Verify.

**EXPECT** Edge flagged with reason containing `"TIR < 70%"` or
`"TBR<54 > 1%"`.

**COPILOT VERIFY**
- `runTarskiValidation(graph, new Set(["TA-01"]), "t1d").proofTraces`
  contains a trace whose `detail` mentions `"hypo"` / `"hyper"`.

**FAILS IF** Nothing happens despite the signal being present.

**HONEST NOTE — IMPORTANT** **Dormant until feeds land.** No real
T1D feed populates `cgm_glucose_mgdl` on graph nodes today. The only
way to exercise these validators in practice is via DevTools push or
test fixtures. Forward-looking code; tests cover the math but the
user-facing wiring is incomplete. The synthetic-cgm cohort feeds a
discovery run (#498), not graph-node liveData[].

---

## Cross-cutting verifications

The copilot can run these once to gauge overall session health:

- `npx tsc --noEmit` → 0 errors
- `npx vitest run src/lib src/components` → 1677/1677 pass
- `localStorage["manifold:axiom-interaction-history"]` and
  `localStorage["manifold:graph-calc-history"]` both round-trip cleanly
- A new PR's merge button is disabled while Vercel checks pend

---

## Features I flagged as candidates to revert / gate

Recorded here for the copilot to surface honestly when a user asks
"what's worth using?":

1. **Bridge-ratio → A-04 wiring** (half of #504) — semantically a
   stretch; should be backed out.
2. **Supply Gini** (part of #502) — overlaps with HHI; should be moved
   out of default registry.
3. **PCMCI+ on synthetic CGM** (#498) — presented as a discovery run
   but uses synthetic data; should be gated behind a `?dev=1` query
   param until a real D1NAMO run is committed.

The copilot should **not** recommend these features to users until
the underlying concerns are resolved.

---

# Week of 2026-05-24 — broader context

Beyond the 12 PRs walked through above, the same 7-day window shipped
~40 more PRs. They're grouped here by theme with one-line honest
notes — terser than the full walkthroughs above, but the copilot can
still cite them when answering "what shipped this week?" or "is X
new?".

## Engine work (causal-discovery + verification)

- **PCMCI+ v0.2 — contemporaneous PC-stable + v-structures + Meek (#478)** — replaced v0.1's lagged-imbalance heuristic with canonical Pearl/Meek pipeline. Real algorithm now, not a heuristic. Linear-Gaussian CI only — non-parametric CI still on the roadmap.
- **Selection-aware Tarski recommender (#467)** — clicking a node now reorders RECOMMENDED axioms with selection-specific reasons. Foundation for the visibility fix (#508).
- **Domain-aware copilot system prompt (#475)** — T1D sessions now get T1D framing in the LLM's reasoning, not geopolitical analogies. Eval-tested per-profile.
- **Surface the recommender's "why" (#470)** — the selection-aware boosts were silent before; now every recommended card carries a "why · ..." caption. Predecessor to #508's score badges.
- **A-02 Flow Conservation — live capacity-saturation branch (#455)** — A-02 now fires on live production/throughput saturation ≥ 90%, not just structural edge-weight imbalance. Matches the A-04 multi-branch pattern shipped earlier.
- **PCMCI+ contemp + R-03 live branches (#473)** — combined PR: PCMCI+ v0.1 algorithm + R-03 export-route-monopoly live branches (storm, sanctions, saturation). v0.1 PCMCI+ later superseded by #478.

## Calculations registry (entire system, from zero)

- **CALCULATIONS registry + right-rail panel (#457)** — the entire concept. Pure-function calcs that render in the right rail. Foundation for everything below.
- **"→ DIAL" TimeDial push (#458)** — calcs push values onto node liveData[] as snapshots.
- **Graph-wide calc snapshots + inline sparkline (#459)** — extends the pattern to graph-wide calcs (mean ΩF, cross-domain edges).
- **3 more calcs — bridge ratio, mean J, buyer HHI (#466)** — doubled the registry from 3 to 6.
- **Persist graph-wide calc history (#468)** — first half of the persistence story.
- **"→ DIAL" auto-pin to watchlist (#489)** — closed the "I pressed DIAL but nothing happened" gap. Calc trajectories now auto-pin to the bottom watchlist on first push.
- **Persist node-scoped calc trajectories (#493)** — finished the persistence story.

## Dock + watchlist consolidation

- **Consolidate bottom dock into one panel (#464)** — folded the old standalone risk-card strip into a unified WATCHLIST + ΩF TIME SERIES panel on the main `/` page. The big UX consolidation of the week.
- **Restore collapse toggle (#490)** — fix-up for #464 that brought back a regression.
- **Persist bottom-dock collapse (#491)** — choice survives reload.
- **Watchlist left-collapse + persist pinned series (#497)** — narrow column collapse independent of whole-dock collapse.

## Persistence layer

- **Snapshot history + severed edges + enabled axioms (#503)** — user investigation state survives reload.
- **User preference fields — view, module, persona, etc. (#505)** — preferences survive reload.

## Data + feeds

- **OpenSanctions consolidated watchlist provider (#506)** — sanctions feed beyond just OFAC.
- **EIA Saudi-crude proxy extended to Ras Tanura (#484)** — production proxy reused for the export terminal node.
- **EIA Qatar dry-gas → North Field (#479)** — first non-Saudi gas feed.

## Graph data — Phase 16 facet decomposition

- **Phase 16 PR 2: Abqaiq Plants facet decomposition (#456)** — second pilot of the shared-infrastructure pattern; splits an aggregate node into the actual physical facets that connect to different downstream chains.
- **Phase 16 PR 3: cleanup sweep (#461)** — deletes legacy domain-scoped duplicate nodes once the facet decomposition stabilizes.

## Performance

The week's perf wave: 6 separate PRs that each shaved real wall-clock
from canvas re-renders. Together they made the 3D canvas usable on
the medium-density graphs:

- **chi-star content-fingerprint cache (#474)** — was the single
  biggest hotspot (O(V·E) Brandes runs on every render).
- **graphSignature() fingerprint cache (#476)**
- **canvas3d cached topology key (#477)**
- **Slim worker payload (#480)** — less data crossing the worker boundary.
- **Defer chiStar across all 5 consumers (#471)**
- **top-N partial select, nodeById map, rAF resize (#507)** — wrap-up
  round with smaller wins compounded.

## Domain isolation (T1D vs geopolitical)

- **Hide T1D discovery runs when no T1D domain selected (#463)** — the
  original leak the user caught with a screenshot. Fix #1 of the audit.
- **Domain-aware ScenarioInput placeholder + leak-audit results (#469)** —
  full audit; ScenarioInput's Hormuz example was the one real leak found.
- **Tour copy domain-leak fix (#509)** — round 2 audit; "supply
  concentration" example in shared-track tour copy.

## Infra + hygiene

- **Header settings menu consolidation (#510)** — refactored top-bar
  controls. Removed the performative CDΩ monitor that was always
  showing CRITICAL.
- **Vercel deploy gating via branch protection (#511)** — closes the
  "merged before deploy completes" gap. User ran the script.
- **TS error cleanup (#512)** — `tsc --noEmit` now exits 0 across the
  whole tree.
- **3D Canvas frameloop fix (#513)** — orbs animate at idle again.

## Docs

- **Phase 16 Shared-Infrastructure pattern + template (#462)** — recorded
  the facet-decomposition workflow so future graph expansions follow
  the same recipe.
- **Perf rounds 10-20 + remaining sub-ms leftovers (#482)** — wrap-up
  doc for the perf wave.
- **EIA aggregate-proxy technique exhausted note (#485)** — honest cap
  on the proxy approach: it works for Hormuz/Ras Tanura, but LNG export
  has no exports-activity dataset to proxy from (#486).

---

## Cross-cutting themes the copilot can cite

When asked "what's the story of this week's work?", the honest framing
groups the 50 PRs into four narratives:

1. **The calc → axiom feedback loop**, end to end. CALCULATIONS registry
   (#457) → DIAL push (#458, #489) → graph-wide variants (#459, #466) →
   persistence (#468, #493) → recommender wiring (#495, #504) →
   visibility (#508). Eight PRs across the week build to: user
   computes a metric, recommender lifts the matching axiom, trajectory
   accumulates over time, all of it survives reload.

2. **Recommender went from passive to active**, in three steps.
   Selection-aware boosts (#467) → reason captions (#470) → memory +
   score badges + scoring caption (#501, #508). The reorder used to
   be silent; now it has a face.

3. **PCMCI+ went from heuristic to real**, twice. v0.1 lagged-imbalance
   (#473) → v0.2 PC-stable + v-structures + Meek (#478) → wired into
   panel via synthetic CGM (#498) → PAG marks rendered (#499). The
   algorithm is now canonical Pearl/Meek; the panel wiring is
   honest-but-incomplete (synthetic substrate, no real D1NAMO).

4. **The performance round** — six PRs (#471, #474, #476, #477, #480,
   #507) compounded into the 3D canvas being usable on medium-density
   graphs. The chi-star cache (#474) was the single biggest win.
