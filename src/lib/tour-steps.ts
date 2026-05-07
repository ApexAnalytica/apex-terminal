/**
 * Tour step data. Two tracks (analyst-family vs scientist) share a skeleton
 * but carry distinct copy. The rendering shell lives in SpotlightTour.tsx;
 * everything domain-shaped lives here so a copy edit doesn't require
 * touching component code.
 *
 * Track resolution:
 *   activePersona === "scientist"  → "scientist" track
 *   anything else                  → "analyst" track
 *
 * Phases:
 *   "first-run"     — auto-launches on first visit, ~9 steps, lots of "do this"
 *   "deep-dive"     — opt-in from a menu shown after first-run finishes (or
 *                     re-launched from the "?" button), grouped by deepDiveTrack.
 */
import { useApexStore } from "@/stores/useApexStore";

type Store = ReturnType<typeof useApexStore.getState>;

export type TourTrack = "analyst" | "scientist";
export type TourPhase = "first-run" | "deep-dive";
export type DeepDiveTrack = "engines" | "loop" | "customization";

export interface StepCopy {
  title: string;
  description: string;
}

/** "Wait for X to happen before letting the user advance." Predicate is
 *  evaluated against the live useApexStore state on every store change.
 *  When it flips true, the step auto-advances. */
export interface AwaitInteractionConfig {
  /** Short directive shown in the tooltip footer. */
  hint: string;
  /** Reads zustand state, returns true once the user has done the thing. */
  predicate: (s: Store) => boolean;
  /**
   * The element to pulse when the user is taking too long. Defaults to the
   * step's primary targetSelector. For "click any node" we don't have a
   * single element so it can stay null and we'll pulse the whole canvas
   * cutout border instead.
   */
  pulseSelector?: string;
}

export interface TourStep {
  id: string;
  phase: TourPhase;
  /** Only set when phase === "deep-dive". */
  deepDiveTrack?: DeepDiveTrack;
  /** CSS selector for the element being highlighted. null = centered tooltip. */
  targetSelector: string | null;
  /** Optional second highlight + arrow, e.g. tabs + panel. */
  secondaryTargetSelector?: string;
  tooltipPosition: "top" | "bottom" | "left" | "right" | "center";
  /** Copy can be shared across tracks (StepCopy) or per-track. */
  copy: StepCopy | Record<TourTrack, StepCopy>;
  /** Wait for this user interaction before advancing. */
  awaitInteraction?: AwaitInteractionConfig;
  /** Optional side effect when the step opens (e.g. switch active module). */
  onEnter?: () => void;
}

/** Returns the right StepCopy for the active track. */
export function resolveCopy(step: TourStep, track: TourTrack): StepCopy {
  if ("title" in step.copy) return step.copy;
  return step.copy[track];
}

/** Persona → track mapping. Five personas collapse into two tracks because
 *  financial / macro / geopolitical / cross share enough vocab to take the
 *  same tour with shared copy; scientist is a distinct domain that deserves
 *  its own framing. */
export function trackForPersona(persona: string | null | undefined): TourTrack {
  return persona === "scientist" ? "scientist" : "analyst";
}

// ─── First-run track (~9 steps, both tracks) ─────────────────────────────

/** Welcome step copy is exported so non-tour surfaces (e.g. the read-aloud
 *  speaker on the Domain Workspace modal) can show or speak it without
 *  touching the tour state machine. Keep this and the welcome step's `copy`
 *  field in sync. */
export const WELCOME_TITLE = "WELCOME — PICK A PERSONA";
export const WELCOME_DESCRIPTION =
  "Welcome to APEX Analytica MANIFOLD — a causal-inference platform for discovering, verifying, and stress-testing networks. Start by picking one of the five persona pills above: FINANCIAL, MACRO, GEOPOLITICAL, SCIENTIST (Life Sciences), or CROSS-DOMAIN. Each one filters the visible domain cards. Pick a card, confirm, and the tour will continue on the platform. You can relaunch this tour anytime from the “?” in the top-right.";

