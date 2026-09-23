/**
 * Demo flow registry — guided, end-to-end analyst walkthroughs.
 *
 * The earlier version of these flows only injected a shock and replayed a
 * cascade, then ended on "the cascade completed in N nodes." That showed
 * propagation but never the *point* of the platform: using the modules to
 * reach a decision. These flows fix that. Each one walks the four modules
 * the way an analyst would and ends on a quantified, actionable insight:
 *
 *   SPIRTES  → here is the causal structure we learned from data
 *   (inject) → run the cascade forward with no intervention; watch it break
 *   PARETO   → the criticality estimators confirm we're approaching collapse
 *   TARSKI   → the cascade path obeys physical law, so it's real, not noise
 *   PEARL    → run the interdiction solver; it names the single best cut
 *   (branch) → re-run the counterfactual with that cut applied
 *   PAYOFF   → before/after: damage reduced X%, +Y days to failure, fewer
 *              nodes breached. The decision, quantified.
 *
 * Flows are still pure data. The behavior — switching module tabs, running
 * the real solver (src/lib/interdiction-engine.ts), branching the timeline
 * (store.branchFromCurrentEpoch) — lives in DemoFlowPlayer, which
 * interprets each step's `module` / `highlightNodeIds` / `actions`. No new
 * analysis math here; every number the payoff shows comes from the real
 * cascade simulator and interdiction solver, not from this file.
 *
 * Adding a new flow:
 *  1. Append to FLOWS below.
 *  2. Use real node IDs from src/lib/graph-data.ts (the player drops any
 *     that don't resolve, with a console warning).
 *  3. Pick `domainIds` so the relevant subgraph loads at start.
 *  4. Order steps so the narrative tracks the actual propagation, and end
 *     on a `payoff: true` step after an `applyAndBranch` action.
 */
import type {
  CausalShock,
  EpochSnapshot,
  ModuleId,
  OmegaStatus,
  TimelineId,
} from "./types";
import type { InterdictionResult } from "./interdiction-engine";

// ─── Step actions ────────────────────────────────────────────────
//
// Declarative imperatives the player executes (in order) when a step
// becomes active. Async ones (replay / solveInterdiction / applyAndBranch)
// are awaited before the step's dwell timer starts, so the narrative never
// races ahead of the engine. Each runs at most once per step, so manual
// Back/Next navigation can't double-inject a shock or re-run a solve.
export type DemoAction =
  | {
      /** Inject a shock into the live graph. */
      type: "shock";
      shock: Omit<CausalShock, "id">;
    }
  | {
      /** Run the baseline cascade (startReplay); awaits epochs landing. */
      type: "replay";
    }
  | {
      /** Jump the replay head to a frame and pause there. */
      type: "gotoEpoch";
      epoch: number | "peak" | "last";
    }
  | {
      /**
       * Run the real interdiction solver over the current graph + shocks.
       * Stores the result so PEARL's panel renders it. `budget` = number of
       * cuts to search for (default 1: the single highest-leverage edge).
       */
      type: "solveInterdiction";
      budget?: number;
      mode?: "edge" | "node" | "both";
    }
  | {
      /**
       * Apply the solver's recommended edge cut(s) and branch the cascade
       * into an intervention timeline (counterfactual re-run from
       * `branchEpoch`). Awaits the intervention epochs landing.
       */
      type: "applyAndBranch";
      branchEpoch?: number;
      maxCuts?: number;
    }
  | {
      /** Switch the visible timeline (baseline ↔ intervention). */
      type: "timeline";
      timeline: TimelineId;
    };

export interface DemoFlowStep {
  /** Dwell time before auto-advancing (0 = wait for the user to click). */
  durationMs: number;
  /** Narrative shown to the user during this step. */
  narrative: string;
  /** Module tab to switch to when the step starts. */
  module?: ModuleId;
  /** Node IDs to spotlight on the canvas for this step. */
  highlightNodeIds?: string[];
  /** Imperative actions to run when the step becomes active. */
  actions?: DemoAction[];
  /**
   * When true, the player renders the computed before/after results card
   * (read live from the store's baseline + intervention epochs and the
   * stored interdiction result) beneath the narrative.
   */
  payoff?: boolean;
}

