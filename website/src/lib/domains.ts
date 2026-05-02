/**
 * Per-domain content for the marketing site.
 *
 * Each domain has the same shape so the dynamic page route at
 * /domains/[slug] can render any of them. The mosaic-style page is
 * structured around: PROBLEM → HOW MANIFOLD MAPS IT → PERSONAS →
 * ENGINES → SIGNALS → SAMPLE READOUT.
 *
 * The intent is problem-first: who's hurting, and what changes when
 * Manifold is in the loop. Engines and pillars come AFTER the user
 * sees themselves in the persona list.
 */

export type Color = "cyan" | "amber" | "purple" | "orange" | "green" | "red" | "magenta";

export type Persona = {
  /** Who the reader is (job title, org type). */
  title: string;
  /** What they walk in worried about. */
  pain: string;
  /** What Manifold gives them. */
  gain: string;
};

export type DomainContent = {
  slug: string;
  /** Display name as it appears in headers and tiles. */
  name: string;
  /** One-line tagline shown under the H1. */
  tagline: string;
  /** Section color throughout the page. */
  color: Color;
  /** The pain the reader walks in with. 2–4 short paragraphs. */
  problem: string[];
  /** How Manifold's causal graph models this domain. 1–3 short paragraphs. */
  mapping: string[];
  /** Personas who get the most value. 2–4 entries. */
  personas: Persona[];
  /** Engines most relevant to this domain. */
  engines: Array<"SPIRTES" | "TARSKI" | "PEARL" | "PARETO">;
  /** Pillars most relevant to this domain. */
  pillars: Array<"I" | "R" | "J" | "C" | "T">;
  /** Concrete data signals Manifold ingests for this domain. */
  signals: string[];
  /** A representative example node with its ΩF score breakdown. */
  sampleNode?: {
    label: string;
    omegaF: number;
    breakdown: Partial<Record<"I" | "R" | "J" | "C" | "T", number>>;
    note: string;
  };
};

const PILLAR_FOR_ENGINE = {
  SPIRTES: "C",
  TARSKI: "J",
  PEARL: "I + R",
  PARETO: "T",
} as const;

export const ENGINE_PILLAR_LABEL = PILLAR_FOR_ENGINE;

/**
 * Stub helper — used for domains that haven't been written yet. Keeps
 * the page renderable so all 7 // DOMAINS tiles link somewhere real.
 */
function stub(args: {
  slug: string;
  name: string;
  color: Color;
  tagline: string;
  problemHint: string;
}): DomainContent {
  return {
    slug: args.slug,
    name: args.name,
    color: args.color,
    tagline: args.tagline,
    problem: [
      `${args.problemHint} The ${args.name.toLowerCase()} domain page is being written — full problem framing, persona list, and sample readouts are coming next.`,
      "If you have specific scenarios you want covered first, tell us and we'll prioritize.",
    ],
    mapping: [
      `Manifold treats ${args.name.toLowerCase()} as a causal graph: each node is an entity that produces or consumes capability, each edge encodes a real dependency. Pillar scores (I, R, J, C, T) and per-node ΩF are computed at import.`,
    ],
    personas: [],
    engines: ["SPIRTES", "PARETO"],
    pillars: ["I", "C", "T"],
    signals: [],
  };
}

