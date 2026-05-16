# Manifold — Ideal Customer Profile

**Purpose.** Reference document for BD partners (Kai at Crayford, Thibaut Perney, and any future referral partners under the standard referral agreement) to identify, qualify, and route prospects to Apex.

**How to use.** Each segment below names (a) the buyer profile inside the organisation, (b) named target organisations to watch for, (c) the four to six qualifying questions to ask in a first call, (d) what a "yes" looks like, and (e) what to avoid mentioning until the buyer has self-selected.

**Tiering.** Three tiers reflect commercial readiness, not domain interest:

- **Tier 1 — Active outreach.** First-wave commercial targets. Existing collateral, strongest team credibility, clearest budgets. BD partners should prospect here.
- **Tier 2 — Opportunistic only.** Real product configurations with credibility, but slower decision cycles or weaker team positioning. Take a meeting if a warm contact appears; do not cold-prospect yet.
- **Tier 3 — Research partnership, not commercial.** Domains where Manifold lands as research collaboration rather than paid customer. Out of scope for BD partners under the standard referral agreement.

---

## Tier 1 — Active Outreach

### 1. Insurance Brokers & Reinsurers

**Buyer profile.** Senior actuary, head of catastrophe modelling, head of reinsurance analytics, or capital-advisory practice lead. Title patterns: "Head of CAT Modelling," "Chief Actuary," "Head of Reinsurance Capital," "Director of Climate Risk Analytics," "Head of Aon Securities / ILS Structuring." MD or partner level. Typically reports to Chief Risk Officer or Head of Capital.

**Named targets.**
- **Brokers:** Aon (already in conversation via Shane), Marsh McLennan, Willis Towers Watson (WTW), Howden, Lockton, Gallagher Re.
- **Reinsurers:** Munich Re, Swiss Re, Hannover Re, SCOR, RGA, Everest Re, Renaissance Re, PartnerRe.
- **Lloyd's syndicates:** Beazley, Hiscox, Lancashire, Brit, Canopius.
- **ILS specialists:** Aon Securities, Twelve Capital, Securis, RenaissanceRe Capital Partners.
- **Climate-risk specialists:** Karen Clark & Co. (KCC), Verisk / AIR Worldwide, Moody's RMS, Climate Risk Group.

**Qualifying questions.**
1. Are you using Impact Forecasting, AIR, RMS, KCC, or a proprietary CAT model? Which?
2. How are you handling climate non-stationarity in your CAT fits? Have any of your historical-event-set models broken under recent regimes?
3. Do you model cascade through the reinsurance tower explicitly, or do you treat it as additive aggregation across treaties?
4. What is your process for validating ILS / parametric trigger structures? Tarski-style formal verification or expert review?
5. How are TCFD / NAIC / Solvency II disclosures handled? Statistical-only, or does the regulator expect structural causality narrative?
6. Are you the budget holder, or who signs off on analytics tooling above $50k / above $250k?

**What "yes" looks like.** The buyer asks a specific question Manifold can answer with a configured demo. Examples: "Can you show me what counterparty cascade looks like across a real reinsurance tower?" or "How would you model the climate-non-stationarity impact on our peril correlations?" Second-meeting commitment within two weeks. Permission to send a sample dataset for a Mini-Audit or pilot scope.

**Avoid mentioning until they ask.** Pricing (let the deck or follow-up email cover this). Other domain configurations (energy, geopolitical, manufacturing — distractions until insurance use case is anchored). Anything that frames Manifold as "AI" without "causal inference" qualifier — the audience is sceptical of generic AI claims.

**Collateral to send.** `docs/pdf/Manifold-for-AON-Deck.pdf` is the canonical insurance pitch deck. Reusable for any insurance / reinsurance prospect with minor cover-page customisation. Junaid handles the customisation; BD partner books the meeting.

---

### 2. Bank Counterparty Risk & Financial Stability Teams

