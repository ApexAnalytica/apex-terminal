# Founding Member Offer — Manifold

**Goal:** sell 10 Manifold seats fast, generate first cash to fund compute/scale, and create a reference-customer base before public launch.
**Target take:** $15,000-25,000 within 14 days, depending on pricing structure chosen below.
**MVP launch path:** Stripe Payment Link + a single Notion or one-page on `/founding`. Full website integration follows.

---

## Decision needed first — pricing structure

I've drafted three structures. Pick one before launch; the difference is "fast cash now" vs. "sustainable lifetime value":

### Option A — most aggressive, fastest yes (recommended for speed)

> **Founding 10 — $1,500 for year 1. Renewal at $9,000/year, locked for life.**

- Year 1 take if all 10 sell: **$15,000 in 14 days.**
- Year 2 ARR locked: $90,000 (vs. $240,000 at public price).
- 94% off year-1, 63% off in perpetuity. Aggressive but defensible as "founding investor pricing."
- Risk: 10 customers permanently below cost-to-serve if pricing power grows. But by year 2 you'll have raised public price; renewals are still revenue you wouldn't otherwise have.

### Option B — balanced, sustainable

> **Founding 10 — $2,500 for 12 months. Renewal at $12,000/year, locked for 3 years.**

- Year 1 take: **$25,000 in 14 days.**
- Year 2 ARR locked: $120,000.
- Stronger first cash, less aggressive lifetime discount, 3-year cap on the lock.

### Option C — anti-anchor (skip the discount, lean into scarcity)

> **Founding 10 — $5,000 for 6 months evaluation. Convert to full $24k/year at month 6 or walk.**

- Year 1 take: **$50,000 in 14 days** (if all 10 sell).
- No permanent discount. The "founding" framing is access + voice in roadmap, not price.
- Hardest sell because the 6-month evaluation isn't structurally that different from buying a seat — but tests the real demand.

**My recommendation: Option A.** At this stage, fast cash + reference logos beats lifetime ARR optimization. The 10 founding customers become your first case studies, your first reference calls, and your first social proof — all of which compound the value of every subsequent sale at full price. Discounting them to 6% of retail is the price of buying that flywheel.

The rest of this doc assumes Option A. Trivial to swap in B or C if you go differently.

---

## Customer-facing copy (paste into landing page, emails, posts)

### Headline

> **Founding 10 — Manifold for $1,500/year. Forever.**

### Subhead

> Manifold is the institutional research terminal for cross-domain causal risk analytics — built by the team behind ΩF (Omega-Fragility), with engines for causal discovery (Spirtes), counterfactual intervention (Pearl), formal verification (Tarski), and cascade simulation (Pareto). Public price is $24,000 per seat per year. The first 10 customers get in for $1,500, locked.

### Body

The platform is real. The validation is real. Manifold has shipped causal-criticality analysis on real T1D cohort data (D1NAMO, AUROC 0.679 on regime-change detection), real counterparty cascade analytics for finance, and real fragility readouts across seven configured domains.

We're going to public launch shortly. Before we do, we want ten customers who use the platform daily, give us feedback, and become the reference accounts that anchor our first year. Founding 10 gets you:

- A full Analyst-tier seat for one year — single-domain workspace, full ΩF scoring, Pearl intervention engine, Tarski formal verification.
- A locked renewal at $9,000/year (vs. $24,000 public). Forever.
- Direct line to the engineering team. Feature requests get prioritized.
- Founding Member badge on your profile. (Permanent. Survives any future tier restructure.)
- An invitation to the closed Founding 10 channel where the team and other founding customers actually talk.

What we want from you in return: use the platform. Give us honest feedback. Let us reference your firm by name (or by industry-only attribution if you prefer) once you've been on the platform for 30 days.

### CTA

> **Claim a founding seat — $1,500.** [Stripe Payment Link]
> Six left.

(Decrement the counter as seats sell. Real scarcity, not fake.)

### FAQ (drop into accordion on landing page)

