import {
  CausalGraph,
  CausalNode,
  CausalEdge,
  CausalShock,
  RiskPropagationCard,
  GraphMetadata,
  OmegaFragilityProfile,
} from "./types";

// ─── Helper ─────────────────────────────────────────────────────
function omega(
  composite: number,
  substitutionFriction: number,
  downstreamLoad: number,
  cascadingVoltage: number,
  existentialTailWeight: number,
): OmegaFragilityProfile {
  return { composite, substitutionFriction, downstreamLoad, cascadingVoltage, existentialTailWeight };
}

// ─── Main Graph Nodes (~25) ─────────────────────────────────────
const NODES: CausalNode[] = [
  // ── EUV Lithography (3) ──
  {
    id: "zeiss_optics",
    label: "ZEISS High-NA Optics",
    shortLabel: "ZHN",
    category: "manufacturing",
    omegaFragility: omega(9.6, 9.8, 9.4, 9.2, 9.8),
    globalConcentration: "100% ZEISS (Oberkochen)",
    replacementTime: "10-15 years",
    physicalConstraint: "Sub-nm mirror polishing; no alternative supplier exists",
    domain: "EUV Lithography",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },
  {
    id: "asml_euv",
    label: "ASML EUV Platform",
    shortLabel: "AEP",
    category: "manufacturing",
    omegaFragility: omega(9.4, 9.6, 9.5, 9.0, 9.4),
    globalConcentration: "100% ASML (Veldhoven)",
    replacementTime: "7-10 years",
    physicalConstraint: "13.5 nm EUV wavelength requires tin-droplet plasma source",
    domain: "EUV Lithography",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },
  {
    id: "tsmc_fab",
    label: "TSMC Advanced Fab",
    shortLabel: "TAF",
    category: "manufacturing",
    omegaFragility: omega(9.2, 8.8, 9.6, 9.3, 9.0),
    globalConcentration: "92% TSMC (Hsinchu/Tainan)",
    replacementTime: "5-7 years",
    physicalConstraint: "N3/N2 process requires >1000 EUV layers per wafer",
    domain: "EUV Lithography",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },

  // ── Undersea Cables (3) ──
  {
    id: "subsea_mfg",
    label: "Subsea Cable Mfg",
    shortLabel: "SCM",
    category: "communications",
    omegaFragility: omega(8.8, 8.5, 8.8, 8.2, 8.6),
    globalConcentration: "3 firms: SubCom, NEC, Alcatel",
    replacementTime: "3-5 years",
    physicalConstraint: "Specialty optical fiber pairs; limited extrusion capacity",
    domain: "Undersea Cables",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },
  {
    id: "cable_fleet",
    label: "Cable-Laying Fleet",
    shortLabel: "CLF",
    category: "communications",
    omegaFragility: omega(8.7, 9.0, 8.4, 8.0, 8.5),
    globalConcentration: "<60 vessels globally capable",
    replacementTime: "4-6 years",
    physicalConstraint: "Specialized DP-2 vessels; 2-year shipyard lead time",
    domain: "Undersea Cables",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },
  {
    id: "landing_stations",
    label: "Landing Station Cluster",
    shortLabel: "LSC",
    category: "communications",
    omegaFragility: omega(9.4, 8.0, 9.6, 9.5, 9.2),
    globalConcentration: "70% traffic through 20 stations",
    replacementTime: "2-4 years",
    physicalConstraint: "Coastal geography constrains viable landing sites",
    domain: "Undersea Cables",
    discoverySource: "PCMCI+",
    isConfounded: false,
    isRestricted: false,
  },

  // ── Rare Earth (2) ──
  {
    id: "baotou_refining",
    label: "Baotou Rare Earth Refining",
    shortLabel: "BRE",
    category: "manufacturing",
    omegaFragility: omega(9.7, 9.5, 9.6, 9.4, 9.8),
    globalConcentration: "93% China (60% Baotou alone)",
    replacementTime: "7-12 years",
    physicalConstraint: "Solvent extraction cascades; radioactive tailings management",
    domain: "Rare Earth",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },
  {
    id: "ndfeb_magnets",
    label: "NdFeB Magnet Fab",
    shortLabel: "NdF",
    category: "manufacturing",
    omegaFragility: omega(9.4, 9.2, 9.3, 9.0, 9.1),
    globalConcentration: "90% China",
    replacementTime: "5-8 years",
    physicalConstraint: "Sintering requires precise Nd:Fe:B stoichiometry under inert atmosphere",
    domain: "Rare Earth",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },

  // ── HVDC Cables (2) ──
  {
    id: "hvdc_cable_mfg",
    label: "HVDC Cable Mfg",
    shortLabel: "HCM",
    category: "energy",
    omegaFragility: omega(9.5, 9.3, 9.2, 9.0, 9.4),
    globalConcentration: "3 firms: Prysmian, Nexans, NKT",
    replacementTime: "4-7 years",
    physicalConstraint: "XLPE insulation extrusion at >500 kV rated voltage",
    domain: "HVDC Power",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },
  {
    id: "converter_stations",
    label: "Converter Station Supply",
    shortLabel: "CVS",
    category: "energy",
    omegaFragility: omega(8.6, 8.4, 8.8, 8.2, 8.0),
    globalConcentration: "4 firms: Hitachi, Siemens, ABB, GE",
    replacementTime: "3-5 years",
    physicalConstraint: "IGBT valve stacks rated >800 kV; custom transformer design",
    domain: "HVDC Power",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },

  // ── AI Compute / HBM (3) ──
  {
    id: "tsmc_cowos",
    label: "TSMC CoWoS Packaging",
    shortLabel: "CoW",
    category: "manufacturing",
    omegaFragility: omega(9.9, 9.8, 9.7, 9.6, 9.9),
    globalConcentration: "100% TSMC CoWoS capacity",
    replacementTime: "3-5 years",
    physicalConstraint: "2.5D silicon interposer >2x reticle size; sub-10 µm bump pitch",
    domain: "AI Compute",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },
  {
    id: "sk_hynix_hbm",
    label: "SK Hynix HBM",
    shortLabel: "HBM",
    category: "manufacturing",
    omegaFragility: omega(9.7, 9.5, 9.6, 9.3, 9.6),
    globalConcentration: "53% SK Hynix, 38% Samsung",
    replacementTime: "3-4 years",
    physicalConstraint: "TSV through >12 DRAM die stack; thermal dissipation limit",
    domain: "AI Compute",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },
  {
    id: "nvidia_stack",
    label: "Nvidia GPU Stack",
    shortLabel: "NVD",
    category: "infrastructure",
    omegaFragility: omega(9.3, 8.8, 9.5, 9.2, 9.0),
    globalConcentration: "95% Nvidia (H100/B200 class)",
    replacementTime: "2-3 years",
    physicalConstraint: "CUDA ecosystem lock-in; NVLink interconnect proprietary",
    domain: "AI Compute",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },

  // ── Fertilizer / Ammonia (3) ──
  {
    id: "phosphate_rock",
    label: "Phosphate Rock",
    shortLabel: "PHR",
    category: "agriculture",
    omegaFragility: omega(9.7, 9.6, 9.8, 9.2, 9.7),
    globalConcentration: "70% Morocco (OCP Group)",
    replacementTime: "Non-substitutable geological",
    physicalConstraint: "Sedimentary deposits; no synthetic route exists",
    domain: "Fertilizer",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },
  {
    id: "potash_exports",
    label: "Potash Exports",
    shortLabel: "KCL",
    category: "agriculture",
    omegaFragility: omega(9.5, 9.3, 9.5, 9.0, 9.4),
    globalConcentration: "40% Canada, 20% Belarus/Russia",
    replacementTime: "5-10 years (new mine)",
    physicalConstraint: "Evaporite deposits at 1000m+ depth; solution mining required",
    domain: "Fertilizer",
    discoverySource: "PCMCI+",
    isConfounded: false,
    isRestricted: false,
  },
  {
    id: "gulf_ammonia",
    label: "Gulf Ammonia",
    shortLabel: "NH3",
    category: "agriculture",
    omegaFragility: omega(9.0, 8.5, 9.2, 8.8, 8.7),
    globalConcentration: "50% Middle East + Trinidad",
    replacementTime: "3-5 years",
    physicalConstraint: "Haber-Bosch at 200 atm / 500°C; 1.5% of global energy",
    domain: "Fertilizer",
    discoverySource: "PCMCI+",
    isConfounded: false,
    isRestricted: false,
  },

  // ── Data Centers (3) ──
  {
    id: "nova_hub",
    label: "N. Virginia Data Hub",
    shortLabel: "NVA",
    category: "infrastructure",
    omegaFragility: omega(9.5, 7.5, 9.8, 9.5, 9.3),
    globalConcentration: "70% of US East cloud traffic",
    replacementTime: "3-5 years",
    physicalConstraint: "Dominion Energy grid capacity; water table cooling limits",
    domain: "Data Centers",
    discoverySource: "DCD",
    isConfounded: true,
    isRestricted: false,
  },
  {
    id: "hv_transformers",
    label: "HV Transformer Supply",
    shortLabel: "HVT",
    category: "energy",
    omegaFragility: omega(8.7, 9.0, 8.8, 8.5, 8.4),
    globalConcentration: "18-month+ lead time globally",
    replacementTime: "2-3 years",
    physicalConstraint: "Grain-oriented electrical steel; custom winding per spec",
    domain: "Data Centers",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },
  {
    id: "liquid_cooling",
    label: "Liquid Cooling Infra",
    shortLabel: "LCI",
    category: "infrastructure",
    omegaFragility: omega(8.5, 8.0, 8.3, 8.0, 7.8),
    globalConcentration: "Vertiv, CoolIT, ZutaCore lead",
    replacementTime: "1-2 years",
    physicalConstraint: "Dielectric fluid supply; CDU heat rejection to ambient",
    domain: "Data Centers",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },

  // ── Dollar Funding (3) ──
  {
    id: "fx_swap_basis",
    label: "FX Swap Basis",
    shortLabel: "FXB",
    category: "finance",
    omegaFragility: omega(9.5, 7.0, 9.8, 9.6, 9.5),
    globalConcentration: "5 G-SIB dealers control 80%",
    replacementTime: "Systemic — no replacement",
    physicalConstraint: "CLS settlement window; Herstatt risk across time zones",
    domain: "Dollar Funding",
    discoverySource: "FCI",
    isConfounded: true,
    isRestricted: false,
  },
  {
    id: "ust_repo",
    label: "UST Repo Chain",
    shortLabel: "REP",
    category: "finance",
    omegaFragility: omega(9.2, 7.5, 9.5, 9.3, 9.2),
    globalConcentration: "FICC-cleared; tri-party BNY/JPM",
    replacementTime: "Systemic — no replacement",
    physicalConstraint: "Collateral velocity; T+1 settlement mismatch",
    domain: "Dollar Funding",
    discoverySource: "FCI",
    isConfounded: true,
    isRestricted: false,
  },
  {
    id: "fed_swap_lines",
    label: "Fed Swap Lines",
    shortLabel: "FSL",
    category: "finance",
    omegaFragility: omega(8.9, 6.5, 9.0, 8.8, 9.0),
    globalConcentration: "Fed ↔ 5 major CBs standing; 9 ad-hoc",
    replacementTime: "Political — no market substitute",
    physicalConstraint: "Sovereign discretion; Congressional scrutiny risk",
    domain: "Dollar Funding",
    discoverySource: "FCI",
    isConfounded: false,
    isRestricted: false,
  },

  // ── Frontier Science (5) ──
  {
    id: "collider_precision",
    label: "Collider Precision Frontier",
    shortLabel: "CPF",
    category: "science",
    omegaFragility: omega(9.7, 9.8, 9.5, 9.3, 9.7),
    globalConcentration: "CERN LHC sole facility at energy frontier",
    replacementTime: "15-25 years (next-gen collider)",
    physicalConstraint: "Higgs self-coupling requires 10x luminosity; discovery window shrinking as anomalies refine",
    domain: "Frontier Science",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },
  {
    id: "neutrino_frontier",
    label: "Neutrino Mass & Oscillation",
    shortLabel: "NMO",
    category: "science",
    omegaFragility: omega(9.5, 9.6, 9.4, 9.2, 9.5),
    globalConcentration: "DUNE (US), Hyper-K (JP), JUNO (CN) — 3 mega-experiments",
    replacementTime: "10-20 years (detector construction)",
    physicalConstraint: "Sterile \u03BD parameter space shrinking; 0\u03BD\u03B2\u03B2 rarest process ever sought",
    domain: "Frontier Science",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },
  {
    id: "quantum_gravity_phenom",
    label: "Quantum Gravity Signatures",
    shortLabel: "QGS",
    category: "science",
    omegaFragility: omega(9.4, 9.7, 9.3, 9.0, 9.6),
    globalConcentration: "LIGO/Virgo/KAGRA + EHT + Fermi/CTA",
    replacementTime: "Cosmic events — non-reproducible",
    physicalConstraint: "Planck scale (10\u00B9\u2079 GeV) inaccessible directly; relies on cosmological amplification",
    domain: "Frontier Science",
    discoverySource: "PCMCI+",
    isConfounded: true,
    isRestricted: false,
  },
  {
    id: "dark_sector_sensors",
    label: "Dark Sector Quantum Sensors",
    shortLabel: "DQS",
    category: "science",
    omegaFragility: omega(9.3, 9.4, 9.2, 9.0, 9.3),
    globalConcentration: "Fragmented: ADMX, ABRACADABRA, CASPEr, NV labs",
    replacementTime: "5-10 years (quantum platform maturation)",
    physicalConstraint: "Decoherence limits; coupling strengths 10\u00B9\u2076\u00D7 weaker than EM",
    domain: "Frontier Science",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },
  {
    id: "multi_messenger_astro",
    label: "Multi-Messenger Astrophysics",
    shortLabel: "MMA",
    category: "science",
    omegaFragility: omega(9.6, 9.5, 9.7, 9.4, 9.6),
    globalConcentration: "IceCube, LIGO, Fermi, Pierre Auger — no single-point replacement",
    replacementTime: "Non-reproducible cosmic events",
    physicalConstraint: "Cross-channel timing windows <seconds; missed coincidence = lost forever",
    domain: "Frontier Science",
    discoverySource: "PCMCI+",
    isConfounded: true,
    isRestricted: false,
  },

  // ── Cross-domain connectors ──
  {
    id: "trade_policy",
    label: "Trade Policy Shock",
    shortLabel: "TPS",
    category: "geopolitical",
    omegaFragility: omega(8.5, 6.0, 9.0, 9.3, 8.8),
    globalConcentration: "US/EU/CN trilateral dominance",
    replacementTime: "Political cycle (2-6 years)",
    domain: "Geopolitical",
    discoverySource: "FCI",
    isConfounded: false,
    isRestricted: false,
  },
  {
    id: "grid_stability",
    label: "Grid Stability Index",
    shortLabel: "GSI",
    category: "energy",
    omegaFragility: omega(8.8, 7.5, 9.5, 9.2, 8.6),
    globalConcentration: "Regional ISO/RTO operators",
    replacementTime: "Infrastructure: 5-10 years",
    physicalConstraint: "AC frequency stability requires real-time generation balance",
    domain: "Energy Grid",
    discoverySource: "PCMCI+",
    isConfounded: false,
    isRestricted: true,
  },
];

