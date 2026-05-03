/**
 * Demo flow registry — guided cause-and-effect tours through the causal
 * graph. Each flow scripts a sequence of shock injections + narrative
 * overlays so a first-time visitor (VC, analyst, prospective customer)
 * sees end-to-end propagation across the graph in 60–90 seconds without
 * having to know which buttons to press.
 *
 * Flows are pure data: no UI, no behavior. The DemoFlowPlayer component
 * walks the steps, calls into useApexStore (addShock / removeShock /
 * setSelectedDomains), and renders the narrative.
 *
 * Adding a new flow:
 *  1. Append to FLOWS below.
 *  2. Use real node IDs from src/lib/graph-data.ts (or athena-graph-data
 *     for defense). The player asserts a step's targetNodes resolve
 *     before injecting; missing IDs are dropped with a console warning.
 *  3. Pick `domainIds` so the relevant subgraph is visible at start.
 *  4. Order steps so the narrative tracks the actual graph propagation.
 *
 * No new propagation math here — the existing cascade simulator
 * (src/lib/cascade-simulator.ts) handles all the Δ-spreading once the
 * shock lands. This module just orchestrates the demo.
 */
import type { CausalShock } from "./types";

export interface DemoFlowStep {
  /** Pre-step delay before injecting / narrating. */
  delayMs?: number;
  /** Dwell time on this step before auto-advancing (0 = wait for click). */
  durationMs: number;
  /** Narrative shown to the user during this step. */
  narrative: string;
  /**
   * Shock injected when the step starts. Omit for narrative-only steps
   * (e.g. the opening "set the stage" beat). The player attaches a
   * `demo-${flow.id}-${step_index}` id automatically so cleanup on flow
   * exit removes only this flow's shocks.
   */
  shock?: Omit<CausalShock, "id">;
  /**
   * Node IDs to spotlight visually for this step. The player passes
   * these to the canvas highlight layer. Independent of the shock's
   * `targetNodes` so a step can highlight downstream nodes that
   * haven't been shocked yet.
   */
  highlightNodeIds?: string[];
}

export interface DemoFlow {
  id: string;
  title: string;
  /** Single-line subtitle shown next to the title in the picker. */
  subtitle: string;
  /**
   * DomainSelector ids that need to be selected for the relevant
   * subgraph to be visible. The player auto-selects these when the
   * flow starts and restores the user's prior selection on exit.
   */
  domainIds: string[];
  /** Estimated wall-clock duration shown in the picker (e.g. "~75s"). */
  duration: string;
  /** Two-line summary shown in the picker; <= 160 chars. */
  description: string;
  steps: DemoFlowStep[];
}