**Q: Is this a trial?**
A: No. It's a paid annual seat at founding pricing. The platform is live, real, and used by the team daily. There is no time-limited trial inside this offer.

**Q: What if I can't use it within the first 30 days?**
A: Renewal kicks in at month 12 regardless. We're not refunding for unused time. If you're not sure you'll use it, this isn't the offer for you — wait for the public launch.

**Q: What does "locked at $9,000/year" actually mean?**
A: Your renewal price is contractually locked at $9,000/year for as long as you're a continuous customer. Lapse a renewal and you're back to public pricing.

**Q: Which domain do I get?**
A: Pick one at signup: Finance, Energy, Geopolitical, Manufacturing, Infrastructure, Economic, Science, or Insurance & Reinsurance. Want a different domain or multi-domain access? That's a Multi-Domain seat ($48k public, not part of this offer) — talk to us separately.

**Q: How do I pay?**
A: Card via Stripe at signup. Wire / ACH / PO available on request — same locked price.

**Q: Are you a real company?**
A: Yes. Apex Analytica. Team at apexanalytica.co/leadership. Partnerships with AWS, Johns Hopkins University, and NVIDIA.

---

## Landing page spec — for the website chat

### Route

`/founding` on the manifold.apexanalytica.co platform OR on the marketing site — pick whichever ships first. **Strong preference for the platform** because the customer journey continues into onboarding immediately after payment.

### Components

```
- Hero: headline + subhead + CTA + remaining-seat counter
- Body: the 4-paragraph pitch above
- The 4 founding-member benefits as bullets with icons
- "What we want in return" paragraph
- FAQ accordion (5 questions)
- Trust bar: AWS / JHU / NVIDIA logos, team photos (Junaid + Georgios from /leadership)
- Footer-CTA: same Stripe link, repeated
```

### State / counter

The seat counter is the entire engagement asset. Implement as either:
- **Hardcoded for MVP** (`Six left` — manually updated by Brynna as seats sell). Ship today.
- **Live counter via Supabase** — table `founding_seats(id, claimed_at, customer_email, stripe_session_id)`. Counter reads `10 - count(*)`. Ship in 1-2 days.

Start with hardcoded; promote to live counter once 3+ seats are claimed (when manual updates start to lag).

### Stripe Payment Link

Set up a one-time Payment Link (not a subscription product) for $1,500 USD with these collected fields:
- Email (required, becomes login email)
- Company name
- Domain selection (single-select from 8 options)
- Industry / role (free text, optional)

On successful payment, redirect to `/founding/welcome` (or `/onboarding`). Stripe webhook fires → Brynna gets Slack notification → Junaid sends personal welcome email within 24 hours with login provisioning details.

**Don't connect this to the existing tier provisioning logic immediately.** First 1-3 sales, Brynna manually creates the account in admin and emails credentials. Automate after sale 3 when the workflow is proven.

### Failsafe copy if scarcity hits zero

When the counter hits 0, replace the CTA block with:
> **Founding 10 is full.** Public pricing launches [date]. Join the waitlist below. [Email field → /access form]

This converts spillover demand into the regular pipeline.

---

## Announce kit — for posting / emailing

### Tweet (use as-is)

```
Founding 10 — Manifold for $1,500/year. Locked forever.

We're opening 10 seats on the platform we've spent the last 18 months
building. Causal-graph fragility analytics — counterparty cascade,
sanctions propagation, climate non-stationarity, T1D restoration
trajectory.

Public price is $24k/seat/year. First 10 are $1,500.

apexanalytica.co/founding
```

### LinkedIn post (longer-form)