// ─── Main Graph Edges (~35) ─────────────────────────────────────
const EDGES: CausalEdge[] = [
  // EUV Lithography chain
  { id: "e01", source: "zeiss_optics", target: "asml_euv", weight: 0.95, lag: 0, type: "directed", confidence: 0.98, isInconsistent: false, physicalMechanism: "supplies sole-source mirror optics" },
  { id: "e02", source: "asml_euv", target: "tsmc_fab", weight: 0.92, lag: 0, type: "directed", confidence: 0.96, isInconsistent: false, physicalMechanism: "enables EUV patterning at N3/N2" },

  // Undersea Cables chain
  { id: "e03", source: "subsea_mfg", target: "cable_fleet", weight: 0.85, lag: 1, type: "directed", confidence: 0.88, isInconsistent: false, physicalMechanism: "produces cable loaded onto lay vessels" },
  { id: "e04", source: "cable_fleet", target: "landing_stations", weight: 0.82, lag: 1, type: "directed", confidence: 0.86, isInconsistent: false, physicalMechanism: "installs and repairs subsea routes" },

  // Rare Earth chain
  { id: "e05", source: "baotou_refining", target: "ndfeb_magnets", weight: 0.93, lag: 0, type: "directed", confidence: 0.95, isInconsistent: false, physicalMechanism: "supplies separated Nd/Pr/Dy oxides" },

  // HVDC chain
  { id: "e06", source: "hvdc_cable_mfg", target: "converter_stations", weight: 0.80, lag: 0, type: "directed", confidence: 0.85, isInconsistent: false, physicalMechanism: "connects to HVDC converter terminals" },

  // AI Compute convergence
  { id: "e07", source: "sk_hynix_hbm", target: "tsmc_cowos", weight: 0.94, lag: 0, type: "directed", confidence: 0.97, isInconsistent: false, physicalMechanism: "HBM stacks bonded onto CoWoS interposer" },
  { id: "e08", source: "nvidia_stack", target: "tsmc_cowos", weight: 0.90, lag: 0, type: "directed", confidence: 0.94, isInconsistent: false, physicalMechanism: "GPU die packaged via CoWoS" },

  // Fertilizer internal
  { id: "e09", source: "phosphate_rock", target: "gulf_ammonia", weight: 0.65, lag: 1, type: "temporal", confidence: 0.72, isInconsistent: false, physicalMechanism: "DAP/MAP production requires both P and N" },
  { id: "e10", source: "potash_exports", target: "gulf_ammonia", weight: 0.60, lag: 1, type: "temporal", confidence: 0.70, isInconsistent: false, physicalMechanism: "NPK blending co-dependency" },

  // Data Center internal
  { id: "e11", source: "hv_transformers", target: "nova_hub", weight: 0.88, lag: 0, type: "directed", confidence: 0.90, isInconsistent: false, physicalMechanism: "steps down transmission voltage for DC load" },
  { id: "e12", source: "liquid_cooling", target: "nova_hub", weight: 0.75, lag: 0, type: "directed", confidence: 0.82, isInconsistent: false, physicalMechanism: "removes heat from GPU racks" },

  // Dollar Funding internal
  { id: "e13", source: "fx_swap_basis", target: "ust_repo", weight: 0.85, lag: 0, type: "directed", confidence: 0.88, isInconsistent: false, physicalMechanism: "FX hedging cost affects repo spread" },
  { id: "e14", source: "ust_repo", target: "fed_swap_lines", weight: 0.70, lag: 1, type: "temporal", confidence: 0.78, isInconsistent: false, physicalMechanism: "repo stress triggers Fed backstop" },
  { id: "e15", source: "fed_swap_lines", target: "fx_swap_basis", weight: 0.65, lag: 0, type: "confounded", confidence: 0.68, isInconsistent: true, physicalMechanism: "swap-line availability compresses basis" },

  // ─── Cross-Domain Edges ───────────────────────────────────────
  // Shared facility risk: TSMC fab → CoWoS
  { id: "e16", source: "tsmc_fab", target: "tsmc_cowos", weight: 0.88, lag: 0, type: "directed", confidence: 0.92, isInconsistent: false, physicalMechanism: "shared Hsinchu campus; earthquake / water risk" },

  // Rare Earth → HVDC material chain
  { id: "e17", source: "ndfeb_magnets", target: "hvdc_cable_mfg", weight: 0.72, lag: 1, type: "directed", confidence: 0.78, isInconsistent: false, physicalMechanism: "permanent magnets for offshore wind → HVDC demand" },

  // HVDC → Grid → Data Center power cascade
  { id: "e18", source: "converter_stations", target: "grid_stability", weight: 0.78, lag: 0, type: "directed", confidence: 0.84, isInconsistent: false, physicalMechanism: "HVDC interconnects stabilize grid frequency" },
  { id: "e19", source: "grid_stability", target: "nova_hub", weight: 0.82, lag: 0, type: "directed", confidence: 0.87, isInconsistent: false, physicalMechanism: "grid reliability powers data center load" },
  { id: "e20", source: "nova_hub", target: "tsmc_cowos", weight: 0.70, lag: 1, type: "temporal", confidence: 0.75, isInconsistent: false, physicalMechanism: "cloud demand signal drives CoWoS orders" },

  // Landing stations → Dollar Funding (connectivity → finance)
  { id: "e21", source: "landing_stations", target: "fx_swap_basis", weight: 0.68, lag: 0, type: "directed", confidence: 0.74, isInconsistent: false, physicalMechanism: "subsea latency enables FX market-making" },

  // AI Compute → Credit markets (economic cascade)
  { id: "e22", source: "tsmc_cowos", target: "ust_repo", weight: 0.62, lag: 2, type: "temporal", confidence: 0.68, isInconsistent: false, physicalMechanism: "compute scarcity → AI capex crunch → credit stress" },

  // Trade policy → Rare Earth + Semiconductor (geopolitical coupling)
  { id: "e23", source: "trade_policy", target: "baotou_refining", weight: 0.80, lag: 1, type: "temporal", confidence: 0.82, isInconsistent: false, physicalMechanism: "export controls restrict rare earth flow" },
  { id: "e24", source: "trade_policy", target: "tsmc_fab", weight: 0.75, lag: 2, type: "temporal", confidence: 0.78, isInconsistent: false, physicalMechanism: "chip export restrictions constrain supply" },
  { id: "e25", source: "trade_policy", target: "asml_euv", weight: 0.70, lag: 1, type: "temporal", confidence: 0.76, isInconsistent: false, physicalMechanism: "Dutch export license regime on EUV tools" },

  // Fertilizer → Trade Policy feedback (food security → geopolitics)
  { id: "e26", source: "phosphate_rock", target: "trade_policy", weight: 0.55, lag: 2, type: "temporal", confidence: 0.62, isInconsistent: false, physicalMechanism: "food price shock triggers export bans" },
  { id: "e27", source: "potash_exports", target: "trade_policy", weight: 0.50, lag: 2, type: "temporal", confidence: 0.60, isInconsistent: false, physicalMechanism: "fertilizer sanctions alter geopolitical stance" },

  // Rare Earth → Semiconductor dependency
  { id: "e28", source: "baotou_refining", target: "tsmc_fab", weight: 0.58, lag: 1, type: "directed", confidence: 0.65, isInconsistent: false, physicalMechanism: "rare earth in CMP slurries and sputtering targets" },

  // Grid ↔ DC power feedback
  { id: "e29", source: "nova_hub", target: "grid_stability", weight: 0.45, lag: 0, type: "confounded", confidence: 0.60, isInconsistent: true, physicalMechanism: "DC load growth strains grid; grid instability threatens DC" },

  // Nvidia stack → Nova hub (compute demand)
  { id: "e30", source: "nvidia_stack", target: "nova_hub", weight: 0.78, lag: 0, type: "directed", confidence: 0.85, isInconsistent: false, physicalMechanism: "GPU deployment drives DC power/cooling demand" },

  // HBM → Fab dependency
  { id: "e31", source: "sk_hynix_hbm", target: "tsmc_fab", weight: 0.60, lag: 0, type: "directed", confidence: 0.72, isInconsistent: false, physicalMechanism: "HBM DRAM dies fabricated at advanced nodes" },

  // Subsea cables → Data centers
  { id: "e32", source: "landing_stations", target: "nova_hub", weight: 0.72, lag: 0, type: "directed", confidence: 0.80, isInconsistent: false, physicalMechanism: "subsea connectivity routes traffic to DC hubs" },

  // HVDC → HV Transformers
  { id: "e33", source: "hvdc_cable_mfg", target: "hv_transformers", weight: 0.65, lag: 0, type: "directed", confidence: 0.72, isInconsistent: false, physicalMechanism: "HVDC expansion competes for transformer capacity" },

  // Liquid cooling ← AI Compute demand
  { id: "e34", source: "tsmc_cowos", target: "liquid_cooling", weight: 0.68, lag: 1, type: "temporal", confidence: 0.74, isInconsistent: false, physicalMechanism: "higher TDP chips drive liquid cooling adoption" },

  // FX Swap → Credit contraction effect
  { id: "e35", source: "fx_swap_basis", target: "fed_swap_lines", weight: 0.72, lag: 0, type: "directed", confidence: 0.76, isInconsistent: false, physicalMechanism: "basis blowout triggers emergency swap-line draws" },

  // ─── Frontier Science Internal Edges ────────────────────────────
  // Collider → Neutrino (shared accelerator infrastructure, CP violation measurements)
  { id: "e36", source: "collider_precision", target: "neutrino_frontier", weight: 0.78, lag: 1, type: "directed", confidence: 0.82, isInconsistent: false, physicalMechanism: "accelerator-produced neutrino beams; shared CP violation measurements" },
  // Neutrino → Dark Sector (sterile neutrino ↔ dark sector coupling)
  { id: "e37", source: "neutrino_frontier", target: "dark_sector_sensors", weight: 0.72, lag: 1, type: "temporal", confidence: 0.76, isInconsistent: false, physicalMechanism: "sterile neutrino signatures constrain dark sector parameter space" },
  // Multi-Messenger → QG (GW + gamma-ray → Planck-scale dispersion tests)
  { id: "e38", source: "multi_messenger_astro", target: "quantum_gravity_phenom", weight: 0.88, lag: 0, type: "directed", confidence: 0.90, isInconsistent: false, physicalMechanism: "multi-messenger timing tests Lorentz invariance at Planck scale" },
  // QG → Dark Sector (shared quantum sensor technology)
  { id: "e39", source: "quantum_gravity_phenom", target: "dark_sector_sensors", weight: 0.68, lag: 1, type: "temporal", confidence: 0.72, isInconsistent: false, physicalMechanism: "interferometric Planck-scale noise probes overlap with dark sector searches" },
  // Collider → QG (energy frontier constraints inform QG models)
  { id: "e40", source: "collider_precision", target: "quantum_gravity_phenom", weight: 0.60, lag: 2, type: "temporal", confidence: 0.66, isInconsistent: false, physicalMechanism: "electroweak precision data constrains quantum gravity effective field theory" },
  // Multi-Messenger → Neutrino (supernova neutrino bursts are multi-messenger events)
  { id: "e41", source: "multi_messenger_astro", target: "neutrino_frontier", weight: 0.82, lag: 0, type: "directed", confidence: 0.86, isInconsistent: false, physicalMechanism: "supernova neutrino burst requires real-time multi-messenger alert" },

  // ─── Frontier Science Cross-Domain Edges ────────────────────────
  // AI Compute → Collider (ML anomaly detection, lattice QCD)
  { id: "e42", source: "nvidia_stack", target: "collider_precision", weight: 0.65, lag: 1, type: "temporal", confidence: 0.70, isInconsistent: false, physicalMechanism: "GPU-driven ML anomaly detection accelerates BSM searches in collider data" },
  // Data Centers → Multi-Messenger (compute for GW template matching)
  { id: "e43", source: "nova_hub", target: "multi_messenger_astro", weight: 0.60, lag: 0, type: "directed", confidence: 0.68, isInconsistent: false, physicalMechanism: "real-time GW template matching requires low-latency cloud compute" },
  // Landing Stations → Multi-Messenger (global data sync for coincidence detection)
  { id: "e44", source: "landing_stations", target: "multi_messenger_astro", weight: 0.72, lag: 0, type: "directed", confidence: 0.78, isInconsistent: false, physicalMechanism: "subsea fiber carries sub-second multi-messenger alerts across observatories" },
  // Grid → Dark Sector Sensors (cryogenic detectors need stable power)
  { id: "e45", source: "grid_stability", target: "dark_sector_sensors", weight: 0.58, lag: 0, type: "directed", confidence: 0.65, isInconsistent: false, physicalMechanism: "quantum sensor decoherence spikes with grid frequency instability" },
];