const FIRST_RUN_STEPS: TourStep[] = [
  {
    id: "welcome-and-domain",
    phase: "first-run",
    targetSelector: '[data-tour="domain-selector-modal"]',
    tooltipPosition: "right",
    copy: {
      title: WELCOME_TITLE,
      description: WELCOME_DESCRIPTION,
    },
  },
  {
    id: "canvas-and-node",
    phase: "first-run",
    targetSelector: '[data-tour="dag-canvas"]',
    tooltipPosition: "right",
    copy: {
      analyst: {
        title: "THE CAUSAL CANVAS",
        description:
          "This is the causal DAG. Node size and color encode Ω-Fragility — hotter is more systemic risk. Solid arrows are directed causal edges; dashed lines are confounded or latent. Drag to orbit, scroll to zoom in 3D. Click any node now to open its inspector.",
      },
      scientist: {
        title: "THE CAUSAL CANVAS",
        description:
          "This is the biological causal DAG. Node size and color encode CRITICALITY — hotter means a mechanism whose failure cascades across metabolic, vascular, and neurological subsystems. Solid arrows are directed causal edges; dashed lines are latent or confounded. Drag to orbit, scroll to zoom. Click any node now to open its inspector.",
      },
    },
    awaitInteraction: {
      hint: "Click any node on the canvas to continue.",
      predicate: (s) => s.selectedNode !== null,
    },
  },
  {
    id: "node-inspector",
    phase: "first-run",
    targetSelector: '[data-tour="module-panel"]',
    tooltipPosition: "left",
    copy: {
      analyst: {
        title: "NODE INSPECTOR — Ω PILLARS",
        description:
          "The inspector centerpiece is a fragility radar pentagon. Composite ΩF (0–10) sits at the center; each vertex is labeled with a pillar letter — I (Irreplaceability), R (Restoration Latency), J (Jurisdictional Hazard), C (Cascade Load), T (Tail Depth) — and its score. Click any vertex letter to drop in that pillar's explanation, detail, and formula inline.",
      },
      scientist: {
        title: "NODE INSPECTOR — CRITICALITY PILLARS",
        description:
          "The inspector centerpiece is a criticality radar pentagon. Composite score (0–10) sits at the center; each vertex carries a pillar letter — I (Irreplaceability of mechanism), R (Restoration latency), J (Regulatory exposure), C (Complication load), T (Outcome tail) — and its score. Click any vertex letter to drop in that pillar's explanation, detail, and formula inline.",
      },
    },
  },
  {
    id: "engines-overview",
    phase: "first-run",
    targetSelector: '[data-tour="module-tabs"]',
    secondaryTargetSelector: '[data-tour="module-panel"]',
    tooltipPosition: "bottom",
    copy: {
      analyst: {
        title: "FOUR ANALYSIS ENGINES",
        description:
          "Four engine tabs drive the right-hand panel. SPIRTES learns causal structure from data. TARSKI verifies edges against physical, regulatory, and heuristic constraints. PEARL runs do-calculus interventions and cascade defense. PARETO tracks tail-risk criticality horizons. Switching tabs only updates the right panel — the graph stays put.",
      },
      scientist: {
        title: "FOUR ANALYSIS ENGINES",
        description:
          "Four engine tabs drive the right-hand panel. The Discovery engine learns causal structure from biological data. The Verification engine audits each edge against physical, regulatory, and clinical-heuristic constraints. The Counterfactual engine runs do-calculus interventions on candidate mechanisms. The Criticality engine tracks per-domain risk estimators (BOCPD, Cox PH, NLME, transfer entropy). Switching tabs only updates the right panel — the graph stays put.",
      },
    },
  },
  {
    id: "engine-pick-tarski",
    phase: "first-run",
    targetSelector: '[data-tour="module-tabs"]',
    secondaryTargetSelector: '[data-tour="module-panel"]',
    tooltipPosition: "bottom",
    copy: {
      analyst: {
        title: "TRY IT — SWITCH TO TARSKI",
        description:
          "Switch to the TARSKI tab now to see edge-constraint verification in action. Once TARSKI is active you can toggle physical/regulatory/heuristic axioms and hit VERIFY — violating edges turn red with clickable proof traces.",
      },
      scientist: {
        title: "TRY IT — SWITCH TO VERIFICATION",
        description:
          "Switch to the TARSKI (verification) tab now to see edge-constraint auditing in action. With TARSKI active you can toggle physical, regulatory, and clinical-heuristic axioms and hit VERIFY — edges that fail an axiom turn red with clickable proof traces (e.g. dose-response monotonicity, mechanism plausibility).",
      },
    },
    awaitInteraction: {
      hint: "Click the TARSKI tab to continue.",
      predicate: (s) => s.activeModule === "tarski",
      pulseSelector: '[data-tour="module-tabs"]',
    },
  },
  {
    id: "time-dial-and-cascade",
    phase: "first-run",
    targetSelector: '[data-tour="risk-flow"]',
    tooltipPosition: "top",
    copy: {
      analyst: {
        title: "TIME DIAL — CASCADE REPLAY",
        description:
          "The timeline scrubber controls cascade replay. After a shock or intervention, drag the dial to scrub epochs and watch nodes activate, edges propagate, and the Ω-buffer deplete. The horizontal cards above show per-node vulnerability, color-coded by severity. Drag the dial back a few epochs now to feel the replay.",
      },
      scientist: {
        title: "TIME DIAL — TRAJECTORY REPLAY",
        description:
          "The timeline scrubber controls mechanism-trajectory replay. After an intervention or natural-history step, drag the dial to scrub time and watch C-peptide, antigen exposure, and downstream phenotypes evolve epoch-by-epoch. The horizontal cards above show per-mechanism risk in real time. Drag the dial back a few epochs now to feel the replay.",
      },
    },
    awaitInteraction: {
      hint: "Drag the time dial back a few epochs to continue.",
      predicate: (s) => s.currentEpoch > 0,
      pulseSelector: '[data-tour="risk-flow"]',
    },
  },
  {
    id: "cd-omega-monitor",
    phase: "first-run",
    targetSelector: '[data-tour="cd-omega"]',
    tooltipPosition: "bottom",
    copy: {
      analyst: {
        title: "CDΩ — DOOMSDAY MONITOR",
        description:
          "The Causal-Distance-Omega monitor in the header is always on. The segmented bar shows buffer depletion (green → amber → red), time-to-failure (T-Nd), regime classification (STABLE / MELT_UP / CRASH / PHASE_TRANSITION / STAGNATION), Dragon-King probability, and active shocks. The bar flashes when the system enters OMEGA_BREACH — no matter which engine tab you're on.",
      },
      scientist: {
        title: "CDΩ — TRAJECTORY MONITOR",
        description:
          "The Causal-Distance-Omega monitor in the header is always on. The segmented bar shows mechanism-buffer depletion (green → amber → red), time-to-event (T-Nd), trajectory regime (STABLE / DETERIORATING / RAPID-DECLINE / RECOVERY), tail probability, and active stressors. The bar flashes on critical-threshold breach regardless of which engine tab you're in.",
      },
    },
  },
  {
    id: "system-copilot",
    phase: "first-run",
    targetSelector: '[data-tour="system-copilot"]',
    tooltipPosition: "right",
    copy: {
      title: "AI SYSTEM COPILOT",
      description:
        "The left panel is your AI copilot. It has full context of the graph, active stressors, engine outputs, and recent interventions — ask questions, request explanations, or run analysis in plain language and it answers with graph-grounded reasoning rather than generic prose. Speaker icon for voice readback, microphone for dictation.",
    },
  },
  {
    id: "first-run-finish",
    phase: "first-run",
    targetSelector: null,
    tooltipPosition: "center",
    copy: {
      title: "YOU'RE SET",
      description:
        "That's the loop: pick a domain → click nodes → switch engines → run interventions → scrub the dial. The “?” button in the top-right relaunches this tour or opens a deeper dive into a specific area. Optional deep-dive tracks below — pick what looks useful or close out and start exploring.",
    },
  },
];