export const DOMAINS: Record<string, DomainContent> = {
  manufacturing: {
    slug: "manufacturing",
    name: "Manufacturing",
    color: "cyan",
    tagline: "Single-source nodes, certification cliffs, and the cascade nobody priced.",
    problem: [
      "Modern manufacturing graphs are riddled with single-source nodes that don't show up on a balance sheet. A 5nm fab, a single-vendor photoresist, a sole-source rare-earth refiner — the system runs fine until one of them stops, and then it doesn't.",
      "The hard part isn't enumerating suppliers. It's pricing the substitution gap: how long it actually takes to qualify an alternate part, recover capacity, and re-baseline the BOM. Most ERP and procurement systems can answer the first question and not the second.",
      "When a node fails, the cascade isn't linear. Tier-2 vendors fall first, then a wave of contract amendments and force-majeure declarations, then the customer-facing impact. A reinsurer or a CFO needs to see that whole arc before the first headline lands.",
    ],
    mapping: [
      "Manifold treats the manufacturing graph as a directed causal network: foundries, materials, packaging, logistics, certification regimes, and end-products are all nodes; edges encode physical, contractual, or jurisdictional dependency.",
      "Pillar scores light up the failure modes: I (Irreplaceability) catches the no-substitute nodes, R (Restoration Latency) prices the recovery clock, C (Cascade Load) measures the downstream footprint, T (Tail Depth) quantifies the bad case.",
      "PEARL runs counterfactuals (what if this fab goes dark for 90 days?), PARETO simulates cascade dynamics, and SPIRTES discovers structure you didn't know existed in the production data.",
    ],
    personas: [
      {
        title: "VP Supply Chain · Semiconductor OEM",
        pain: "Knows the named single-source risks. Doesn't have a tool that estimates the *recovery cost* of each one in dollars and weeks, or that surfaces the unnamed second-tier ones.",
        gain: "Per-node ΩF score, ranked by Cascade Load. Counterfactual recovery time on every critical path. A weekly report you can hand to the audit committee.",
      },
      {
        title: "CFO · Multi-Site Manufacturer",
        pain: "Operational risk is footnoted in the 10-K but not modeled. When a node fails, the loss is computed after the fact.",
        gain: "ΩSF (system fragility) and ΩSX (system exposure) as steady metrics. Tail-depth simulation puts a defensible number on the worst-case scenario, before it happens.",
      },
      {
        title: "Reinsurance Underwriter · Industrial Lines",
        pain: "Pricing manufacturing-cascade exposure across portfolios is a black box. Most cat models stop at physical assets and ignore the network.",
        gain: "Counterfactual cascade simulation across the insured's full supplier graph. Defensible loss distribution that prices network risk, not just plant risk.",
      },
      {
        title: "Government · Industrial Policy Office",
        pain: "Needs to identify which nodes in the national manufacturing base are decisive — not which are biggest.",
        gain: "Irreplaceability + Cascade Load ranking on the national graph, configurable per strategic objective.",
      },
    ],
    engines: ["SPIRTES", "PEARL", "PARETO"],
    pillars: ["I", "R", "C", "T"],
    signals: [
      "Bill-of-materials and supplier hierarchies",
      "Production capacity by node and region",
      "Lead-time and qualification-window data",
      "Trade and customs flow data",
      "Sanctions, export-control, and certification regimes",
    ],
    sampleNode: {
      label: "FAB · TSMC ARIZONA-1",
      omegaF: 7.42,
      breakdown: { I: 9.1, R: 8.4, J: 7.8, C: 7.2, T: 4.6 },
      note: "5nm capacity for AAPL, NVDA, AMD, QCOM. 37 downstream nodes fail with it.",
    },
  },

  infrastructure: stub({
    slug: "infrastructure",
    name: "Infrastructure",
    color: "purple",
    tagline: "Power, water, ports, telecom, and rail — where one node is the system.",
    problemHint:
      "Infrastructure cascades follow physics, not procurement. A single substation, a single cable landing, a single rail interchange can take a region offline.",
  }),

  economic: stub({
    slug: "economic",
    name: "Economic",
    color: "amber",
    tagline: "Trade flows, sectoral GDP, and the exposure hidden in macro aggregates.",
    problemHint:
      "Macro aggregates smear over the structural fragility underneath. A sector-weighted view masks which nodes carry the load.",
  }),

  finance: stub({
    slug: "finance",
    name: "Finance",
    color: "orange",
    tagline: "Banks, settlement, and sovereign credit — interconnection as a risk axis.",
    problemHint:
      "Banking and settlement networks survive on assumed liquidity that disappears under stress. Bilateral exposure data is incomplete; structural exposure isn't priced.",
  }),

  energy: stub({
    slug: "energy",
    name: "Energy",
    color: "green",
    tagline: "Grid, oil, gas, and transition tech — the supply curve is a graph.",
    problemHint:
      "Energy systems span physical infrastructure, commodity flows, and policy regimes. The fragility points sit at the seams.",
  }),

  geopolitical: stub({
    slug: "geopolitical",
    name: "Geopolitical",
    color: "red",
    tagline: "Sanctions, conflict, and export controls — fragility under regime change.",
    problemHint:
      "Geopolitical risk is usually narrative, rarely structural. A single export-control update can re-price a whole supply chain overnight.",
  }),

  science: stub({
    slug: "science",
    name: "Science",
    color: "magenta",
    tagline: "Research infra, instrumentation, and talent — discovery as a fragile network.",
    problemHint:
      "Scientific output depends on a thin layer of unique instruments, facilities, and people. Most of these dependencies are invisible to funders and program managers.",
  }),
};

export const DOMAIN_SLUGS = Object.keys(DOMAINS);