```
We're opening 10 founding seats for Manifold today.

Manifold is the institutional research terminal we've been building at
Apex Analytica for the last 18 months. Four engines — causal discovery,
counterfactual intervention, formal verification, cascade simulation —
on top of a 5-pillar fragility framework configurable per domain. Real
validation on real data: D1NAMO CGM (AUROC 0.679 on regime-change
detection), counterparty cascade analytics, geopolitical sanctions
propagation, infrastructure resilience.

Public price will be $24,000 per seat per year. The first ten customers
get in for $1,500 — locked forever, with renewal at $9,000/year for as
long as they stay on.

What we want in return: use it daily, give us honest feedback, let us
reference your firm once you're 30 days in.

This offer ends when the tenth seat is claimed. No extensions.

Reply or DM if you want a 15-min walkthrough first.

apexanalytica.co/founding
```

### Direct email — to Junaid's network (template, customize per recipient)

```
Subject: Founding 10 on Manifold — $1,500 lifetime price (open today)

Hi [Name],

Quick one. We're opening 10 founding seats on Manifold today — the
causal-graph fragility platform I've been building at Apex Analytica.

Public price will be $24k/seat/year. Founding 10 is $1,500 for year 1,
locked at $9,000/year forever.

I wanted to reach out before posting publicly because I think
[specific reason this person would care — their work on X, their team's
focus on Y, the conversation we had about Z]. The platform's domain
configurations include [the one most relevant to them: Finance /
Insurance / Geopolitical / etc.].

If it's a fit, the link is below. Six seats left.

If you want a 15-min walkthrough first, I can do tomorrow or Thursday —
let me know what works.

apexanalytica.co/founding

Best,
Junaid
```

### Email send list (initial blast)

Junaid sends the personalized version above to:
- Top 10 contacts from his current network (HSBC alumni, Pareto Tech network, JHU adjacencies, MARK LABS contacts)
- Top 5 contacts from Brynna's Goldman alumni list
- Top 5 from Georgios + Jeremy's HSBC list
- Total ~25 personalized sends

Wait 48 hours after emails go out before public LinkedIn / Twitter posting. If the network alone fills 5+ seats, you might not need public posts at all.

---

## Fulfillment plan — what happens when a seat sells

This is what kills "fast launch" offers when not planned. Don't skip it.

### Day-of sale

1. Stripe webhook fires. Slack channel `#founding-sales` gets a message: customer name, email, domain selected, payment confirmation.
2. Brynna immediately replies in `#founding-sales` claiming the customer for onboarding.
3. Brynna manually provisions the account: creates user in Supabase admin, sets tier `analyst`, sets `domain_access` to chosen domain, sets `current_period_end` to +12 months.
4. Brynna sends welcome email within 4 business hours with: login URL, temporary password, link to a "first 30 minutes" walkthrough doc, calendar link to book optional kickoff call with Junaid.

### Day 1-7

- Customer logs in. Brynna monitors usage in admin.
- If no login in 48 hrs, Brynna sends a check-in: *"Anything blocking you from getting started?"*
- Day 7: Junaid sends personal note: *"Thanks for being part of Founding 10. Quick question — what's the first analysis you're trying to run?"*

### Day 30

- Customer hits 30-day mark → eligible for case-study reference.
- Brynna asks: *"Mind if we reference [your firm name OR your industry/role] as a Founding 10 customer in marketing? You can pick by-name attribution or industry-only."*

### Renewal

- Day 330: Brynna sends renewal notice — $9,000 locked rate.
- Stripe creates a year-2 subscription product at the locked price.

---

## What launches first — the absolute MVP

To go live **today** if Junaid wants to:

1. Stripe Payment Link at $1,500 with the 4 form fields (~20 min in Stripe dashboard).
2. A Notion page or Tally form with the customer-facing copy + the Stripe link as the CTA. Free, public-shareable URL.
3. Junaid sends 5-10 personalized emails from the template to his closest network contacts.
4. Tweet + LinkedIn post 24-48 hrs later if no fast network response.

**Total time to MVP launch: ~90 minutes.** Total infrastructure cost: $0. The website integration (proper `/founding` route, live counter, design polish) ships in days 2-7 in parallel — the offer doesn't need it to start collecting revenue.

The Notion-page MVP is intentionally rough. Founding customers are buying access, not aesthetic. The polish ships after first cash lands.