// ─── Deep-dive track (opt-in, accessed from finish-step menu or "?") ─────
//
// One shared copy across tracks for now. Per-track copy here is the next
// layer of polish; this PR establishes the structure.

const DEEP_DIVE_STEPS: TourStep[] = [
  // Engines deep dive
  {
    id: "spirtes-deep",
    phase: "deep-dive",
    deepDiveTrack: "engines",
    targetSelector: '[data-tour="module-panel"]',
    tooltipPosition: "left",
    copy: {
      analyst: {
        title: "SPIRTES — STRUCTURE DISCOVERY",
        description:
          "SPIRTES runs three causal-discovery algorithms in parallel. DCD/NOTEARS for nonlinear structure, PCMCI+ for time-lagged effects across T-2/T-1/T-0 columns, and FCI for hidden-confounder detection — dashed edges with '?' markers mean a latent common cause (sanctions cycle, hidden policy lever, off-record trade flow). The cascade header shows spectral radius λmax — below 1.0 the network is contractive and stable.",
      },
      scientist: {
        title: "SPIRTES — PATHWAY DISCOVERY",
        description:
          "SPIRTES runs three causal-discovery algorithms in parallel against the multi-omic / clinical signal stack. DCD/NOTEARS for nonlinear pathway structure, PCMCI+ for time-lagged effects across T-2/T-1/T-0 visit windows (e.g. C-peptide MMTT, AAB titer, HbA1c), and FCI for hidden-confounder detection — dashed edges with '?' markers mean a latent variable not in the measured panel (an unsampled cytokine, an unmeasured genotype, an unobserved exposure). The cascade header shows spectral radius λmax — below 1.0 the network is contractive and stable.",
      },
    },
    onEnter: () => useApexStore.getState().setActiveModule("spirtes"),
  },
  {
    id: "tarski-deep",
    phase: "deep-dive",
    deepDiveTrack: "engines",
    targetSelector: '[data-tour="module-panel"]',
    tooltipPosition: "left",
    copy: {
      analyst: {
        title: "TARSKI — CONSTRAINT VERIFICATION",
        description:
          "TARSKI audits every edge against domain-aware axioms in three tiers: PHYSICAL (immutable laws — pipeline throughput, cable capacity, vessel transit time), REGULATORY (sanctions, export controls, treaties), and HEURISTIC (anomaly flags). Constraints are auto-ranked by relevance to your active domain. Toggle any axiom, hit VERIFY, and the canvas recolors — violating edges turn red, with clickable proof traces.",
      },
      scientist: {
        title: "TARSKI — BIOLOGICAL CONSTRAINT VERIFICATION",
        description:
          "TARSKI audits every edge against domain-aware axioms in three tiers: PHYSICAL (immutable biology — glucose / insulin / C-peptide stoichiometry, half-lives, mass balance), REGULATORY (FDA accelerated-approval gates, IRB constraints, trial-protocol windows, pediatric pathways), and HEURISTIC (anomaly flags — implausible effect sizes, protocol-impossible timings). Constraints are auto-ranked by relevance to the active domain. Toggle any axiom, hit VERIFY, and the canvas recolors — biologically infeasible edges turn red, with clickable proof traces.",
      },
    },
    onEnter: () => useApexStore.getState().setActiveModule("tarski"),
  },
  {
    id: "pearl-deep",
    phase: "deep-dive",
    deepDiveTrack: "engines",
    targetSelector: '[data-tour="module-panel"]',
    tooltipPosition: "left",
    copy: {
      analyst: {
        title: "PEARL — DO-CALCULUS & CASCADE DEFENSE",
        description:
          "PEARL implements structural interventions. do(X) isolates a node from its causes. SEVER cuts individual edges (amber — functionally removed, physically possible); ABLATE deletes nodes/edges entirely. Below the manual tools, CASCADE DEFENSE runs minimax optimisation to find the cheapest set of edges whose removal maximally reduces downstream damage — adversary picks the worst shock, defender picks the cheapest cut. Automatic Monte Carlo damage forecasts on every recommendation.",
      },
      scientist: {
        title: "PEARL — INTERVENTION & TARGET PRIORITISATION",
        description:
          "PEARL implements structural interventions on the causal graph. do(X) isolates a node from its causes — the foundational operator for asking 'what happens if we directly modulate this mechanism?' SEVER cuts individual edges (amber — functionally blocked, biologically reversible); ABLATE removes nodes / edges entirely. Below the manual tools, INTERVENTION TARGET SEARCH runs minimax optimisation to find the smallest mechanism set whose modulation maximally reduces downstream complication load — implicit adversary is disease progression. Monte Carlo outcome forecasts run on every recommendation.",
      },
    },
    onEnter: () => useApexStore.getState().setActiveModule("pearl"),
  },
  {
    id: "pareto-deep",
    phase: "deep-dive",
    deepDiveTrack: "engines",
    targetSelector: '[data-tour="module-panel"]',
    tooltipPosition: "left",
    copy: {
      analyst: {
        title: "PARETO — CRITICALITY HORIZONS",
        description:
          "PARETO tracks four criticality estimators against the scoped Ω trajectory: CSD (lag-1 autocorrelation rising as λmax → 1), Persistent Homology (β₁ filtration over fragility thresholds), LPPLS (Sornette super-exponential + log-periodic crash), and BOCPD (Bayesian online change-point detection). Each card carries a T-N countdown, observed-vs-model trace, formula, live assessment, and an F·E·G·S·M relevance breakdown with bootstrap ± band so you can see *why* a model scores the way it does.",
      },
      scientist: {
        title: "PARETO — REGIME-SHIFT DETECTION",
        description:
          "PARETO tracks four regime-shift estimators against the scoped CRITICALITY trajectory: CSD (slowing recovery as the system loses resilience — honeymoon-end, tipping-point precursor), Persistent Homology (β₁ holes across fragility thresholds — disconnected pathway clusters), LPPLS (super-exponential growth with log-periodic structure — runaway dynamics), BOCPD (Bayesian change-point posterior — abrupt regime transitions on CGM, C-peptide, AAB titer). Each card carries a T-N countdown, observed-vs-model trace, formula, live assessment, and an F·E·G·S·M relevance breakdown with bootstrap ± band so you can see *why* a model scores the way it does.",
      },
    },
    onEnter: () => useApexStore.getState().setActiveModule("pareto"),
  },

  // Analysis loop
  {
    id: "shock-injection",
    phase: "deep-dive",
    deepDiveTrack: "loop",
    targetSelector: '[data-tour="module-panel"]',
    tooltipPosition: "left",
    copy: {
      title: "SHOCK / STRESSOR INJECTION",
      description:
        "Under the criticality cards, the Scenario Injector lets you depress the buffer by injecting shocks at any node. Click a vertex on the canvas to inject at that point — the shock depletes the buffer according to severity and propagates through the cascade. The preset library is empty by default; supply your own scenario set via the API, the import path, or a profile-scoped catalog when you need recurring stressors.",
    },
    onEnter: () => useApexStore.getState().setActiveModule("pareto"),
  },
  {
    id: "cascade-defense",
    phase: "deep-dive",
    deepDiveTrack: "loop",
    targetSelector: '[data-tour="module-panel"]',
    tooltipPosition: "left",
    copy: {
      analyst: {
        title: "CASCADE DEFENSE — AUTO-INTERDICTION",
        description:
          "When an attacker-defender min-cut is solvable, CASCADE DEFENSE proposes the cheapest edge set whose removal maximally reduces downstream damage, with explicit SEVER / ABLATE buttons per recommended cut. When the min-cut isn't solvable, the panel falls back to a structural-vulnerability ranking. Every recommendation auto-triggers a Monte Carlo forecast so you see the expected damage distribution before committing.",
      },
      scientist: {
        title: "INTERVENTION TARGET SEARCH — AUTOMATED RANKING",
        description:
          "When a target-set optimisation problem is solvable, this panel proposes the smallest mechanism set whose modulation maximally reduces downstream complication load — implicit adversary is disease progression. Each recommendation comes with explicit SEVER / ABLATE buttons (functionally block vs. structurally remove) and an automatic Monte Carlo outcome forecast so you see the expected effect distribution before committing. When the optimisation isn't solvable, the panel falls back to a structural-vulnerability ranking.",
      },
    },
    onEnter: () => useApexStore.getState().setActiveModule("pearl"),
  },
  {
    id: "compute-with-claude",
    phase: "deep-dive",
    deepDiveTrack: "loop",
    targetSelector: '[data-tour="action-buttons"]',
    tooltipPosition: "right",
    copy: {
      title: "COMPUTE WITH CLAUDE",
      description:
        "COMPUTE WITH CLAUDE generates a System State Snapshot — a structured digest of nodes, edges, engine outputs, and criticality metrics. Claude does the heavy reasoning; the copilot uses that snapshot as context for follow-up questions. If no Claude key is configured, a local snapshot is computed from graph structure instead. Snapshot status appears as a badge in the copilot header.",
    },
  },

  // Customization
  {
    id: "view-modes",
    phase: "deep-dive",
    deepDiveTrack: "customization",
    targetSelector: '[data-tour="dag-canvas"]',
    tooltipPosition: "top",
    copy: {
      title: "3D / 2D / MAP VIEWS",
      description:
        "Top-right of the canvas: three view-mode buttons. 3D (WebGL force-directed), 2D (flat React Flow with animated causal flow), and MAP (geographic projection on MapLibre, for domains with real-world coordinates). All three stay mounted to preserve WebGL context — flip between them without losing state.",
    },
  },
  {
    id: "text-size",
    phase: "deep-dive",
    deepDiveTrack: "customization",
    targetSelector: '[data-tour="text-size-toggle"]',
    tooltipPosition: "bottom",
    copy: {
      title: "TEXT SIZE (S / M / L)",
      description:
        "Use the S / M / L toggle in the header to scale the readable text up or down. Layout, canvas, and icons stay put — only typography rescales, so dense panels stay legible without the graph reflowing. Persists across sessions and is applied before the page renders so there's no flash.",
    },
  },
  {
    id: "import",
    phase: "deep-dive",
    deepDiveTrack: "customization",
    targetSelector: '[data-tour="import-button"]',
    tooltipPosition: "bottom",
    copy: {
      title: "IMPORT YOUR OWN DATA",
      description:
        "Bring your own graph. IMPORT accepts CSV, JSON, or adjacency matrices; the platform auto-detects format and maps columns into the fragility framework. All four engines work on imported graphs exactly as they do on built-in domains. Multiple datasets can coexist and merge via cross-domain edges.",
    },
  },
  {
    id: "feedback",
    phase: "deep-dive",
    deepDiveTrack: "customization",
    targetSelector: '[data-tour="feedback-widget"]',
    tooltipPosition: "left",
    copy: {
      title: "FEEDBACK & FEATURE REQUESTS",
      description:
        "The floating pill in the bottom-right corner is your direct line to the team. File bugs, request features, or ask for new datasets — each category routes into our triage pipeline and becomes a tracked GitHub issue. Approved feature requests can be auto-implemented by an AI agent and shipped back as a PR. Use it liberally.",
    },
  },
];

export const TOUR_STEPS: TourStep[] = [...FIRST_RUN_STEPS, ...DEEP_DIVE_STEPS];

export const FIRST_RUN_IDS = FIRST_RUN_STEPS.map((s) => s.id);

export const DEEP_DIVE_TRACKS: { id: DeepDiveTrack; label: string; desc: string }[] = [
  { id: "engines", label: "ENGINES", desc: "SPIRTES · TARSKI · PEARL · PARETO" },
  { id: "loop", label: "ANALYSIS LOOP", desc: "Shocks · Cascade Defense · Compute" },
  { id: "customization", label: "CUSTOMIZATION", desc: "Views · Text · Import · Feedback" },
];

/** Per-step padding override on the cutout. The welcome modal already has
 *  its own bg-black/70 backdrop-blur, so any extra padding around the
 *  cutout exposes blurred dim and washes the modal out. */
export const STEP_PADDING: Record<string, number> = {
  "welcome-and-domain": 0,
};

export const DEFAULT_PADDING = 8;