const METADATA: GraphMetadata = {
  density: parseFloat((2 * EDGES.length / (NODES.length * (NODES.length - 1))).toFixed(3)),
  constraintType: "DCD / NOTEARS + PCMCI+ temporal + FCI latent",
  verificationStatus: "INCONSISTENCIES_FOUND",
  totalNodes: NODES.length,
  totalEdges: EDGES.length,
  inconsistentEdges: EDGES.filter((e) => e.isInconsistent).length,
  restrictedNodes: NODES.filter((n) => n.isRestricted).length,
};

export const MAIN_GRAPH: CausalGraph = {
  nodes: NODES,
  edges: EDGES,
  metadata: METADATA,
};

export const EMPTY_GRAPH: CausalGraph = {
  nodes: [],
  edges: [],
  metadata: {
    density: 0,
    constraintType: "none",
    verificationStatus: "UNVERIFIED",
    totalNodes: 0,
    totalEdges: 0,
    inconsistentEdges: 0,
    restrictedNodes: 0,
  },
};

// ─── DCD Sub-Graph (for Trinity Panel) ───────────────────────────
export const DCD_NODES: CausalNode[] = NODES.filter(
  (n) => n.discoverySource === "DCD" || n.discoverySource === "merged"
);
export const DCD_EDGES: CausalEdge[] = EDGES.filter(
  (e) =>
    e.type === "directed" &&
    DCD_NODES.some((n) => n.id === e.source) &&
    DCD_NODES.some((n) => n.id === e.target)
);