**Buyer profile.** Head of counterparty credit risk, head of XVA, head of regulatory capital, head of financial-stability analytics. Inside large banks and regulated institutions. Title patterns: "Head of Counterparty Risk," "Head of Credit Portfolio Management," "Head of Regulatory Capital Methodology," "Head of XVA Desk." MD level. Reports to Chief Risk Officer or Head of Treasury / Capital Markets.

**Named targets.**
- **G-SIBs / Tier-1 banks:** HSBC (alumni network strong here — Junaid, Georgios, Jeremy), JPMorgan, Citi, Bank of America, Standard Chartered, MUFG, Société Générale, Deutsche Bank, BNP Paribas, Barclays, UBS, Credit Suisse successor (UBS Investment Bank), Nomura, Mizuho.
- **Mid-tier:** ING, Santander, ABN AMRO, Wells Fargo Capital Markets, RBC, BMO, TD Capital Markets.
- **Regulators (longer cycle, slower buy):** Federal Reserve FSAR, Bank of England Financial Policy Committee, ECB / ESRB, Bank of Canada Financial Stability, OFR (US Treasury).

**Qualifying questions.**
1. How are you currently modelling cross-counterparty correlation under stress? Statistical / copula-based, or structural?
2. Are FRTB / Basel 3.1 enforcement timelines forcing methodology upgrades on your team?
3. Have post-2023 events (SVB, Credit Suisse, Archegos) changed how the board asks about structural risk?
4. Do you have an internal "explain the cascade" mandate from the CRO or board, beyond VaR / stress testing?
5. What is your tooling stack? Murex / Numerix / Quantifi / proprietary? Where do you feel the gap?
6. Decision authority and procurement cycle — how does a $150k tooling spend get approved?

**What "yes" looks like.** Buyer engages on a specific regulatory or methodology question Manifold addresses. Asks for a walkthrough on their counterparty network shape. Mentions an active project where structural causality would improve a model output. Open to a Mini-Audit on anonymised counterparty data.

**Avoid mentioning until they ask.** Mercury invoicing (procurement will want net-60 / PO terms — flag separately). Crypto / digital-asset configurations (most counterparty teams are crypto-sceptical or have separate teams). Manufacturing or science use cases (irrelevant distractions).

**Collateral to send.** No bank-specific deck exists yet — when this segment activates, we draft `Manifold-for-Counterparty-Risk-Deck.pdf` using the same template as the AON deck. Until then, BD partner secures the meeting; Junaid sends a custom 2-page memo for the call.

---

### 3. Macro Hedge Funds & Multi-Strategy Funds

**Buyer profile.** Portfolio manager running a macro book, head of macro research, head of risk at a multi-strategy fund, CIO at a smaller fund. Title patterns: "Macro PM," "Head of Macro Strategy," "Director of Research," "CIO," "Head of Cross-Asset Risk." Partner or senior MD. Decision authority usually concentrated; partners can sign $50-250k checks personally.

**Named targets.**
- **Large macro funds:** Brevan Howard, Caxton Associates, Bridgewater (slow but worth pursuing), Element Capital, Rokos Capital.
- **Multi-strategy with macro pods:** Citadel macro, Millennium macro, Point72 macro, Marshall Wace systematic macro, Balyasny, ExodusPoint.
- **Quant funds doing causal / regime-aware work:** Two Sigma, AQR, Renaissance (impenetrable but worth knowing names), Man AHL, Winton, Capstone.
- **Family offices and smaller boutiques:** anywhere with $500M+ AUM and a partner who personally controls research budget.

**Qualifying questions.**
1. What is your current process for detecting regime shifts? Statistical change-point methods, or qualitative judgment?
2. How do you handle cross-asset / cross-jurisdiction correlation under stress? Does your historical correlation matrix break down for you in practice?
3. Are you using or evaluating any causal-inference tooling (PCMCI, transfer entropy, Pearl-style do-calculus)? Or is "causal" still a research-only topic for you?
4. Decision shape: is this you personally evaluating, or do you bring in a quant team for a multi-month evaluation?
5. What is your tolerance for early-stage tools? Do you need a polished enterprise product or are you comfortable working with a configurable platform?
6. Would you take a 30-minute live walkthrough configured against a question your team is currently working on?