// ─── Flow 1: Hormuz Closure ──────────────────────────────────────
const FLOW_HORMUZ: DemoFlow = {
  id: "hormuz-closure",
  title: "Hormuz Closure",
  subtitle: "Energy supply shock → US inflation → Fed reaction → EM stress",
  domainIds: ["energy-systems", "manufacturing", "macro-inflation", "financial-contagion"],
  duration: "~75s",
  description:
    "Iran-aligned forces interdict Strait of Hormuz transit. Watch a physical chokepoint shock cascade through global oil supply, US CPI energy, the Fed reaction function, the dollar, and emerging-market currency stress.",
  steps: [
    {
      durationMs: 5000,
      narrative:
        "Iran-aligned forces signal capability to interdict Strait of Hormuz transit. The Strait carries ~20% of global oil and ~30% of seaborne LNG. Markets price a tail-risk premium.",
      highlightNodeIds: ["qf_strait_of_hormuz", "mn_strait_of_hormuz"],
    },
    {
      durationMs: 7000,
      narrative:
        "Closure declared. Tankers turn back. Insurance rates 5x. Brent jumps in the first session.",
      shock: {
        name: "Hormuz Closure",
        severity: 0.8,
        category: "geopolitical",
        description: "Strait of Hormuz interdicted; 20% of global oil transit blocked.",
        targetNodes: ["qf_strait_of_hormuz", "mn_strait_of_hormuz", "sa_ras_tanura_terminal", "qe_ras_laffan_port"],
      },
      highlightNodeIds: ["qf_strait_of_hormuz", "sa_ras_tanura_terminal", "qe_ras_laffan_port"],
    },
    {
      durationMs: 7000,
      narrative:
        "Empirical channel: Brent → IMF Fuel Energy long-run β = 0.918 (n=303, OOS R² = 0.97). Higher crude transmits to CPI energy within one print.",
      highlightNodeIds: ["ip_cpi_energy", "ip_ppi_energy"],
    },
    {
      durationMs: 6000,
      narrative:
        "Headline CPI prints hot. Core PCE follows. The Fed's reaction function pushes the funds-rate path higher.",
      highlightNodeIds: ["ip_cpi_headline_yoy", "ip_core_pce_yoy", "ip_fed_funds_target"],
    },
    {
      durationMs: 6000,
      narrative:
        "Higher US real rates pull capital into dollar assets. DXY strengthens. The Fed → real-rate → DXY chain (PR #190) is doing the work.",
      highlightNodeIds: ["ip_real_rate_10y", "ip_dxy"],
    },
    {
      durationMs: 7000,
      narrative:
        "EM corporates with USD-denominated debt face higher rollover costs (Bruno-Shin 2015 channel). EM currencies depreciate in correlated fashion.",
      highlightNodeIds: ["fc_fx_pressure", "fc_currency_contagion", "fc_em_fx_reserves"],
    },
    {
      durationMs: 0,
      narrative:
        "Sovereign-default probabilities re-price across fragile EMs. The full cascade — physical chokepoint to US monetary policy to EM solvency — completed in seven nodes. Click anywhere to end.",
      highlightNodeIds: ["fc_sovereign_default", "fc_brazil_fx", "fc_argentina_fx", "fc_turkey_fx"],
    },
  ],
};

// ─── Flow 2: China Slowdown ──────────────────────────────────────
const FLOW_CHINA_SLOWDOWN: DemoFlow = {
  id: "china-slowdown",
  title: "China Slowdown",
  subtitle: "Sovereign growth shock → US factory PMI → commodity prices → Fed easing room",
  domainIds: ["sovereign-risk", "macro-labor", "macro-inflation", "financial-contagion"],
  duration: "~60s",
  description:
    "Chinese GDP growth slows 2pp on property + export weakness. Watch the demand shock propagate to US ISM manufacturing, depress global commodity prices, and create monetary-policy room for the Fed.",
  steps: [
    {
      durationMs: 5000,
      narrative:
        "Chinese real GDP growth prints 2pp below consensus. Property-sector deleveraging + export-orders contraction. China is the marginal commodity demand setter.",
      highlightNodeIds: ["sr_china_gdp", "sr_china_employment"],
    },
    {
      durationMs: 7000,
      narrative:
        "Demand shock injected. Channel: IMF China Iron-Ore → Industrial Inputs long-run β = 0.193 (n=446) — the empirical fit from PR #129.",
      shock: {
        name: "China GDP Shock",
        severity: 0.6,
        category: "financial",
        description: "Chinese GDP growth contracts 2pp; commodity demand drops.",
        targetNodes: ["sr_china_gdp", "sr_china_capital", "sr_china_employment"],
      },
      highlightNodeIds: ["sr_china_gdp", "ip_ppi_all_commodities"],
    },
    {
      durationMs: 6000,
      narrative:
        "US ISM Manufacturing PMI sub-50 reading. China-import-dependent firms cut new orders. mi_ism_manufacturing leads industrial production by ~1 month.",
      highlightNodeIds: ["mi_ism_manufacturing", "mi_industrial_production"],
    },
    {
      durationMs: 6000,
      narrative:
        "Goods CPI cools as imported-good prices fall and demand softens. Disinflationary impulse hits the Fed's preferred-gauge denominator.",
      highlightNodeIds: ["ip_cpi_goods", "ip_core_cpi_yoy"],
    },
    {
      durationMs: 0,
      narrative:
        "Fed has room to ease. Rate-cut path repriced lower. DXY weakens. EM FX gets a tailwind. Counter-cyclical to the Hormuz scenario. Click to end.",
      highlightNodeIds: ["ip_fed_funds_target", "ip_dxy", "fc_fx_pressure"],
    },
  ],
};