// ─── PCMCI+ Sub-Graph (temporal) ─────────────────────────────────
export const PCMCI_NODES: CausalNode[] = NODES.filter(
  (n) => n.discoverySource === "PCMCI+" || n.discoverySource === "merged"
);
// Also include nodes that are sources/targets of temporal edges
const temporalEdges = EDGES.filter((e) => e.lag > 0);
const temporalNodeIds = new Set<string>();
temporalEdges.forEach((e) => {
  temporalNodeIds.add(e.source);
  temporalNodeIds.add(e.target);
});
NODES.forEach((n) => {
  if (temporalNodeIds.has(n.id) && !PCMCI_NODES.some((pn) => pn.id === n.id)) {
    PCMCI_NODES.push(n);
  }
});
export const PCMCI_EDGES: CausalEdge[] = EDGES.filter(
  (e) =>
    e.lag > 0 &&
    PCMCI_NODES.some((n) => n.id === e.source) &&
    PCMCI_NODES.some((n) => n.id === e.target)
);

// ─── FCI Sub-Graph (latent confounding) ──────────────────────────
export const FCI_NODES: CausalNode[] = NODES.filter(
  (n) => n.isConfounded || n.discoverySource === "FCI"
);
export const FCI_EDGES: CausalEdge[] = EDGES.filter(
  (e) =>
    e.type === "confounded" ||
    (FCI_NODES.some((n) => n.id === e.source) &&
      FCI_NODES.some((n) => n.id === e.target))
);