**What "yes" looks like.** Partner asks for a live demo on their next call. References a specific regime-shift event their existing tooling missed. Open to running a Mini-Audit on a sanitised data slice. Decision cycle is usually 1-3 months, faster than banks.

**Avoid mentioning until they ask.** Insurance / reinsurance use cases (uninteresting to most macro PMs). Long-form regulatory disclosure use cases (irrelevant — funds answer to LPs, not regulators in this product sense). The team's reinsurance background (de-credentialing in a hedge fund context — lead with HSBC / quant lineage instead).

**Collateral to send.** Live screen-share demo of the Manifold platform on a sanitised macro-relevant configuration. Decks tend to land less well with macro PMs than a working demo. BD partner books the call; Junaid runs the screen-share.

---

## Tier 2 — Opportunistic (Warm Intros Only)

These segments are real configurations on the platform with credible team positioning, but the team is not yet equipped to cold-prospect them effectively. If a BD partner has a warm contact in these spaces, take the meeting; do not generate cold outreach.

### 4. Energy Trading Desks

**Buyer profile.** Head of risk at an energy trading firm, head of analytics at a utility's trading arm, head of fundamental research at a commodities macro fund. Title patterns: "Head of Energy Trading Risk," "Director of Fundamental Analysis," "Head of Quantitative Research, Energy."

**Named targets.** Vitol, Trafigura, Mercuria, Gunvor, Glencore Trading, Shell Trading, BP Trading, TotalEnergies Trading, Hartree Partners, Castleton Commodities, Citadel Commodities desk.

**Qualifying questions.** Same shape as macro funds but focused on commodity-specific causality: weather, geopolitical supply shocks, refinery outages, transition-energy transition dynamics.

**Notes.** Manifold's Energy domain is configured but lighter on team domain credibility than insurance or finance. Lead with the platform, not credentials. Best entry point is a warm intro through Junaid's Pareto Technologies network.

### 5. Geopolitical / Sanctions / Sovereign Credit

**Buyer profile.** Head of country risk, head of sovereign credit, head of sanctions compliance at a multinational or financial institution. Government adjacent: directors at IISS, RAND, Atlantic Council, country-risk practices at consultancies. Slower cycles, prestige plays.

**Named targets.** Sovereign credit teams at S&P / Moody's / Fitch. Country risk at large multinationals (Boeing, Lockheed, GE). Sanctions compliance at BlackRock, Vanguard, large asset managers. Government / IC adjacent: DARPA, IARPA, ODNI partner organisations.

**Notes.** Long sales cycles, often public-sector or quasi-government procurement. Best treated as side-pipeline; do not invest BD effort here in tier-1 phase.

### 6. Manufacturing & Supply Chain Resilience

**Buyer profile.** Chief supply chain officer, head of supplier risk, head of operations analytics at a large manufacturer. Post-COVID, supply-chain resilience is a real budget line at most Fortune 500 manufacturers, but the buying motion is slow and product-fit translation requires customisation work the team has not yet done.

**Notes.** Real configuration, weakest team credibility of all the commercial segments. Take meetings on warm intros only.

### 7. Critical Infrastructure Operators

**Buyer profile.** ISO / RTO operations planners, transmission planners at utilities, infrastructure risk teams at government-adjacent entities. Slow procurement, often government-buying-motion-shaped.

**Notes.** Real product configuration, but government-buying cycle removes this from a BD partner's effective range. Igusa (advisor) has NIH / CDC funding history relevant here; this segment activates if and when Apex pursues SBIR or government-grant funding paths.

---

## Tier 3 — Research Partnership Only (Not Commercial for BD Partners)

### 8. Science — T1D, Pharma R&D, Biotech

This segment is Junaid's personal direct outreach track. T1D research institutions (Joslin, nPOD, DRI Miami, HIRN, Mt Sinai, UBC, VX-880 / Vertex). These engagements generate research-partnership value (data access, co-authorship, NIH / JDRF grant co-applications) rather than commercial revenue.

