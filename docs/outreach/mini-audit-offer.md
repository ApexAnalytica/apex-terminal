# Mini-Audit Offer — ΩF Risk Readout

**Goal:** sell a fixed-scope, fixed-price productized analytics deliverable that converts platform IP into cash without the multi-week enterprise sales cycle.
**Price:** $1,500 flat per engagement.
**Turnaround:** 5 business days from CSV intake to delivered report + walkthrough.
**Target take:** 3-5 sales in 14 days = $4,500-7,500. Recurring as flywheel builds.
**MVP launch path:** Stripe Payment Link + Tally intake form + a one-page on `/audit`. Manual fulfillment by Junaid or Daniel for the first batch.

---

## Strategic positioning

This is **not** the $50-100k ΩF audit from the bigger plan. That one is for institutional buyers with budget. This is a stripped-down version aimed at the discretionary-spend buyer — a senior quant, a risk consultant, a fintech founder, a boutique fund partner — who wants to see what their data looks like through Manifold without committing to a seat.

**Why it works at this price point:**

- $1,500 is below the procurement threshold at most institutions. An MD's corporate Amex covers it. No SOW, no purchase order, no 6-week negotiation.
- The deliverable is concrete (12-page PDF + 30-min call). Buyer knows exactly what they're getting.
- Five business days is faster than any enterprise consulting alternative. Velocity is part of the value.
- Conversion path is built in: anyone who finds the audit useful is a qualified prospect for an Analyst seat or Multi-Domain seat.

**Why it works for Apex:**

- Real platform usage on real customer data. Every audit is a case study, a usage telemetry point, and a configuration test.
- Output is templated — first audit takes 2 days, fifth audit takes 4 hours.
- Customer self-qualifies: anyone who'll send a CSV and pay $1,500 cares about the answer enough to be a real prospect.

---

## Customer-facing one-pager

### Headline

> **ΩF Mini-Audit — see your portfolio as a causal graph in 5 days.**

### Subhead

> Send us your data. We run Manifold's causal-discovery and criticality engines, score every node on the 5-pillar Ω-Fragility framework, and deliver a 12-page report with the top fragility nodes, suggested interdiction actions, and a 30-minute walkthrough call. $1,500 flat. No subscription. No procurement.

### What you get

- **Causal-graph map of your data** — Spirtes / PCMCI causal discovery on whatever panel you provide (counterparty exposures, portfolio holdings, dependency network, infrastructure topology, supply-chain links). We hand you back the inferred causal structure.
- **ΩF readout per node** — every node scored on the 5 pillars: Irreplaceability (I), Restoration Latency (R), Jurisdictional Hazard (J), Systemic Cascade Load (C), Tail Depth (T). Composite ΩF score with bootstrap confidence interval.
- **Top-3 fragility nodes** — ranked by composite ΩF, with the cascade scenarios that drive each ranking.
- **Suggested interdictions** — for each top-3 node, Pearl do-calculus answers "what does the cascade look like if this node is removed or hardened?" Concrete actions with quantified effect sizes.
- **30-minute walkthrough call** — Junaid Ghauri (CEO) or a senior team member walks you through the report, answers questions, and discusses follow-on options.

### What you send us

A CSV (or Parquet, or JSON) with one of:
- A network: rows are edges, columns are `source / target / weight / [optional metadata]`.
- A panel: rows are observations, columns are nodes/variables. Time-indexed if available.
- A node table: rows are entities, columns are features/exposures.

If your data shape doesn't fit those, send what you have and we'll tell you in 24 hours whether we can work with it. We don't charge until we confirm we can deliver.

**We don't need PHI, PII, or position-level identification.** Anonymized / aggregated / synthetic-but-structurally-real data is fine — and often what Manifold extracts isn't sensitive to entity identity, just to relational structure.

### What we don't promise

- We don't predict prices, returns, or events. ΩF is a fragility readout, not a forecast.
- We don't replace your existing risk system. Manifold is structural / topological analysis, complementary to VaR / stress-test / scenario tooling.
- If your data is too small (< 20 nodes) or too sparse (no relational structure) for causal discovery to find signal, we'll tell you in the report and refund 50%. (Has happened twice.)

### Timeline

- **Day 0** — You pay. You upload your CSV via the secure intake link.
- **Day 1** — We confirm we can work with the data and lock the analysis plan.
- **Day 2-4** — Pipeline runs (Spirtes, Pareto criticality estimators, Pearl interdiction). We draft the report.
- **Day 5** — Report delivered as PDF + 30-min walkthrough call scheduled within 5 business days of delivery.

### CTA

> **$1,500 flat. Pay below.** [Stripe Payment Link]
> Fewer than 4 audit slots open this week.

---

## What's actually in the 12-page deliverable