export interface DemoFlow {
  id: string;
  title: string;
  /** Single-line subtitle shown next to the title in the picker. */
  subtitle: string;
  /** DomainSelector ids whose subgraph must be visible for the flow. */
  domainIds: string[];
  /** Estimated wall-clock duration shown in the picker (e.g. "~90s"). */
  duration: string;
  /** Two-line summary shown in the picker; <= 160 chars. */
  description: string;
  steps: DemoFlowStep[];
}

// ─── Flow 1: Hormuz Closure ──────────────────────────────────────
const FLOW_HORMUZ: DemoFlow = {
  id: "hormuz-closure",
  title: "Hormuz Closure",
  subtitle: "Energy shock → cascade → find the one cut that contains it",
  domainIds: ["energy-systems", "manufacturing", "macro-inflation", "financial-contagion"],
  duration: "~90s",
  description:
    "A Strait of Hormuz closure cascades from oil supply to US inflation to EM solvency. Walk all four modules and let the interdiction solver find the single highest-leverage intervention.",
  steps: [
    {
      module: "spirtes",
      durationMs: 7000,
      narrative:
        "Start in SPIRTES — structure discovery. This DAG wasn't drawn by hand; it was learned from observational data. The highlighted backbone is the path a Gulf energy shock would actually travel: chokepoint throughput into oil terminals into US price indices.",
      highlightNodeIds: ["si_hormuz_throughput", "sa_ras_tanura_terminal", "qe_ras_laffan_port"],
    },
    {
      module: "spirtes",
      durationMs: 9000,
      narrative:
        "Inject the shock: the Strait of Hormuz is interdicted, blocking ~20% of seaborne oil. We run the cascade forward with NO intervention — just the propagation physics on the learned graph. Watch it spread.",
      highlightNodeIds: ["si_hormuz_throughput", "sa_ras_tanura_terminal", "qe_ras_laffan_port"],
      actions: [
        {
          type: "shock",
          shock: {
            name: "Hormuz Closure",
            severity: 0.8,
            category: "geopolitical",
            description: "Strait of Hormuz interdicted; ~20% of global oil transit blocked.",
            targetNodes: ["si_hormuz_throughput", "sa_ras_tanura_terminal", "qe_ras_laffan_port"],
          },
        },
        { type: "replay" },
      ],
    },
    {
      module: "pareto",
      durationMs: 8000,
      narrative:
        "Jump to the peak of the unmitigated cascade and switch to PARETO — the criticality layer. The estimators now read the system at its most fragile: the Ω-buffer has collapsed and status has gone CRITICAL. This is the do-nothing outcome.",
      highlightNodeIds: ["ip_cpi_energy", "ip_fed_funds_target", "fc_fx_pressure", "fc_sovereign_default"],
      actions: [{ type: "gotoEpoch", epoch: "peak" }],
    },
    {
      module: "tarski",
      durationMs: 8000,
      narrative:
        "Before trusting that forecast, TARSKI checks it against physical law — temporal precedence, flow conservation, capacity limits. The cascade route survives the axioms, so it's a real causal path the platform can act on, not a spurious correlation.",
      highlightNodeIds: ["ip_cpi_energy", "ip_ppi_energy", "ip_core_pce_yoy"],
    },
    {
      module: "pearl",
      durationMs: 6000,
      narrative:
        "Now the decision, in PEARL. The interdiction solver searches every single-edge cut, re-simulating the full cascade for each, to find the one removal that most reduces projected damage. Here is what it recommends.",
      highlightNodeIds: ["ip_real_rate_10y", "ip_dxy", "fc_currency_contagion"],
      actions: [{ type: "solveInterdiction", budget: 1, mode: "edge" }],
    },
    {
      module: "pearl",
      durationMs: 7000,
      narrative:
        "Apply that cut and re-run the cascade as a counterfactual from the moment of the shock. This is the intervention timeline: the same shock, the same graph, with one edge severed.",
      highlightNodeIds: ["fc_em_fx_reserves", "fc_brazil_fx", "fc_argentina_fx", "fc_turkey_fx"],
      actions: [{ type: "applyAndBranch", branchEpoch: 1, maxCuts: 1 }],
    },
    {
      module: "pearl",
      durationMs: 0,
      payoff: true,
      narrative:
        "The payoff. One physical chokepoint, traced through US monetary policy to EM solvency — and a single, named intervention that measurably contains it. That is the difference between watching a cascade and deciding what to do about it.",
    },
  ],
};

