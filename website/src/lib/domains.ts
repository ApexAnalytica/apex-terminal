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

export type Color = "cyan" | "amber" | "purple" | "orange" | "green" | "red" | "magenta" | "blue";

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

  infrastructure: {
    slug: "infrastructure",
    name: "Infrastructure",
    color: "purple",
    tagline: "Power, water, ports, telecom, and rail — where one node is the system.",
    problem: [
      "Infrastructure cascades follow physics, not procurement. A single substation, a single subsea cable landing, a single rail interchange can take a region offline — and the dependency map that would surface those nodes in advance often only exists in operations databases, not in the models that price the risk.",
      "Standard contingency analysis (N-1, N-2) is a regulatory floor, not a structural map. It enumerates failure cases but not the cascade depth — which other infrastructures, which counterparties, which downstream production sites fail with the named one. The relevant graph crosses the seams: power into telecom into finance into manufacturing.",
      "When something does fail, the loss isn't bounded by the asset. It's bounded by everything the asset was carrying. That's the number a CFO, a reinsurance underwriter, or a national-security planner needs, and it's the number nobody computes ahead of time.",
    ],
    mapping: [
      "Manifold ingests the physical-asset graph (substations, lines, transformer banks, cable landings, water mains, pipelines, rail interchanges) and joins it to the dependency layer above (telecom carriers, settlement systems, hospitals, manufacturing plants, defense logistics). Edges encode physical, contractual, or jurisdictional dependency — same schema, different sources.",
      "PEARL runs counterfactuals on named outage scenarios (this substation goes dark for 72 hours; this cable landing is severed). PARETO simulates the resulting cascade across the joined graph. SPIRTES discovers structural dependencies that operations data implies but no formal map captures.",
    ],
    engines: ["SPIRTES", "PEARL", "PARETO"],
    pillars: ["I", "R", "C", "T"],
    signals: [],
    personas: [
      {
        title: "Operations Planner · ISO / RTO",
        pain: "Regulatory N-1 contingency analysis ignores the real cascade graph. The substation, transformer bank, or HV interconnection that decides regional reliability is buried in operating data, not surfaced as a structural risk.",
        gain: "ΩF score per node on the live grid graph. Counterfactual outage simulation across substations, lines, and interconnections. Decisive-node ranking under contingency stacks.",
      },
      {
        title: "CAT Underwriter · Specialty Reinsurance",
        pain: "Property-cat models price physical asset damage. They miss the cascade — the cable landing that takes telecom and finance offline, the port that backstops half the regional supply chain.",
        gain: "Network-aware exposure across the insured graph. Cascade load and tail-depth on the lines you actually wrote.",
      },
      {
        title: "Government · Critical Infrastructure Protection",
        pain: "Strategic-asset lists rank by size or visibility. The decisive nodes — the ones whose failure cascades — aren't the same set, and aren't ranked anywhere.",
        gain: "I + C ranking on the national infrastructure graph, configurable per strategic objective (continuity of government, defense logistics, financial settlement).",
      },
    ],
  },

  economic: {
    slug: "economic",
    name: "Economic",
    color: "amber",
    tagline: "Trade flows, sectoral GDP, and the exposure hidden in macro aggregates.",
    problem: [
      "Macro aggregates — sectoral GDP, trade balances, headline employment — smear over the structural fragility underneath. A sector grows three percent in print while one node in that sector quietly carries half its productivity, and when that node moves, the print finally agrees, six months late.",
      "Index-weighted exposure isn't structural exposure. A portfolio that looks balanced by sector or geography can be highly concentrated in the underlying graph — through a single processor, a single trade route, a single financing channel. Standard factor decompositions don't see it.",
      "The events that actually move macro data are usually graph events: a port closure, a key supplier going offline, a tariff regime that re-routes a flow. Macro models that don't have the graph can't price the event in advance.",
    ],
    mapping: [
      "Manifold treats the economic graph as nodes for sectors, sub-sectors, trade routes, key producers, and major consumers, with edges encoding revealed dependency from trade, payment, and production data. ΩF per node makes the structural concentration explicit.",
      "PEARL runs counterfactuals on tariff, sanction, and trade-route shocks. PARETO simulates the cascade. SPIRTES discovers dependency structure that the data implies but the official sectoral classification doesn't capture.",
    ],
    engines: ["SPIRTES", "PEARL", "PARETO"],
    pillars: ["I", "J", "C", "T"],
    signals: [],
    personas: [
      {
        title: "Macro Strategist · Multi-Strategy Hedge Fund",
        pain: "GDP and PMI prints lag the cascade by months. The structural fragility shows in the data only after positions have already moved.",
        gain: "Cascade simulation on trade-flow and sectoral graphs. Leading ΩSF / ΩSX signal before it lands in the prints.",
      },
      {
        title: "Sovereign Wealth · Risk & Allocation",
        pain: "Index-weighted exposure isn't the same as structural exposure. The nodes that carry sector-level fragility don't show up in standard factor decompositions.",
        gain: "Per-sector ΩF and node-level fragility under named shock scenarios. Defensible structural-risk view at the portfolio level.",
      },
      {
        title: "Treasury / Ministry of Finance · Macro Office",
        pain: "Budget planning prices revenue scenarios. Exposure to a single supply or trade shock is footnoted, not modeled across the national economic graph.",
        gain: "ΩSF on the national economic graph, scenario library spanning trade, sectoral, and external-balance shocks.",
      },
    ],
  },

  finance: {
    slug: "finance",
    name: "Finance",
    color: "orange",
    tagline: "Banks, settlement, and sovereign credit — interconnection as a risk axis.",
    problem: [
      "Banking, settlement, and sovereign-credit networks survive on assumed liquidity that disappears under stress. The counterparty graph is monitored bilaterally; the network amplification — second-order exposure through the rest of the book — is hard to size and rarely priced into limits or capital.",
      "Standard stress tests run firm-by-firm or scenario-by-scenario. They miss the network-amplification term that is the actual mechanism of past crises: 2008's repo run, the 2010 sovereign loop, the 2023 regional-bank cascade. Each was a graph event the firm-level tests didn't see in advance.",
      "Sovereign credit is the same problem at country level. A single political event can re-price an entire sovereign curve overnight, and the structural setup that made it that fragile wasn't visible in the ratings.",
    ],
    mapping: [
      "Manifold ingests the supervised perimeter (lending exposures, derivatives, settlement flows, payment-rail dependencies) and the sovereign perimeter (cross-border banking claims, FX reserves, debt structure). Edges encode bilateral exposure, settlement flow, and rail dependency.",
      "PEARL runs counterfactuals on named stress scenarios (this central counterparty is impaired; this rail is unavailable for 24 hours; this sovereign loses access). PARETO simulates the resulting cascade across the supervised graph. SPIRTES surfaces structural dependencies the supervisory data implies but isn't called out.",
    ],
    engines: ["SPIRTES", "PEARL", "PARETO", "TARSKI"],
    pillars: ["I", "J", "C", "T"],
    signals: [],
    personas: [
      {
        title: "Counterparty Risk · Tier-1 Bank",
        pain: "Bilateral exposure is monitored counterparty-by-counterparty. The network amplification — second-order exposure through the rest of the book — is hard to size and never priced into limits.",
        gain: "Graph-based exposure on lending, derivatives, and settlement networks. ΩF per counterparty including indirect path risk.",
      },
      {
        title: "Financial Stability · Central Bank",
        pain: "Standard stress tests run firm-by-firm. They miss the network-amplification term that is the actual mechanism of past crises.",
        gain: "Cascade simulation across the supervised graph. Scenario library mapped to identifiable systemic-stress mechanics.",
      },
      {
        title: "Sovereign Credit · Buy-Side",
        pain: "Country ratings smear over real fragility. A single political event can re-price an entire sovereign curve overnight, and the structural setup wasn't visible beforehand.",
        gain: "Jurisdictional hazard + cascade load on the sovereign-finance subgraph. Counterfactual on named regime-change scenarios.",
      },
    ],
  },

  energy: {
    slug: "energy",
    name: "Energy",
    color: "green",
    tagline: "Grid, oil, gas, and transition tech — the supply curve is a graph.",
    problem: [
      "Energy systems span physical infrastructure, commodity flows, and policy regimes — and the fragility points sit at the seams. A single LNG terminal, a single specialist transformer factory, a single straits transit can decide the supply curve for a region. The seam between sectors (gas into power, mining into transition tech) is where the cascade starts.",
      "Risk is usually modeled in compartments: fuel risk in one team, grid risk in another, offtake-counterparty risk in a third. The interactions — the joint shock that hits all three — aren't priced into capital decisions, even though those are the events that actually move the book.",
      "Transition adds a second graph on top of the first: critical minerals, refining capacity, battery and electrolyzer manufacturing, charging infrastructure. The transition graph has its own single-source nodes and its own jurisdictional hazards, mostly distinct from the legacy graph.",
    ],
    mapping: [
      "Manifold ingests the physical asset graph (generation, transmission, fuel logistics, refining, transition manufacturing) and the commercial layer above (offtake counterparties, regulatory regimes, sanction and export-control envelopes). Edges encode capacity, contractual obligation, and policy dependency.",
      "PEARL runs counterfactuals on named scenarios (this strait is closed; this transformer factory loses 12 months of output; this jurisdiction adds export controls on a critical mineral). PARETO simulates the cascade. SPIRTES surfaces structural dependencies operating data implies.",
    ],
    engines: ["SPIRTES", "PEARL", "PARETO"],
    pillars: ["I", "R", "J", "C", "T"],
    signals: [],
    personas: [
      {
        title: "Risk & Scenarios · Integrated Energy Major",
        pain: "Capital allocation across upstream, midstream, and transition assets is scenario-driven, but the scenarios are hand-built each cycle and don't compose into a coherent fragility view.",
        gain: "Configurable causal graph spanning the asset book. Tail-depth simulation under joint commodity, regulatory, and infrastructure shocks.",
      },
      {
        title: "Power Generation Portfolio Manager",
        pain: "Fuel risk, grid risk, and offtake risk are each modeled in isolation. The interactions — the joint shock that hits all three — aren't priced into capital decisions.",
        gain: "Integrated graph view; ΩF per asset under joint shocks. Counterfactual on dispatch and offtake-counterparty failure.",
      },
      {
        title: "Government · Energy Security Office",
        pain: "Vulnerability assessments rarely cross sector boundaries. Strategic-stockpile sizing and decisive-node identification depend on a graph the office doesn't have.",
        gain: "Cross-sector graph. Irreplaceability + cascade ranking. Scenario simulation over import-cutoff and infrastructure-loss events.",
      },
    ],
  },

  geopolitical: {
    slug: "geopolitical",
    name: "Geopolitical",
    color: "red",
    tagline: "Sanctions, conflict, and export controls — fragility under regime change.",
    problem: [
      "Geopolitical risk is usually narrative, rarely structural. A single export-control update, a single sanctions designation, a single tariff schedule can re-price an entire supply chain overnight — but the structural setup that made the chain that exposed wasn't visible in any standard risk view.",
      "Defensive analysis catches up. Adversary planning runs ahead. Lists of strategic dependencies aren't ranked by leverage; coercion plans are built around named bottlenecks. The asymmetry shows up at exactly the moments where the named bottleneck gets named.",
      "The relevant graph is messy on purpose: legal entities, beneficial ownership, jurisdictional registration, end-use control, dual-use designation. The graph's edges are written by regulators and regimes, not by procurement. Most risk tooling treats the graph as a list.",
    ],
    mapping: [
      "Manifold ingests the corporate, legal, and trade graphs and joins them to jurisdictional layers (sanctions regimes, export-control schedules, tariff bands, licensing requirements). Edges encode ownership, contractual, and licensing dependency.",
      "PEARL runs counterfactuals on named regime changes (this export-control list expands; this entity is designated; this jurisdiction enters secondary-sanctions scope). PARETO simulates the resulting cascade. TARSKI verifies which paths through the graph remain compliant under the new regime. SPIRTES discovers ownership and licensing structure the data implies but public filings obscure.",
    ],
    engines: ["SPIRTES", "PEARL", "PARETO", "TARSKI"],
    pillars: ["I", "J", "C", "T"],
    signals: [],
    personas: [
      {
        title: "Global Head of Sanctions · Multinational",
        pain: "Every export-control update means a manual scramble across the operating footprint. The structural exposure — which products, which sites, which counterparties are decisive — isn't pre-computed anywhere.",
        gain: "Pre-computed jurisdictional hazard across the operating graph. Counterfactual on the actual graph for any new control regime.",
      },
      {
        title: "Coercion-Vulnerability Cell · National Security",
        pain: "Lists of strategic dependencies aren't ranked by leverage. Adversary coercion plans are built around named bottlenecks; defensive analysis often isn't.",
        gain: "J + C ranking on the relevant subgraph. Quantified leverage by node, by adversary, by named scenario.",
      },
      {
        title: "Country Risk · Buy-Side",
        pain: "Country narrative ≠ exposure. The political-risk premium is set off vibes; structural exposure to specific regime-change scenarios isn't priced separately.",
        gain: "Structural fragility under named scenarios. Tail-depth on jurisdictional-hazard concentration in the holdings graph.",
      },
    ],
  },

  science: {
    slug: "science",
    name: "Science",
    color: "magenta",
    tagline: "Research infra, instrumentation, and talent — discovery as a fragile network.",
    problem: [
      "Scientific output depends on a thin layer of unique instruments, facilities, and people. Most of these dependencies are invisible to funders and program managers — and to the institutions that depend on them. The cryo-EM facility, the synchrotron beamline, the principal investigator with the technique nobody has reproduced.",
      "When a key node fails — a facility goes down, a key PI leaves, a grant cycle ends without renewal — the cascade isn't visible until grants stall, papers stop landing, and trainees flow elsewhere. Often that's a year of lost productivity that wasn't accounted for in any portfolio review.",
      "Funders and institutions both run portfolios. Neither runs a graph. The dependency between bets — shared equipment, shared cores, shared mentors, shared cohorts — gets glossed over until something fails inside it.",
    ],
    mapping: [
      "Manifold ingests the research-infrastructure graph (facilities, instruments, key personnel, training pipelines) and the funding-portfolio layer above (grants, project pipelines, milestone obligations). Edges encode dependency: which projects depend on which instruments, which trainees on which mentors, which programs on which cores.",
      "PEARL runs counterfactuals on facility outages and personnel departures. PARETO simulates the resulting productivity cascade across the portfolio. SPIRTES surfaces dependencies that publication data implies but org charts don't.",
    ],
    engines: ["SPIRTES", "PEARL", "PARETO"],
    pillars: ["I", "R", "C", "T"],
    signals: [],
    personas: [
      {
        title: "Research VP · R1 University or National Lab",
        pain: "Institutional output depends on a thin layer of unique instruments and people, and that dependency isn't tracked. When a key facility goes dark or a key PI leaves, the cascade isn't visible until grants stall.",
        gain: "ΩF across the research graph; restoration latency on key nodes. Defensible succession and capex case at the institutional level.",
      },
      {
        title: "Program Manager · NSF / DOE / ARPA-H",
        pain: "Portfolio review is qualitative. The structural-fragility view — which instruments, which collaborations, which talent pipelines are decisive for the portfolio's deliverables — is invisible.",
        gain: "Per-portfolio ΩF. Identification of decisive instruments, facilities, and people. Defensible reallocation case.",
      },
      {
        title: "R&D Strategy · Biotech / Pharma",
        pain: "Research bets assume inputs are fungible. Often they aren't — a single instrument supplier, a single CRO, a single specialist team can stall a program for a year.",
        gain: "Graph view of the research supply chain. Cascade simulation on supplier and CRO failure across the pipeline.",
      },
    ],
  },

  insurance: {
    slug: "insurance",
    name: "Insurance",
    color: "blue",
    tagline: "Reinsurance, specialty lines, and the cascade exposure cat models miss.",
    problem: [
      "Insurance and reinsurance run on cat models that price physical damage well — wind, flood, quake — and price the network around the asset poorly. The cascade between insureds, between treaties, and between regions is rarely modeled. The peak exposures that actually move a portfolio are usually structural, not perils.",
      "Aggregate exposure across a book is monitored line-by-line. The joint event that lights up multiple lines at once — a tropical storm that takes a port offline that strands manufacturing capacity that breaks supplier covenants — sits in the seams between underwriting silos. By the time it materializes, retro spirals are already running.",
      "Specialty and ILS markets price tail risk explicitly, but the tail itself is graph-shaped: parametric triggers, reinstatements, capacity caps, retrocession layers. The tail event isn't a single number; it's a sequence of dependent draws across a network of obligations. Most pricing tools don't model that network.",
    ],
    mapping: [
      "Manifold ingests the insurance graph at three layers: the physical exposure graph (insured assets, geographies, occupancy), the contractual graph (treaties, layers, retrocession towers, capacity providers), and the regulatory graph (state filings, run-off jurisdictions, capital requirements). Edges encode physical correlation, ceding obligation, and jurisdictional dependency.",
      "PEARL runs counterfactuals on named events (a 1-in-200 tropical storm hitting this exposure footprint; a sovereign ratings shock impacting these reinsurers' balance sheets). PARETO simulates the cascade through retrocession and aggregate-stop-loss layers. SPIRTES discovers latent exposure correlations the actuarial categories don't capture. TARSKI verifies which paths through the graph remain compliant under filed treaty terms and regulatory regimes.",
    ],
    engines: ["SPIRTES", "PEARL", "PARETO", "TARSKI"],
    pillars: ["I", "R", "J", "C", "T"],
    signals: [],
    personas: [
      {
        title: "CAT Underwriter · Specialty Reinsurance",
        pain: "Peak-peril exposure is priced asset-by-asset; the cross-asset cascade is footnoted. When a named event hits, the actual loss includes second-order claims from infrastructure interdependency that the cat model never saw.",
        gain: "Network-aware exposure across the insured graph. Cascade load and tail-depth on the lines you actually wrote. Counterfactual loss distribution under named scenarios, with the second-order term priced.",
      },
      {
        title: "CRO · P&C Insurer",
        pain: "Aggregate exposure is monitored per line of business. The joint event that hits multiple lines at once is rarely sized. When it lands, the loss is computed after the fact and the capital case is reactive.",
        gain: "Joint-shock simulation across the full book. ΩSF / ΩSX as steady metrics on the portfolio graph. Defensible economic-capital case before the next renewal cycle.",
      },
      {
        title: "ILS / Sidecar Manager",
        pain: "Capital-markets reinsurance prices tail explicitly, but the tail is graph-shaped — reinstatements, retro spirals, parametric triggers — and the structuring tools treat each layer as independent.",
        gain: "Tail-depth simulation that respects the network: dependent reinstatements, retro propagation, parametric trigger interactions. Defensible structuring of new layers and sidecar capacity.",
      },
    ],
  },
};

export const DOMAIN_SLUGS = Object.keys(DOMAINS);