(Spec for the team's templated output. Each audit follows this structure; only the data and conclusions vary.)

### Page 1 — Executive summary

- One paragraph: what was analyzed, what was found, what the top recommendation is.
- A single chart: the causal graph, with top-3 fragility nodes highlighted.
- Three numbered findings, one sentence each.

### Page 2 — Data summary

- What was provided (rows, cols, time range, schema).
- What was inferred (graph dimensions, edge density, temporal coverage).
- Any data-quality flags or caveats.

### Pages 3-5 — Causal structure

- Inferred causal graph visualization (Spirtes or PCMCI output).
- Top-10 strongest causal edges by score, ranked.
- Notable structural features: hubs, bottlenecks, cliques, weakly-connected components.

### Pages 6-8 — ΩF readouts per node

- Table: every node, its 5 pillar scores, composite ΩF, bootstrap CI half-width.
- Sorted by composite ΩF descending.
- Heat-map visualization of pillar scores across nodes.

### Pages 9-10 — Top-3 fragility deep-dive

- For each of the top 3 nodes:
  - Why it ranks where it does (which pillar dominates).
  - The cascade scenario that's its dominant fragility driver.
  - What knocking this node out does to the system (cascade simulation).

### Page 11 — Suggested interdictions

- For each top-3 node: Pearl do-calculus output. "If you do X (remove dependency, add buffer, harden trigger), the system-level fragility moves from ΩSF=A to ΩSF=B."
- Quantified effect sizes per intervention.
- Cost-benefit framing where applicable (how much hardening for how much fragility reduction).

### Page 12 — Caveats, limits, next steps

- Honest box: what this readout doesn't tell you.
- Validated vs. degenerate sub-scores (transparent about what couldn't be computed on this substrate).
- Three options for follow-on:
  1. Continuous platform access via an Analyst seat ($24k/yr or Founding 10 pricing if available).
  2. A deeper engagement on a specific finding ($10-25k for a 4-week scope).
  3. A scheduled re-audit at quarterly cadence ($1,500 each, locked rate for 12 months).

---

## Fulfillment workflow — how to actually deliver in 5 business days

### Day 0 — sale + intake

1. Stripe payment goes through. Webhook triggers Slack notification in `#mini-audits` channel + creates Notion page with customer details.
2. Customer is auto-redirected from Stripe success page to a Tally form: `https://tally.so/r/manifold-audit-intake`. Fields: company name (or "individual"), brief description of the data they're sending (1-2 sentences), upload field for CSV/Parquet/JSON, one-line "what question are you trying to answer" prompt.
3. Customer uploads.
4. Brynna sees Slack notification + Tally submission, files both in the Notion page. Pings Junaid or Daniel (whoever's on rotation).

### Day 1 — viability check

- Engineer (Junaid / Daniel) opens the data in `research/audit-template/` notebook (a templated repo — covered below).
- Confirms data shape is workable. Sends customer a 2-paragraph email: *"Yes, we can run this. Here's what we'll produce, here's the timeline. If you have any specific questions you'd like answered in the readout, reply to this email and we'll incorporate them."*
- If data is unworkable: sends the rejection / partial-refund email and refunds 50% via Stripe. (Has to happen sometimes; build the muscle.)

### Days 2-4 — pipeline + report

- Engineer runs the templated notebook end-to-end. Notebook auto-generates the 12-page LaTeX/HTML report from a template — only ~2 hrs of human work to write the executive summary, the top-3 deep-dive, and the suggested interdictions.
- All charts are auto-generated from the pipeline output.
- Quality check: another team member reads the draft for honest scope ("are we overclaiming on this dataset?"). Common edits: tone down anywhere we're inferring causation from a thin panel, flag degenerate sub-scores explicitly.

### Day 5 — delivery + call

- Brynna sends the PDF to the customer with a Calendly link to book the 30-min walkthrough within 5 business days.
- Walkthrough is on Zoom, recorded with customer permission, archived in Notion for future reference.

### After delivery — conversion attempt

- 7 days after walkthrough: Brynna sends follow-up email. *"How are you finding the readout? Any of the top-3 nodes worth deeper investigation?"* Soft mention of Founding 10 / Analyst seat pricing.
- 30 days after walkthrough: case-study request if applicable.

---

## Engineering prereq — the audit-template repo

Before launch, set up `research/audit-template/`:

- A Jupyter notebook that takes a path to a CSV/Parquet/JSON, runs the standard pipeline (Spirtes → Pareto criticality → Pearl interdiction → ΩF compose), and dumps results into a `results/` folder.
- A LaTeX or HTML report template with all 12 pages laid out, populated from the `results/` folder via a single render script.
- README with: how to set up env, how to run end-to-end on a sample CSV, how to handle common data-shape edge cases.

Once this exists, every audit takes 4-6 hours of human work + pipeline runtime. Without it, every audit is a custom 2-day engineering project and the unit economics are bad.

**Engineering effort to build the template: ~3 days.** Should ship before audit #2 sells, ideally before audit #1.

---

## Landing page spec — for the website chat

### Route

`/audit` on the platform OR on the marketing site. Either works; whichever ships first.

### Components

```
- Hero: headline + subhead + CTA + slot-availability counter
- "What you get" — 5 bullets with brief descriptions
- "What you send us" — the data-format paragraph
- "What we don't promise" — honest-scope section (this builds trust)
- Timeline visualization: Day 0 → Day 5 → Walkthrough
- Sample report — PDF preview of a 1-page sanitized example (use synthetic data for the sample)
- FAQ accordion (use FAQ from below)
- CTA repeat with Stripe link
- Trust bar: AWS / JHU / NVIDIA logos
```

### FAQ

```
Q: Do you sign an NDA?
A: Standard mutual NDA available on request before you upload — adds ~24
   hours to the timeline. For most customers, sending anonymized data is
   simpler and gets to delivery faster.

Q: What if I'm not happy with the report?
A: We refund 50% if the data was workable but you find no value. We
   refund 100% if our pipeline couldn't extract signal from your data
   (we'll tell you on Day 1, before any work starts).

Q: Can you analyze [unusual data type]?
A: Maybe. Send a sample to junaid@apexanalytica.co before paying and
   we'll tell you in 24 hours.

Q: How is this different from a Manifold seat?
A: A seat is continuous access to the platform — you run analyses
   yourself whenever you want. The audit is a one-time deliverable —
   we run a specific analysis for you and hand back the result. The
   audit is faster to start but the seat is cheaper per analysis if
   you'd run more than 3 audits a year.

Q: Can the audit lead to a longer engagement?
A: Often, yes. About a third of audit customers become seat customers;
   another third commission a deeper 4-week scope on a specific finding.
   No pressure either way — the audit is a complete deliverable on its own.
```

### Stripe Payment Link

$1,500 USD, one-time. Collected fields:
- Email
- Company / org (or "individual")
- Brief description of the data being sent (free text, 1 line)

After payment: redirect to Tally intake form (linked above) for the actual CSV upload.

---

## Announce kit

### Tweet

```
ΩF Mini-Audit is live.

Send us your data — counterparty graph, portfolio holdings, dependency
map, supply chain, anything with relational structure. Five business
days later you get a 12-page causal-fragility readout + 30-min
walkthrough.

$1,500 flat. No subscription.

apexanalytica.co/audit
```

### LinkedIn post

```
We're opening a productized version of Manifold today.

Send us your data — a counterparty network, a portfolio holdings table,
a dependency graph, a supply-chain map, an infrastructure topology.
Anything with relational structure. Five business days later, you get:

- A causal graph inferred from your data (Spirtes / PCMCI)
- An Ω-Fragility readout per node on five pillars
- The top-3 fragility nodes ranked, with scenarios
- Pearl do-calculus interdictions: what happens if you remove or harden
  each top node
- A 30-minute walkthrough call to discuss

$1,500 flat. No subscription. No procurement.

If we can't make signal from your data, we tell you on day 1 and refund.

apexanalytica.co/audit
```

### Email to network

Use the same template structure as the founding-member email. Customize per contact: *"I think this would actually answer [the question they're working on], and at $1,500 it's faster than any consulting equivalent."*

---

## What launches first — MVP

Same shape as Founding-Member: ship in ~2 hours.

1. Stripe Payment Link (~20 min).
2. Tally intake form for CSV upload (~30 min — free, no integration needed).
3. Notion page with the customer-facing one-pager + Stripe link.
4. Two emails from Junaid to past contacts who specifically asked about the platform.
5. Tweet + LinkedIn post.

The audit-template repo (engineering prereq) ships in parallel over the next 3 days. **First audit can be delivered manually using the existing platform** — the template just makes the second through tenth audits efficient.

---

## How both offers complement each other

Founding-Member and Mini-Audit hit different buyers:

| | Founding 10 | Mini-Audit |
|---|---|---|
| Buyer profile | Wants continuous tool access | Wants one specific question answered |
| Price | $1,500/year (lifetime locked) | $1,500 / engagement |
| Decision | "Will I use this regularly?" | "Will this give me one valuable readout?" |
| Conversion path | Becomes paying customer immediately | Becomes lead for seat / deeper engagement |
| Speed to launch | Today (90 min) | Today (2 hrs) |
| Inventory | 10 seats, hard cap | Unlimited (capped by team capacity) |

**Run both simultaneously.** A prospect who's not sure whether to commit to a seat can buy an audit first. A prospect who knows they want continuous access takes a Founding seat. The audit is a perpetual marketing asset; the Founding offer is a one-shot scarcity asset.

Both should appear in the same announce posts: *"Two ways to start with Manifold today — Founding 10 seats at $1,500/year forever, or one-time ΩF Mini-Audit at $1,500."*