// ─── Flow 2: China Slowdown ──────────────────────────────────────
const FLOW_CHINA_SLOWDOWN: DemoFlow = {
  id: "china-slowdown",
  title: "China Slowdown",
  subtitle: "Demand shock → US factories → find the leverage point",
  domainIds: ["sovereign-risk", "macro-labor", "macro-inflation", "financial-contagion"],
  duration: "~75s",
  description:
    "Chinese growth slows 2pp and the demand shock reaches US manufacturing and commodity prices. Tour the modules and let the solver isolate the edge that best dampens the transmission.",
  steps: [
    {
      module: "spirtes",
      durationMs: 7000,
      narrative:
        "SPIRTES first: the learned structure linking China's economy to US industrial demand. China is the marginal commodity-demand setter, so its growth node sits upstream of a lot of the graph.",
      highlightNodeIds: ["sr_china_gdp", "sr_china_employment", "sr_china_capital"],
    },
    {
      module: "spirtes",
      durationMs: 9000,
      narrative:
        "Inject the shock: Chinese real GDP prints 2pp below consensus on property deleveraging and export weakness. Run it forward, unmitigated, and watch the demand shock propagate into US manufacturing.",
      highlightNodeIds: ["sr_china_gdp", "ip_ppi_all_commodities", "mi_ism_manufacturing"],
      actions: [
        {
          type: "shock",
          shock: {
            name: "China GDP Shock",
            severity: 0.6,
            category: "financial",
            description: "Chinese GDP growth contracts 2pp; global commodity demand drops.",
            targetNodes: ["sr_china_gdp", "sr_china_capital", "sr_china_employment"],
          },
        },
        { type: "replay" },
      ],
    },
    {
      module: "pareto",
      durationMs: 8000,
      narrative:
        "At the cascade peak, PARETO reads the fragility. A demand-side shock stresses the system differently from an energy shock, and the criticality estimators show where this one bites hardest.",
      highlightNodeIds: ["mi_industrial_production", "ip_cpi_goods", "fc_fx_pressure"],
      actions: [{ type: "gotoEpoch", epoch: "peak" }],
    },
    {
      module: "tarski",
      durationMs: 7000,
      narrative:
        "TARSKI verifies the transmission obeys physical and accounting constraints before we treat it as a real channel — the China-import dependence and the disinflationary impulse both pass.",
      highlightNodeIds: ["ip_cpi_goods", "ip_core_cpi_yoy"],
    },
    {
      module: "pearl",
      durationMs: 6000,
      narrative:
        "PEARL runs the interdiction solver across the transmission graph to find the single edge whose removal most blunts the shock reaching US output.",
      highlightNodeIds: ["mi_ism_manufacturing", "mi_industrial_production"],
      actions: [{ type: "solveInterdiction", budget: 1, mode: "edge" }],
    },
    {
      module: "pearl",
      durationMs: 7000,
      narrative:
        "Apply the recommended cut and re-run the counterfactual from the shock. Same demand shock, one edge severed.",
      highlightNodeIds: ["ip_fed_funds_target", "ip_dxy", "fc_fx_pressure"],
      actions: [{ type: "applyAndBranch", branchEpoch: 1, maxCuts: 1 }],
    },
    {
      module: "pearl",
      durationMs: 0,
      payoff: true,
      narrative:
        "The payoff. A counter-cyclical scenario to Hormuz — a demand shock rather than a supply one — yet the same workflow names a concrete, quantified intervention.",
    },
  ],
};