// ─── Risk Cards Builder ──────────────────────────────────────────
export function buildRiskCards(
  graph: CausalGraph,
  shocks: CausalShock[]
): RiskPropagationCard[] {
  const totalSeverity = shocks.reduce((sum, s) => sum + s.severity, 0);
  const shockMultiplier = Math.min(1, totalSeverity);

  return graph.nodes
    .map((node) => ({
      nodeId: node.id,
      label: node.label,
      category: node.category,
      omegaScore: parseFloat(
        (node.omegaFragility.composite * (1 + shockMultiplier * 0.05)).toFixed(1)
      ),
      domain: node.domain,
      globalConcentration: node.globalConcentration,
    }))
    .sort((a, b) => b.omegaScore - a.omegaScore)
    .slice(0, 6);
}

// ─── Category Colors ─────────────────────────────────────────────
export function getCategoryColor(category: string): string {
  switch (category) {
    case "manufacturing": return "#00e5ff";
    case "infrastructure": return "#7c4dff";
    case "economic": return "#ffab00";
    case "finance": return "#ff6d00";
    case "energy": return "#00e676";
    case "geopolitical": return "#ff1744";
    case "communications": return "#448aff";
    case "agriculture": return "#76ff03";
    case "science": return "#e040fb";
    default: return "#5a5e72";
  }
}

