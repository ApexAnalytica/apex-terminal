# Manifold for Type 1 Diabetes
### Research-partnership one-pager · draft

---

## 1. The clinical problem

Type 1 Diabetes has a years-long pre-clinical prodrome:

- **Stage 1** — ≥2 persistent islet autoantibodies, normoglycemia
- **Stage 2** — dysglycemia (abnormal OGTT), still asymptomatic
- **Stage 3** — clinical onset (~100% 10-year risk conditional on Stage 1)

Current risk stratification tools (TrialNet DPTRS, Index60, M120) are good at **population-level** survival curves but miss **individual-trajectory inflection points** — the window where a Stage-2-appropriate intervention (teplizumab-class anti-CD3, low-dose ATG, experimental antigen-specific therapies) has maximal benefit.

What today's tools do not do well:
- Treat autoantibody seroconversion as richer than a binary count.
- Use **continuous glucose variability** *before* dysglycemia as signal.
- Encode **causal structure** between HLA haplotype, viral exposure (enterovirus / Coxsackie B), gut microbiome, and metabolic load in a single unified model rather than separate correlation studies.

Teplizumab's 2022 approval made this window *actionable*. Every month of better per-patient stratification is intervention-window bought.

---

## 2. What Manifold brings

Manifold is a causal-intelligence platform for detecting structural fragility and regime transitions in complex multi-signal systems. Three engine capabilities anchor the T1D configuration:

1. **Causal discovery (Spirtes / PC algorithm) on multi-omic cohorts.** Replaces ad-hoc correlation-heap practice in GWAS × microbiome × virome × metabolomic integration with a principled conditional-independence-based DAG.
2. **Pluggable criticality estimators feeding a composite fragility score (ΩF).** Estimators are configured to the domain's dynamics; the composite is the stable integration layer.
3. **Pearl do-calculus / interdiction.** Frame therapy selection as max-attenuation intervention on the inferred causal graph — directly parallel to teplizumab-style "delay onset" trial design.

---

## 3. ΩF pillar mapping — T1D physiology

| ΩF pillar | T1D reading |
|---|---|
| **I — Interaction** | Autoantibody-to-autoantibody coupling (IAA, GADA, IA-2A, ZnT8); HLA × viral-trigger epistasis |
| **R — Reserve** | β-cell functional mass proxied by C-peptide AUC on MMTT; glucose-response amplitude |
| **J — Junction** | Immune–metabolic subsystem coupling (transfer entropy between immune-cell subsets and glycemic variability) |
| **C — Cascade** | Autoreactive T-cell clonal expansion; epitope spreading rate |
| **T — Temporal** | Hazard of next stage transition given current trajectory |

---

## 4. Criticality estimator triad for T1D

T1D pre-clinical progression is a staged Markov / survival process with autoreactive positive feedback. The criticality layer is configured accordingly:

| Estimator | What it catches | Pillar feed |
|---|---|---|
| **Dynamic Network Biomarkers** (Chen et al. 2012) | Leading-subset variance + correlation spike *before* overt stage transition — designed for biological regime shifts | I, T |
| **Bayesian online change-point** (BOCPD) | Discrete Stage 1→2→3 transition timing with calibrated uncertainty | T, R |
| **Deep survival with time-varying covariates** (DeepSurv / RNN-Surv) | Personalized hazard given longitudinal autoantibody + CGM + metabolic signals — the production-grade baseline to beat | C, T |

Complementary estimators available in the same layer for v2:
- **Variance-based early-warning signals** on rolling CGM windows once continuous glucose data is onboarded — feeds Temporal.
- **Persistent homology** on longitudinal multi-omic point clouds for topological regime detection across integrated immune-metabolic trajectories — feeds Interaction and Cascade.

---

## 5. Minimum viable collaboration (v1)

Smallest slice that produces something a principal investigator will take seriously.

**Dataset.** TEDDY retrospective cohort slice — ~8,000 children, 15 years of serial autoantibody + HLA + limited metabolomic + environmental exposure data. TrialNet PTP as secondary validation.

**Access path.** NIDDK Central Repository DUA, co-sponsored with a TEDDY-affiliated PI.

**Deliverable.** Per-subject ΩF trajectory with DNB + change-point + deep-survival agreement, benchmarked against DPTRS on Stage-3 prediction at 1 / 3 / 5-year horizons.

**Success criteria.**
- AUC lift ≥ 0.05 over DPTRS on matched subjects.
- Calibration improvement (Brier score, calibration-in-the-large).
- Human-interpretable ΩF-pillar decomposition per subject (i.e. not a black box).

**Timeline.** 10–12 weeks from data access.

**Out of scope v1** (reserved for v2 / prospective arm): live CGM, gut microbiome sequencing, virome, fecal metabolomics.

---

## 6. Why this, why now

- **Teplizumab is approved.** The pre-clinical window is actionable, not academic. Patients in Stage 2 are candidates today.
- **TEDDY is mature.** Data access pathways are established; the analytic community is sophisticated and receptive.
- **Funding lines are open.** JDRF Prediction & Prevention, Helmsley Charitable Trust T1D program, NIH NIDDK SBIR/STTR, and the Breakthrough T1D (JDRF) Industry Discovery & Development Partnerships track all have active RFPs in this space.
- **The platform is ready.** Manifold's causal, criticality, and interdiction engines are production-grade; configuring them for the T1D domain is bounded, well-scoped work.

---

## 7. Ask

Partnership with a TEDDY-affiliated PI (or equivalent cohort steward — TrialNet, DiPiS, BabyDiab) for:

1. Retrospective data access under their existing Data Use Agreement.
2. Clinical co-authorship on the benchmark paper.
3. Co-application to JDRF / Helmsley / NIH for the v2 prospective arm.

In exchange, Apex Analytica brings the causal-inference engine, the ΩF framework, and the software team. Apex retains commercial rights to the platform; research IP from the joint work is shared per standard academic-industry terms.

---

## 8. Open questions (for internal discussion before pitching)

- **IRB / HIPAA posture.** TEDDY data is de-identified but still regulated. Does Manifold's current deployment posture satisfy a federal-data DUA, or do we need a dedicated compliance envelope?
- **DNB vs. transfer-entropy.** Both feed the Interaction pillar; empirical fit on TEDDY will tell us which to canonicalize. Do not commit to one in the pitch.
- **CGM availability.** Retrospective TEDDY does not have CGM; this limits v1 to autoantibody + limited metabolomic. Does that weaken the story enough to delay the pitch until we have a prospective CGM cohort lined up?
- **Clinical champion.** No deal without one. Who on Jeremy's network is the closest path to a TEDDY PI?

---

*Draft — iterate before external circulation.*