// ─── Flow 3: Red Sea Cable Cut ───────────────────────────────────
const FLOW_RED_SEA: DemoFlow = {
  id: "red-sea-cable-cut",
  title: "Red Sea Cable Cut",
  subtitle: "One event hits data, trade & defense → contain the worst path",
  domainIds: ["infrastructure", "supply-chain", "defense-isr", "macro-inflation"],
  duration: "~85s",
  description:
    "A coordinated Red Sea cable + shipping attack cascades across digital infrastructure, supply chains, US inflation, and defense readiness at once. Tour the modules and let the solver find the cut that contains the broadest damage.",
  steps: [
    {
      module: "spirtes",
      durationMs: 7000,
      narrative:
        "SPIRTES shows why this scenario is dangerous: the same maritime threat vector touches submarine cables, container shipping, and defense bandwidth simultaneously. One event, multiple substrates, all in one learned graph.",
      highlightNodeIds: ["ic_red_sea_exposure", "ic_aae1", "ic_seamewe5", "ic_flag_europe_asia"],
    },
    {
      module: "spirtes",
      durationMs: 9000,
      narrative:
        "Inject the shock: a multi-cable cut (AAE-1, SEA-ME-WE 5, FLAG) plus Bab el-Mandeb shipping interdiction. Run it forward with no intervention and watch the damage fan out across four domains at once.",
      highlightNodeIds: ["ic_aae1", "ic_seamewe5", "ic_flag_europe_asia", "sc_shipping_cost_index"],
      actions: [
        {
          type: "shock",
          shock: {
            name: "Red Sea Cable + Shipping Crisis",
            severity: 0.85,
            category: "geopolitical",
            description: "Multi-cable cut + Bab el-Mandeb shipping interdiction.",
            targetNodes: [
              "ic_red_sea_exposure",
              "ic_aae1",
              "ic_seamewe5",
              "ic_flag_europe_asia",
              "sc_shipping_cost_index",
            ],
          },
        },
        { type: "replay" },
      ],
    },
    {
      module: "pareto",
      durationMs: 8000,
      narrative:
        "At peak, PARETO reads a system stressed on multiple fronts — latency, reroute pressure, and repair complexity feeding back on each other. This is what a multi-substrate shock looks like at its most critical.",
      highlightNodeIds: ["ic_latency_risk", "ic_reroute_stress", "ic_repair_complexity"],
      actions: [{ type: "gotoEpoch", epoch: "peak" }],
    },
    {
      module: "tarski",
      durationMs: 7000,
      narrative:
        "TARSKI confirms the cross-domain edges are physically admissible — the freight pass-through to goods CPI and the bandwidth contention on the defense side both survive the axiom checks.",
      highlightNodeIds: ["ip_cpi_goods", "ip_ppi_all_commodities", "milsatcom_bw"],
    },
    {
      module: "pearl",
      durationMs: 6000,
      narrative:
        "With damage spread across four domains, PEARL's solver looks for the single cut that contains the most total damage — not the most obvious edge, the most leveraged one.",
      highlightNodeIds: ["leo_constellation", "milsatcom_bw", "ground_terminals"],
      actions: [{ type: "solveInterdiction", budget: 1, mode: "edge" }],
    },
    {
      module: "pearl",
      durationMs: 7000,
      narrative:
        "Apply the cut and re-run the counterfactual. Same coordinated attack, one severed edge.",
      highlightNodeIds: ["killchain_latency", "multiint_fusion", "ip_cpi_goods"],
      actions: [{ type: "applyAndBranch", branchEpoch: 1, maxCuts: 1 }],
    },
    {
      module: "pearl",
      durationMs: 0,
      payoff: true,
      narrative:
        "The payoff. One physical event cascaded across data infrastructure, supply chains, US inflation, and defense readiness — and the same engine that mapped it also named the intervention that best contains it. Causal substrates are general; the decision is specific.",
    },
  ],
};

export const FLOWS: DemoFlow[] = [FLOW_HORMUZ, FLOW_CHINA_SLOWDOWN, FLOW_RED_SEA];

