# Manifold for Counterparty & Cross-Asset Risk

**Cover · M-FIN-01 · 2026-05-05**

> **Format note:** this is the content draft. Once approved, it gets rendered into the same brand-styled cover HTML as the T1D briefs (`docs/manifold-for-t1d-restoration-cover.html`) and saved to `docs/pdf/Manifold-for-Finance-Counterparty-Cover.pdf`. A full-brief `M-FIN-01` (3-5 pages) follows the same template as `manifold-for-t1d-restoration.html`.

---

## Subtitle

ΩF fragility analytics for counterparty networks, collateral chains, and cross-asset cascade

---

## Lead

Counterparty risk, cross-asset stress, and sovereign-credit cascade share a structural problem the standard tooling does not address: VaR and historical stress tests answer **how big** a loss could be, but not **through which channels** it propagates. When the 2023 banking turbulence, the LDI episode, the 2020 dash-for-cash, and the 2008 collapse are studied after the fact, the failure mode is always the same — common collateral, common counterparties, common factor exposures, and structural couplings the desk-level model never represented. **Manifold** configures three engine capabilities to the domain: causal discovery on price, exposure, and balance-sheet panels (Spirtes / PCMCI on lagged returns, exposure deltas, and cross-margin flows); criticality estimators on each node (BOCPD on regime changes, transfer entropy on funding-liquidity coupling, persistent-homology on the topology of the exposure graph); and Pearl do-calculus with interdiction to answer "if I cut this exposure, what does the cascade look like?" — the question stress tests gesture at and never actually answer.

---

## Callout

> Stress tests answer how big a shock could be. Causal graphs answer through which channels it propagates. Both are necessary. Most desks have only the first.

---

## ΩF pillar mapping — counterparty & cross-asset

| Pillar | Reading |
|---|---|
| **I — Irreplaceability** | Name-counterparty substitutability under a freeze; primary-dealer concentration; single-source clearing dependencies; common-collateral choke points |
| **R — Restoration Latency** | Time to replace funding or collateral after a market-wide squeeze; recapitalization speed; replacement-counterparty onboarding lag under stress |
| **J — Jurisdictional Hazard** | Sanctions cascade exposure; regulatory-regime shift risk (Basel 3.1, FRTB, FSB designations); currency-zone fragmentation; cross-border CCP fragility |
| **C — Systemic Cascade Load** | Contagion depth through interbank, repo, and derivatives networks; common-collateral fire-sale loops; cross-asset margin spirals; sector-correlation breakdown |
| **T — Tail Depth** | Distributional depth beyond VaR (99.9% / EVT regime); correlation-collapse dynamics; fat-tail severity conditional on regime; left-tail dependence asymmetry |

---

## Why now

Three shifts are converging that make causal-graph fragility the right primitive for risk methodology in 2026:

1. **Basel 3.1 / FRTB enforcement raises the bar on counterparty methodology.** Capital savings flow to whoever models structural exposure correctly, not just historical volatility.
2. **Post-2023 banking turbulence reframed risk as topological.** SVB, Credit Suisse, and the regional-bank cluster were structural failures. Boards now ask "show me the network," and most desks have nothing to show.
3. **Causal inference has crossed the operational threshold.** Pearl, Spirtes, and PCMCI are no longer research curiosities; they are deployable on production data panels at the scale a single risk team operates.

---

## Engagement

Manifold is sold as an **institutional research terminal**, per-seat annual, with a 48-hour gated pilot scoped to a single evaluation use case. Three tiers:

- **Analyst — $24,000 / seat / year.** Single domain (Finance). Full ΩF scoring, Pearl intervention engine, Tarski formal verification of policy/control regimes, email support. Sized for a senior quant or risk individual contributor.
- **Multi-Domain — $48,000 / seat / year.** All public domains (Finance, Energy, Geopolitical, Macroeconomic, Infrastructure). Cross-domain causal bridges. Live data feeds. Estimator outputs (BOCPD, Cox, NLME, transfer entropy). Priority support. Sized for a desk or research team that needs the cross-asset / cross-domain view.
- **Enterprise — from $150,000 / year.** Custom subgraphs and domain models built to the institution's portfolio shape. On-demand estimator runs on internal panels. Dedicated solutions engineer. Contractual SLA. Sized for a counterparty-risk team, a financial-stability division, or a multi-strategy fund.

Billing flexible — wire, ACH, PO/net-60. Procurement onboarding handled by Brynna Shale (Head of Operations, ex-Goldman).

---

## What we're asking

A 30-minute conversation. We bring a configured Manifold instance — counterparty-network demo with mocked-but-realistic positions — and walk through one cascade scenario relevant to your book or your team's evaluation use case. If the demo earns a second meeting, we configure a 48-hour pilot on your sanitized data. If the pilot earns its place, you take an Analyst seat or escalate to a team-level conversation.

No procurement committee for the first seat. No multi-month evaluation cycle. The question we want answered in the first call is: *would I personally use this?*

---

## Who we are

**Apex Analytica** builds Manifold, the causal-inference research terminal for cross-domain risk. Team includes ex-HSBC AI/quant (Junaid Ghauri, CEO; Georgios Korpas, Head of Research; Jeremy Kulcsar, AI Research Scientist), ex-Goldman (Brynna Shale, Head of Operations), and 20-year multi-sector quant practice (Daniel Mastropietro, RL/optimization). Technical advisors at Johns Hopkins (systems engineering, risk modeling). Partnerships: AWS, Johns Hopkins University, NVIDIA. Causal-graph IP across four engines — Spirtes (causal discovery), Tarski (formal verification), Pearl (counterfactual / do-calculus), Pareto (criticality / cascade simulation) — with a 5-pillar ΩF (Omega-Fragility) scoring framework configurable per domain.

Full brief: `M-FIN-01`. Contact: junaid@apexanalytica.co.

---

## Footer

APEX ANALYTICA · CONFIDENTIAL · Ω-CRITICAL AI SYSTEMS™