// ─── Flow 3: Red Sea Cable Cut ───────────────────────────────────
const FLOW_RED_SEA: DemoFlow = {
  id: "red-sea-cable-cut",
  title: "Red Sea Cable Cut",
  subtitle: "Maritime threat → undersea cables + shipping + defense readiness",
  domainIds: ["infrastructure", "supply-chain", "defense-isr", "macro-inflation"],
  duration: "~70s",
  description:
    "Coordinated attack on multiple Red Sea cables coincides with Bab el-Mandeb shipping disruption. Watch the threat vector cascade across digital infrastructure, supply chains, and defense readiness simultaneously.",
  steps: [
    {
      durationMs: 5000,
      narrative:
        "Houthi forces signal threats to Red Sea shipping AND submarine cable infrastructure simultaneously. The same threat vector hits both maritime and digital chokepoints.",
      highlightNodeIds: ["ic_red_sea_exposure", "qf_strait_of_hormuz"],
    },
    {
      durationMs: 7000,
      narrative:
        "Multi-cable cut event. AAE-1, SEA-ME-WE 5, FLAG impacted. Container shipping reroutes via Cape — adding 10-14 days and 50-150ms latency.",
      shock: {
        name: "Red Sea Cable + Shipping Crisis",
        severity: 0.85,
        category: "geopolitical",
        description: "Multi-cable cut + Bab el-Mandeb shipping interdiction.",
        targetNodes: ["ic_red_sea_exposure", "ic_aae1", "ic_seamewe5", "ic_flag_europe_asia", "sc_shipping_cost_index"],
      },
      highlightNodeIds: ["ic_aae1", "ic_seamewe5", "ic_flag_europe_asia", "sc_shipping_cost_index"],
    },
    {
      durationMs: 6000,
      narrative:
        "Backbone latency spikes; financial settlement (SWIFT) and HFT face millisecond degradation. Reroute stress + repair-complexity feedback loop kicks in.",
      highlightNodeIds: ["ic_latency_risk", "ic_reroute_stress", "ic_repair_complexity"],
    },
    {
      durationMs: 6000,
      narrative:
        "Goods CPI starts pricing the freight pass-through. FRED CASSFI → PPI all-commodities elasticity (PR #192) gives the magnitude when FRED is reachable.",
      highlightNodeIds: ["ip_cpi_goods", "ip_ppi_all_commodities"],
    },
    {
      durationMs: 7000,
      narrative:
        "Defense side: cable loss forces traffic onto MILSATCOM and LEO constellation, contesting protected bandwidth. Bridge edges from PR #193 carry the signal.",
      highlightNodeIds: ["leo_constellation", "milsatcom_bw", "ground_terminals"],
    },
    {
      durationMs: 0,
      narrative:
        "One physical event has cascaded across data infrastructure, supply chain, US inflation, AND defense readiness — all visible in a single graph. The thesis: causal substrates are general; domain framings are specific. Click to end.",
      highlightNodeIds: ["killchain_latency", "multiint_fusion", "ip_cpi_goods"],
    },
  ],
};

export const FLOWS: DemoFlow[] = [FLOW_HORMUZ, FLOW_CHINA_SLOWDOWN, FLOW_RED_SEA];

export function getFlowById(id: string): DemoFlow | undefined {
  return FLOWS.find((f) => f.id === id);
}