export function getFlowById(id: string): DemoFlow | undefined {
  return FLOWS.find((f) => f.id === id);
}

// ─── Payoff computation ──────────────────────────────────────────
//
// All numbers below are read back from the REAL engine output — the
// cascade simulator's epoch snapshots and the interdiction solver's
// result. Nothing here is hand-tuned for the demo; if the intervention
// barely helps, the card says so honestly.

export interface TimelineSummary {
  /** Ω-buffer at the end of the cascade (0–100; higher = healthier). */
  finalBuffer: number;
  /** Status at the end of the cascade. */
  finalStatus: OmegaStatus;
  /** Worst (lowest) Ω-buffer reached at any epoch. */
  troughBuffer: number;
  /** Peak count of simultaneously activated nodes across all epochs. */
  peakActivated: number;
  /** Projected days-to-failure from the final buffer (omega-engine formula). */
  ttfDays: number;
  /** First epoch index that breached CRITICAL, or null if it never did. */
  epochToCritical: number | null;
}

export interface DemoPayoff {
  interdiction: InterdictionResult | null;
  baseline: TimelineSummary | null;
  intervention: TimelineSummary | null;
  deltas: {
    /** Ω-buffer points recovered at the end (intervention − baseline). */
    bufferGain: number;
    /** Fewer nodes activated at peak (baseline − intervention). */
    fewerActivated: number;
    /** Extra projected days to failure (intervention − baseline). */
    extraDaysToFailure: number;
    /** True when the final status moved to a healthier band. */
    statusImproved: boolean;
  } | null;
}

const STATUS_RANK: Record<OmegaStatus, number> = {
  NOMINAL: 0,
  ELEVATED: 1,
  CRITICAL: 2,
  OMEGA_BREACH: 3,
};

function ttfDaysFromBuffer(buffer: number): number {
  // Mirror of omega-engine's computeDoomsdayState time-to-failure mapping:
  // 365d at full buffer → floored at 3d.
  return Math.max(3, Math.round(365 * (buffer / 100)));
}

function summarizeTimeline(epochs: EpochSnapshot[]): TimelineSummary | null {
  if (epochs.length === 0) return null;
  const last = epochs[epochs.length - 1];
  let troughBuffer = 100;
  let peakActivated = 0;
  let epochToCritical: number | null = null;
  for (let i = 0; i < epochs.length; i++) {
    const e = epochs[i];
    if (e.omegaBuffer < troughBuffer) troughBuffer = e.omegaBuffer;
    let activated = 0;
    for (const ns of Object.values(e.nodeStates)) {
      if (ns.isActivated) activated++;
    }
    if (activated > peakActivated) peakActivated = activated;
    if (epochToCritical === null && e.isCritical) epochToCritical = i;
  }
  return {
    finalBuffer: Math.round(last.omegaBuffer),
    finalStatus: last.omegaStatus,
    troughBuffer: Math.round(troughBuffer),
    peakActivated,
    ttfDays: ttfDaysFromBuffer(last.omegaBuffer),
    epochToCritical,
  };
}

/**
 * Compute the before/after payoff from live engine state. Pass the store's
 * `baselineEpochs`, `interventionEpochs`, and `lastInterdictionResult`.
 */
export function computeDemoPayoff(
  baselineEpochs: EpochSnapshot[],
  interventionEpochs: EpochSnapshot[],
  interdiction: InterdictionResult | null,
): DemoPayoff {
  const baseline = summarizeTimeline(baselineEpochs);
  const intervention = summarizeTimeline(interventionEpochs);

  const deltas =
    baseline && intervention
      ? {
          bufferGain: intervention.finalBuffer - baseline.finalBuffer,
          fewerActivated: baseline.peakActivated - intervention.peakActivated,
          extraDaysToFailure: intervention.ttfDays - baseline.ttfDays,
          statusImproved:
            STATUS_RANK[intervention.finalStatus] < STATUS_RANK[baseline.finalStatus],
        }
      : null;

  return { interdiction, baseline, intervention, deltas };
}