**Do not prospect here under the standard referral agreement.** If a BD partner has an introduction into a pharma company or biotech where the engagement would be commercial (Vertex Pharmaceuticals on configured platform deployment, Sanofi or Novo Nordisk on pipeline data analytics), flag to Junaid and we treat case-by-case.

---

## Cross-Segment Outreach Tactics

### Channel guidance

- **Warm intros through alumni / professional networks.** Highest conversion. BD partner's primary mode.
- **LinkedIn outreach to named targets.** Secondary mode. Only after warm-intro paths are exhausted.
- **Conference / event introductions.** Highly useful for Tier 1 segments where the right rooms exist (RIMS, S&P Global Insurance Conference, Risk.net events, Quant Strats, AlphaQuant).
- **Cold email at scale.** Avoid. Burns brand, low conversion at this segment maturity.

### Framing language

- **Lead with the problem, not the platform.** "How are you currently modelling X?" beats "Have you seen Manifold?"
- **Concrete over abstract.** "Counterparty cascade through the reinsurance tower" beats "structural risk analytics."
- **Honest scope.** Manifold is not a Bloomberg replacement, not a full risk-management system, not an alpha-generation tool. Honest positioning: "complementary structural-analytics layer that sits alongside your existing stack."

### What to send when

| Stage | Buyer behaviour | Send |
|---|---|---|
| Pre-call | Warm intro arranged | One-paragraph context email from BD partner introducing Junaid |
| First call | Buyer agrees to 30 min | No deck pre-read. Run live walkthrough configured for the buyer's domain |
| Post-call | Buyer asks for more | Domain-specific brief (AON deck for insurance; custom 2-pager for finance) |
| Second meeting | Buyer brings colleagues | Configured Manifold instance + scoped Mini-Audit / pilot proposal |
| Pilot scoping | Buyer wants to engage | Pilot SOW drafted by Junaid + Brynna, signed via DocuSign |

### Referral commission attribution

Per the standard Referral Partner Agreement: BD partner introduces a Prospect, prospect was not already in Apex's pipeline, contract signed within 12 months, prospect acknowledges the referrer in writing. 15% of Year-1 ACV, 5% on Years 2 and 3. Exclusions: Founding 10 promo, self-serve trials, Pareto Technologies internal deals, pre-existing pipeline.

### Reporting cadence

BD partner sends a weekly status update (Friday EOD) to Brynna:
- New names introduced this week
- Conversations advanced (first meeting → second meeting → proposal)
- Stuck / cold conversations
- Help needed from Junaid

Brynna maintains a shared tracker (Airtable or Notion). Junaid sees the rollup; takes any call where the buyer specifically asks for the founder.

---

## Anti-patterns — what closes the door

1. **Pitching the platform before understanding the buyer's problem.** First call is for listening, not selling.
2. **Leading with technology terminology** (causal inference, do-calculus, persistent homology). Lead with what the buyer cares about; technology comes in the demo.
3. **Sending the AON deck to a hedge fund.** Each segment expects its own framing.
4. **Promising features that don't exist yet.** Honest scope wins long-term; overpromising kills the relationship in week two.
5. **Negotiating commercial terms in the first call.** Always defer pricing conversation until after value is demonstrated.
6. **Forwarding the deck to a junior who then forwards it sideways.** Always close the loop with the original buyer; never let the deck go cold inside the prospect's organisation.

---

## What to escalate to Junaid

- Any second-meeting commitment from a Tier 1 prospect.
- Any pilot / paid-engagement conversation, regardless of segment.
- Any government / public-sector buyer (different procurement playbook).
- Any introduction that may overlap with Apex's existing pipeline (Brynna can confirm).
- Any buyer's procurement / legal request that goes beyond standard SOW + Mini-Audit terms.

## What BD partners can handle without escalation

- First-call scheduling and introductions.
- Sending the AON deck to insurance / reinsurance prospects (after Junaid customises the cover line).
- Routine follow-ups and nudges on pending prospects.
- Conference and event-circuit introductions where the conversation stays at "would this be interesting to your team?"