export function getCategoryLabel(category: string): string {
  return category.toUpperCase();
}

// ─── Domain Colors ───────────────────────────────────────────────
export function getDomainColor(domain: string): string {
  switch (domain) {
    case "EUV Lithography": return "#00e5ff";
    case "Undersea Cables": return "#448aff";
    case "Rare Earth": return "#e040fb";
    case "HVDC Power": return "#00e676";
    case "AI Compute": return "#ff6d00";
    case "Fertilizer": return "#76ff03";
    case "Data Centers": return "#7c4dff";
    case "Dollar Funding": return "#ffab00";
    case "Geopolitical": return "#ff1744";
    case "Energy Grid": return "#00bfa5";
    case "Frontier Science": return "#e040fb";
    // Athena Defense domains
    case "Drone Swarms": return "#ff6d00";
    case "SATCOM": return "#448aff";
    case "ISR Fusion": return "#e040fb";
    case "Chip Embargo": return "#ff1744";
    case "Secure Compute": return "#7c4dff";
    case "Kill Chain": return "#ffab00";
    default: return "#5a5e72";
  }
}

// ─── Node Domain Map (for cross-domain edge detection) ───────────
export function getNodeDomainMap(): Record<string, string> {
  const map: Record<string, string> = {};
  NODES.forEach((n) => { map[n.id] = n.domain; });
  return map;
}
