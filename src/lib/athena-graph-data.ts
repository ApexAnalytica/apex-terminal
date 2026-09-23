import {
  CausalGraph,
  CausalNode,
  CausalEdge,
  GraphMetadata,
  OmegaFragilityProfile,
} from "./types";

// ─── Helper ─────────────────────────────────────────────────────
function omega(
  composite: number,
  irreplaceability: number,
  restorationLatency: number,
  jurisdictionalHazard: number,
  cascadeLoad: number,
  tailDepth: number,
): OmegaFragilityProfile {
  return { composite, irreplaceability, restorationLatency, jurisdictionalHazard, cascadeLoad, tailDepth };
}

// ─── Athena ISR Graph Nodes (18) ─────────────────────────────────
const NODES: CausalNode[] = [
  // ── Drone Swarms (3) ──
  {
    id: "edge_ai_inference",
    label: "Edge AI Inference",
    shortLabel: "EAI",
    category: "infrastructure",
    omegaFragility: omega(9.4, 9.2, 5.0, 5.0, 9.5, 9.3),
    globalConcentration: "87% Nvidia Jetson/Orin platform",
    replacementTime: "2-4 years",
    physicalConstraint: "INT8 inference at <10W TDP; ITAR-controlled firmware",
    domain: "Drone Swarms",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },
  {
    id: "swarm_mesh",
    label: "Swarm Mesh Coordination",
    shortLabel: "SMC",
    category: "communications",
    omegaFragility: omega(9.1, 8.8, 5.0, 5.0, 9.3, 8.9),
    globalConcentration: "3 prime contractors: L3Harris, Northrop, Shield AI",
    replacementTime: "3-5 years",
    physicalConstraint: "MANET latency <50ms; GPS-denied navigation required",
    domain: "Drone Swarms",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },
  {
    id: "drone_gpu_alloc",
    label: "Drone GPU Allocation",
    shortLabel: "DGA",
    category: "manufacturing",
    omegaFragility: omega(9.6, 9.5, 5.0, 5.0, 9.4, 9.7),
    globalConcentration: "100% TSMC fab for edge AI silicon",
    replacementTime: "4-7 years",
    physicalConstraint: "Rad-tolerant packaging; MIL-STD-810 thermal cycling",
    domain: "Drone Swarms",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: true,
  },

  // ── SATCOM (3) ──
  {
    id: "leo_constellation",
    label: "LEO Constellation",
    shortLabel: "LEO",
    category: "communications",
    omegaFragility: omega(9.3, 9.0, 5.0, 5.0, 9.6, 9.2),
    globalConcentration: "SpaceX Starlink 62%, SDA T1TL 25%",
    replacementTime: "3-5 years",
    physicalConstraint: "Orbital debris Kessler threshold; launch cadence bottleneck",
    domain: "SATCOM",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },
  {
    id: "ground_terminals",
    label: "Ground Terminals",
    shortLabel: "GTM",
    category: "infrastructure",
    omegaFragility: omega(8.7, 8.5, 5.0, 5.0, 8.9, 8.6),
    globalConcentration: "4 vendors: Viasat, Hughes, L3Harris, RTX",
    replacementTime: "2-3 years",
    physicalConstraint: "Phased-array antenna; TEMPEST-certified enclosures",
    domain: "SATCOM",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },
  {
    id: "milsatcom_bw",
    label: "Protected MILSATCOM Bandwidth",
    shortLabel: "MSB",
    category: "communications",
    omegaFragility: omega(9.5, 9.3, 5.0, 5.0, 9.7, 9.5),
    globalConcentration: "AEHF/EPS: sole-source Lockheed/Northrop",
    replacementTime: "7-10 years",
    physicalConstraint: "Anti-jam waveform; nuclear-hardened transponders",
    domain: "SATCOM",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: true,
  },

  // ── ISR Fusion (3) ──
  {
    id: "eoir_sensors",
    label: "EO/IR Sensors",
    shortLabel: "EIR",
    category: "manufacturing",
    omegaFragility: omega(9.2, 9.0, 5.0, 5.0, 9.1, 9.0),
    globalConcentration: "85% L3Harris / RTX Collins",
    replacementTime: "3-5 years",
    physicalConstraint: "InSb/MCT focal plane arrays; cryocooler MTBF limits",
    domain: "ISR Fusion",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },
  {
    id: "sigint_collection",
    label: "SIGINT Collection",
    shortLabel: "SIG",
    category: "infrastructure",
    omegaFragility: omega(9.0, 8.7, 5.0, 5.0, 9.2, 8.8),
    globalConcentration: "NSA/CSS + 5 Eyes partners",
    replacementTime: "Classified — estimated 5-8 years",
    physicalConstraint: "Wideband digital receivers; ELINT fingerprint libraries",
    domain: "ISR Fusion",
    discoverySource: "PCMCI+",
    isConfounded: false,
    isRestricted: true,
  },
  {
    id: "multiint_fusion",
    label: "Multi-INT Fusion Engine",
    shortLabel: "MIF",
    category: "infrastructure",
    omegaFragility: omega(9.7, 9.4, 5.0, 5.0, 9.8, 9.6),
    globalConcentration: "Palantir + Primer AI dominate DoD contracts",
    replacementTime: "4-6 years",
    physicalConstraint: "Cross-domain data fusion requires IL4+ accreditation",
    domain: "ISR Fusion",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },

  // ── Chip Embargo (3) ──
  {
    id: "gpu_supply_itar",
    label: "GPU Supply Chain (ITAR)",
    shortLabel: "GSI",
    category: "manufacturing",
    omegaFragility: omega(9.8, 9.7, 5.0, 5.0, 9.6, 9.9),
    globalConcentration: "100% TSMC for advanced nodes; ITAR Category XI",
    replacementTime: "5-10 years",
    physicalConstraint: "Export-controlled die; secure foundry access required",
    domain: "Chip Embargo",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },
  {
    id: "radhard_fpga",
    label: "Rad-Hard FPGA",
    shortLabel: "RHF",
    category: "manufacturing",
    omegaFragility: omega(9.5, 9.6, 5.0, 5.0, 9.2, 9.4),
    globalConcentration: "Microchip (Microsemi) 70%, AMD (Xilinx) 30%",
    replacementTime: "4-7 years",
    physicalConstraint: "Single-event upset tolerance; SOI process required",
    domain: "Chip Embargo",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },
  {
    id: "itar_ear_gate",
    label: "ITAR/EAR Compliance Gate",
    shortLabel: "IEG",
    category: "geopolitical",
    omegaFragility: omega(9.3, 8.5, 5.0, 5.0, 9.5, 9.2),
    globalConcentration: "DDTC/BIS sole regulatory authority",
    replacementTime: "Political cycle (2-6 years)",
    physicalConstraint: "License approval latency 90-180 days; deemed export rules",
    domain: "Chip Embargo",
    discoverySource: "FCI",
    isConfounded: true,
    isRestricted: false,
  },

  // ── Secure Compute (3) ──
  {
    id: "classified_enclave",
    label: "Classified AI Enclave",
    shortLabel: "CAE",
    category: "infrastructure",
    omegaFragility: omega(9.6, 9.4, 5.0, 5.0, 9.7, 9.5),
    globalConcentration: "AWS GovCloud / Azure Gov / DISA milCloud",
    replacementTime: "3-5 years",
    physicalConstraint: "IL5/IL6 accreditation; air-gapped enclaves for TS/SCI",
    domain: "Secure Compute",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },
  {
    id: "scif_infra",
    label: "SCIF Infrastructure",
    shortLabel: "SCF",
    category: "infrastructure",
    omegaFragility: omega(8.9, 9.0, 5.0, 5.0, 8.8, 8.7),
    globalConcentration: "ODNI ICD 705 standard; limited SCIF-rated contractors",
    replacementTime: "2-4 years",
    physicalConstraint: "RF shielding, TEMPEST, intrusion detection; fixed-site only",
    domain: "Secure Compute",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },
  {
    id: "onprem_cloud_decision",
    label: "On-Prem vs Cloud Decision",
    shortLabel: "OCD",
    category: "geopolitical",
    omegaFragility: omega(8.5, 7.8, 5.0, 5.0, 8.8, 8.3),
    globalConcentration: "FedRAMP High / IL5+ gates adoption",
    replacementTime: "Policy cycle (1-3 years)",
    physicalConstraint: "Data sovereignty; cross-domain solution maturity",
    domain: "Secure Compute",
    discoverySource: "FCI",
    isConfounded: true,
    isRestricted: false,
  },

  // ── Kill Chain (3) ──
  {
    id: "ooda_latency",
    label: "OODA Loop Latency",
    shortLabel: "OOD",
    category: "infrastructure",
    omegaFragility: omega(9.4, 8.8, 5.0, 5.0, 9.6, 9.3),
    globalConcentration: "Observe-Orient-Decide-Act cycle; platform-dependent",
    replacementTime: "Doctrinal — 3-7 years to shift",
    physicalConstraint: "Sensor-to-shooter latency target <5min for time-critical",
    domain: "Kill Chain",
    discoverySource: "PCMCI+",
    isConfounded: false,
    isRestricted: false,
  },
  {
    id: "hitl_gate",
    label: "Human-in-the-Loop Gate",
    shortLabel: "HIL",
    category: "geopolitical",
    omegaFragility: omega(9.1, 8.0, 5.0, 5.0, 9.3, 9.4),
    globalConcentration: "DoD Directive 3000.09; NATO autonomous weapon policy",
    replacementTime: "Political/legal — indefinite",
    physicalConstraint: "Ethical AI mandate; LOAC compliance verification",
    domain: "Kill Chain",
    discoverySource: "FCI",
    isConfounded: true,
    isRestricted: false,
  },
  {
    id: "killchain_latency",
    label: "Kill Chain Latency Budget",
    shortLabel: "KCL",
    category: "infrastructure",
    omegaFragility: omega(9.5, 9.1, 5.0, 5.0, 9.7, 9.4),
    globalConcentration: "JADC2 architecture; service-specific C2 systems",
    replacementTime: "5-10 years (system of systems)",
    physicalConstraint: "End-to-end latency <2min for hypersonic threats",
    domain: "Kill Chain",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
  },
];

// ─── Athena Graph Edges (28) ─────────────────────────────────────
const EDGES: CausalEdge[] = [
  // Drone Swarms internal
  { id: "ae01", source: "edge_ai_inference", target: "swarm_mesh", weight: 0.92, lag: 0, type: "directed", confidence: 0.95, isInconsistent: false, physicalMechanism: "onboard inference drives swarm behavior decisions" },
  { id: "ae02", source: "drone_gpu_alloc", target: "edge_ai_inference", weight: 0.94, lag: 0, type: "directed", confidence: 0.96, isInconsistent: false, physicalMechanism: "GPU silicon allocation constrains edge AI throughput" },

  // SATCOM internal
  { id: "ae03", source: "leo_constellation", target: "ground_terminals", weight: 0.88, lag: 0, type: "directed", confidence: 0.90, isInconsistent: false, physicalMechanism: "LEO birds require compatible ground segment" },
  { id: "ae04", source: "ground_terminals", target: "milsatcom_bw", weight: 0.85, lag: 0, type: "directed", confidence: 0.88, isInconsistent: false, physicalMechanism: "ground terminals multiplex into protected MILSATCOM" },

  // ISR Fusion internal
  { id: "ae05", source: "eoir_sensors", target: "multiint_fusion", weight: 0.90, lag: 0, type: "directed", confidence: 0.93, isInconsistent: false, physicalMechanism: "EO/IR feeds into multi-INT fusion pipeline" },
  { id: "ae06", source: "sigint_collection", target: "multiint_fusion", weight: 0.87, lag: 0, type: "directed", confidence: 0.91, isInconsistent: false, physicalMechanism: "SIGINT correlated with IMINT in fusion engine" },

  // Chip Embargo internal
  { id: "ae07", source: "gpu_supply_itar", target: "radhard_fpga", weight: 0.80, lag: 1, type: "directed", confidence: 0.84, isInconsistent: false, physicalMechanism: "GPU export controls shift demand to rad-hard FPGA" },
  { id: "ae08", source: "itar_ear_gate", target: "gpu_supply_itar", weight: 0.85, lag: 1, type: "temporal", confidence: 0.82, isInconsistent: false, physicalMechanism: "ITAR/EAR policy gates GPU supply availability" },

  // Secure Compute internal
  { id: "ae09", source: "classified_enclave", target: "scif_infra", weight: 0.82, lag: 0, type: "directed", confidence: 0.86, isInconsistent: false, physicalMechanism: "enclave compute requires SCIF-grade physical security" },
  { id: "ae10", source: "onprem_cloud_decision", target: "classified_enclave", weight: 0.75, lag: 1, type: "temporal", confidence: 0.78, isInconsistent: false, physicalMechanism: "cloud policy determines enclave architecture" },

  // Kill Chain internal
  { id: "ae11", source: "ooda_latency", target: "killchain_latency", weight: 0.93, lag: 0, type: "directed", confidence: 0.95, isInconsistent: false, physicalMechanism: "OODA loop speed sets kill chain floor" },
  { id: "ae12", source: "hitl_gate", target: "killchain_latency", weight: 0.88, lag: 0, type: "directed", confidence: 0.90, isInconsistent: false, physicalMechanism: "human approval adds latency to kill chain" },
  { id: "ae13", source: "hitl_gate", target: "ooda_latency", weight: 0.72, lag: 0, type: "confounded", confidence: 0.70, isInconsistent: true, physicalMechanism: "autonomy policy constrains OODA optimization" },

  // ─── Cross-Domain Edges ───────────────────────────────────────

  // Drone Swarms → SATCOM
  { id: "ae14", source: "swarm_mesh", target: "milsatcom_bw", weight: 0.82, lag: 0, type: "directed", confidence: 0.85, isInconsistent: false, physicalMechanism: "swarm telemetry consumes protected bandwidth" },

  // SATCOM → ISR Fusion
  { id: "ae15", source: "milsatcom_bw", target: "multiint_fusion", weight: 0.86, lag: 0, type: "directed", confidence: 0.89, isInconsistent: false, physicalMechanism: "SATCOM backhauls ISR data to fusion engine" },

  // ISR Fusion → Kill Chain
  { id: "ae16", source: "multiint_fusion", target: "ooda_latency", weight: 0.91, lag: 0, type: "directed", confidence: 0.94, isInconsistent: false, physicalMechanism: "fusion output feeds observe/orient phases" },
  { id: "ae17", source: "multiint_fusion", target: "killchain_latency", weight: 0.85, lag: 0, type: "directed", confidence: 0.88, isInconsistent: false, physicalMechanism: "fusion latency directly impacts kill chain budget" },

  // Chip Embargo → Drone Swarms
  { id: "ae18", source: "gpu_supply_itar", target: "drone_gpu_alloc", weight: 0.93, lag: 0, type: "directed", confidence: 0.95, isInconsistent: false, physicalMechanism: "ITAR GPU supply constrains drone silicon allocation" },
  { id: "ae19", source: "radhard_fpga", target: "edge_ai_inference", weight: 0.78, lag: 1, type: "directed", confidence: 0.82, isInconsistent: false, physicalMechanism: "rad-hard FPGA used as fallback for edge AI" },

  // Chip Embargo → Secure Compute
  { id: "ae20", source: "gpu_supply_itar", target: "classified_enclave", weight: 0.80, lag: 1, type: "temporal", confidence: 0.83, isInconsistent: false, physicalMechanism: "GPU availability determines enclave compute capacity" },

  // Secure Compute → ISR Fusion
  { id: "ae21", source: "classified_enclave", target: "multiint_fusion", weight: 0.84, lag: 0, type: "directed", confidence: 0.87, isInconsistent: false, physicalMechanism: "enclave provides classified compute for fusion" },

  // SATCOM → Drone Swarms (beyond-line-of-sight)
  { id: "ae22", source: "leo_constellation", target: "swarm_mesh", weight: 0.76, lag: 0, type: "directed", confidence: 0.80, isInconsistent: false, physicalMechanism: "LEO SATCOM enables BLOS swarm coordination" },

  // Kill Chain → Drone Swarms (effects loop)
  { id: "ae23", source: "killchain_latency", target: "swarm_mesh", weight: 0.70, lag: 1, type: "temporal", confidence: 0.74, isInconsistent: false, physicalMechanism: "kill chain budget dictates swarm engagement tempo" },

  // ITAR Gate → SATCOM
  { id: "ae24", source: "itar_ear_gate", target: "leo_constellation", weight: 0.72, lag: 1, type: "temporal", confidence: 0.76, isInconsistent: false, physicalMechanism: "export controls restrict allied LEO access" },

  // Secure Compute ↔ On-prem feedback
  { id: "ae25", source: "scif_infra", target: "onprem_cloud_decision", weight: 0.60, lag: 0, type: "confounded", confidence: 0.65, isInconsistent: true, physicalMechanism: "SCIF constraints bias toward on-prem; policy shifts push to cloud" },

  // ISR Fusion → Secure Compute (data classification drives compute needs)
  { id: "ae26", source: "eoir_sensors", target: "classified_enclave", weight: 0.72, lag: 1, type: "temporal", confidence: 0.76, isInconsistent: false, physicalMechanism: "classified imagery requires IL5+ processing" },

  // Drone Swarms → Kill Chain (direct sensor-to-shooter)
  { id: "ae27", source: "edge_ai_inference", target: "ooda_latency", weight: 0.80, lag: 0, type: "directed", confidence: 0.84, isInconsistent: false, physicalMechanism: "edge AI enables tactical OODA acceleration" },

  // SIGINT → Kill Chain
  { id: "ae28", source: "sigint_collection", target: "killchain_latency", weight: 0.74, lag: 1, type: "temporal", confidence: 0.78, isInconsistent: false, physicalMechanism: "SIGINT tip-off reduces time-to-engagement" },
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

export const ATHENA_GRAPH: CausalGraph = {
  nodes: NODES,
  edges: EDGES,
  metadata: METADATA,
};

// ─── DCD Sub-Graph (for Trinity Panel) ───────────────────────────
export const ATHENA_DCD_NODES: CausalNode[] = NODES.filter(
  (n) => n.discoverySource === "DCD" || n.discoverySource === "merged"
);
export const ATHENA_DCD_EDGES: CausalEdge[] = EDGES.filter(
  (e) =>
    e.type === "directed" &&
    ATHENA_DCD_NODES.some((n) => n.id === e.source) &&
    ATHENA_DCD_NODES.some((n) => n.id === e.target)
);

// ─── PCMCI+ Sub-Graph (temporal) ─────────────────────────────────
export const ATHENA_PCMCI_NODES: CausalNode[] = NODES.filter(
  (n) => n.discoverySource === "PCMCI+" || n.discoverySource === "merged"
);
const temporalEdges = EDGES.filter((e) => e.lag > 0);
const temporalNodeIds = new Set<string>();
temporalEdges.forEach((e) => {
  temporalNodeIds.add(e.source);
  temporalNodeIds.add(e.target);
});
NODES.forEach((n) => {
  if (temporalNodeIds.has(n.id) && !ATHENA_PCMCI_NODES.some((pn) => pn.id === n.id)) {
    ATHENA_PCMCI_NODES.push(n);
  }
});
export const ATHENA_PCMCI_EDGES: CausalEdge[] = EDGES.filter(
  (e) =>
    e.lag > 0 &&
    ATHENA_PCMCI_NODES.some((n) => n.id === e.source) &&
    ATHENA_PCMCI_NODES.some((n) => n.id === e.target)
);

// ─── FCI Sub-Graph (latent confounding) ──────────────────────────
export const ATHENA_FCI_NODES: CausalNode[] = NODES.filter(
  (n) => n.isConfounded || n.discoverySource === "FCI"
);
export const ATHENA_FCI_EDGES: CausalEdge[] = EDGES.filter(
  (e) =>
    e.type === "confounded" ||
    (ATHENA_FCI_NODES.some((n) => n.id === e.source) &&
      ATHENA_FCI_NODES.some((n) => n.id === e.target))
);

// ─── Node Domain Map ─────────────────────────────────────────────
export function athenaGetNodeDomainMap(): Record<string, string> {
  const map: Record<string, string> = {};
  NODES.forEach((n) => { map[n.id] = n.domain; });
  return map;
}

// ─── Bridge Edges (MAIN ↔ ATHENA) ────────────────────────────────
// These edges only become active when BOTH the MAIN graph and the
// ATHENA (Defense & ISR) graph are loaded together. They wire the
// civilian / energy / financial domains into the defense substrate
// so the Defense & ISR cluster is no longer an island when combined
// with another domain workspace.
export const BRIDGE_EDGES: CausalEdge[] = [
  // ── Undersea cable infrastructure ↔ SATCOM / ground segment ──
  {
    id: "br_ic_red_sea__leo_constellation",
    source: "ic_red_sea_exposure",
    target: "leo_constellation",
    weight: 0.65,
    lag: 1,
    type: "directed",
    confidence: 0.7,
    isInconsistent: false,
    physicalMechanism: "Red Sea cable cuts force traffic onto LEO SATCOM, accelerating constellation capacity exhaustion and orbital debris pressure.",
  },
  {
    id: "br_ic_red_sea__milsatcom",
    source: "ic_red_sea_exposure",
    target: "milsatcom_bw",
    weight: 0.55,
    lag: 1,
    type: "directed",
    confidence: 0.65,
    isInconsistent: false,
    physicalMechanism: "Loss of submarine cable redundancy in the Red Sea pushes priority traffic onto protected MILSATCOM, contesting bandwidth allocation for primary defense missions.",
  },
  {
    id: "br_ic_landing_station__ground_terminals",
    source: "ic_landing_station_concentration",
    target: "ground_terminals",
    weight: 0.6,
    lag: 0,
    type: "directed",
    confidence: 0.7,
    isInconsistent: false,
    physicalMechanism: "Cable landing stations and SATCOM ground terminals share coastal real estate, power feeds and security perimeters — concentrated landing sites create correlated terminal exposure.",
  },
  {
    id: "br_ic_telecom_egypt__ground_terminals",
    source: "ic_telecom_egypt",
    target: "ground_terminals",
    weight: 0.5,
    lag: 1,
    type: "directed",
    confidence: 0.65,
    isInconsistent: false,
    physicalMechanism: "Telecom Egypt operates many regional ground stations co-located with cable landings; operator stress propagates into terminal availability for allied SATCOM users.",
  },
  {
    id: "br_ic_repair__leo_constellation",
    source: "ic_repair_complexity",
    target: "leo_constellation",
    weight: 0.45,
    lag: 2,
    type: "temporal",
    confidence: 0.6,
    isInconsistent: false,
    physicalMechanism: "Multi-month cable repair windows extend reliance on LEO SATCOM as the primary intercontinental backbone, accelerating launch cadence demand.",
  },
  {
    id: "br_ic_latency__multiint_fusion",
    source: "ic_latency_risk",
    target: "multiint_fusion",
    weight: 0.55,
    lag: 1,
    type: "directed",
    confidence: 0.65,
    isInconsistent: false,
    physicalMechanism: "Backbone latency degrades the freshness of multi-INT data flowing into fusion engines, eroding cross-domain situational awareness.",
  },

  // ── Energy / power dependencies of secure compute ──
  {
    id: "br_sa_master_gas__classified_enclave",
    source: "sa_master_gas_system",
    target: "classified_enclave",
    weight: 0.5,
    lag: 1,
    type: "temporal",
    confidence: 0.6,
    isInconsistent: false,
    physicalMechanism: "Saudi Master Gas System feeds regional power generation that backs allied data center and classified enclave uptime in the Gulf theater.",
  },
  {
    id: "br_mn_natgas__classified_enclave",
    source: "mn_natural_gas_feedstock_system",
    target: "classified_enclave",
    weight: 0.4,
    lag: 2,
    type: "temporal",
    confidence: 0.55,
    isInconsistent: false,
    physicalMechanism: "Industrial gas feedstock disruptions cascade into regional grid instability, forcing classified enclaves onto generator backup and degrading availability SLAs.",
  },
  {
    id: "br_si_abqaiq__scif_infra",
    source: "si_abqaiq_throughput",
    target: "scif_infra",
    weight: 0.45,
    lag: 2,
    type: "temporal",
    confidence: 0.6,
    isInconsistent: false,
    physicalMechanism: "Abqaiq-scale energy disruptions stress regional power and HVAC needed to maintain TEMPEST-compliant SCIF environments.",
  },

  // ── Maritime chokepoints ↔ kill chain & ISR ──
  {
    id: "br_si_hormuz__killchain",
    source: "si_hormuz_throughput",
    target: "killchain_latency",
    weight: 0.6,
    lag: 1,
    type: "directed",
    confidence: 0.7,
    isInconsistent: false,
    physicalMechanism: "Strait of Hormuz interdiction events compress kill-chain timelines by raising the operational tempo demanded of regional ISR and strike assets.",
  },
  {
    id: "br_qe_ras_laffan__leo_constellation",
    source: "qe_ras_laffan_port",
    target: "leo_constellation",
    weight: 0.4,
    lag: 1,
    type: "temporal",
    confidence: 0.55,
    isInconsistent: false,
    physicalMechanism: "LNG super-tanker routing out of Ras Laffan depends on commercial LEO SATCOM; threat-driven escort patterns shift constellation tasking.",
  },
  {
    id: "br_sc_shipping__leo_constellation",
    source: "sc_shipping_cost_index",
    target: "leo_constellation",
    weight: 0.45,
    lag: 1,
    type: "directed",
    confidence: 0.6,
    isInconsistent: false,
    physicalMechanism: "Elevated shipping cost regimes correlate with convoy operations and surge demand on commercial LEO SATCOM bandwidth for fleet coordination.",
  },
  {
    id: "br_sa_ras_tanura__leo_constellation",
    source: "sa_ras_tanura_terminal",
    target: "leo_constellation",
    weight: 0.4,
    lag: 1,
    type: "temporal",
    confidence: 0.55,
    isInconsistent: false,
    physicalMechanism: "Disruption at Ras Tanura forces tanker rerouting and shadowing operations that increase SATCOM tasking on LEO constellations.",
  },

  // ── Sovereign / financial conditions ↔ defense readiness ──
  {
    id: "br_fc_sovereign_default__milsatcom",
    source: "fc_sovereign_default",
    target: "milsatcom_bw",
    weight: 0.5,
    lag: 3,
    type: "temporal",
    confidence: 0.6,
    isInconsistent: false,
    physicalMechanism: "Sovereign defaults among allied buyers depress sustained MILSATCOM procurement and shared-bandwidth agreements, eroding protected capacity over budget cycles.",
  },
  {
    id: "br_fc_cb_policy__gpu_supply_itar",
    source: "fc_cb_policy_rate",
    target: "gpu_supply_itar",
    weight: 0.4,
    lag: 2,
    type: "temporal",
    confidence: 0.55,
    isInconsistent: false,
    physicalMechanism: "Tighter financial conditions compress capex on advanced fab buildouts, slowing the ITAR-restricted GPU pipeline that feeds defense AI compute.",
  },
  {
    id: "br_sc_strategic_reserves__killchain",
    source: "sc_strategic_reserves",
    target: "killchain_latency",
    weight: 0.4,
    lag: 2,
    type: "temporal",
    confidence: 0.55,
    isInconsistent: false,
    physicalMechanism: "Strategic reserve drawdowns are leading indicators of crisis posture shifts that compress allowable kill-chain decision windows.",
  },

  // ── Chip embargo ↔ civilian comms / financial systems ──
  {
    id: "br_gpu_supply_itar__ic_latency_risk",
    source: "gpu_supply_itar",
    target: "ic_latency_risk",
    weight: 0.4,
    lag: 2,
    type: "temporal",
    confidence: 0.55,
    isInconsistent: false,
    physicalMechanism: "ITAR/export-control disruptions on advanced silicon ripple into telecom routing equipment and DSP refresh cycles, gradually elevating backbone latency.",
  },
  {
    id: "br_itar_gate__qe_north_field_expansion",
    source: "itar_ear_gate",
    target: "qe_north_field_expansion_nfe_nfs",
    weight: 0.35,
    lag: 3,
    type: "temporal",
    confidence: 0.55,
    isInconsistent: false,
    physicalMechanism: "Tightening dual-use export controls on cryogenic compressors and turbine controls slows critical equipment delivery to the North Field expansion program.",
  },

  // ── Macro inflation/policy ↔ defense capex & supply chain ──
  // Closes the missing macro → Athena pathway. Bridge layer previously
  // had inbound edges from energy / supply-chain / financial-contagion
  // but nothing from the macro inflation/labor panel — so a Fed pivot
  // or DXY swing didn't propagate into defense readiness.
  {
    id: "br_ip_fed_funds__gpu_supply_itar",
    source: "ip_fed_funds_effective",
    target: "gpu_supply_itar",
    weight: 0.45,
    lag: 3,
    type: "temporal",
    confidence: 0.6,
    isInconsistent: false,
    physicalMechanism: "Fed tightening raises the cost of capital for advanced fab buildouts (TSMC Arizona, Intel Ohio, Samsung Texas all financed through 2024-2026 hike cycle); ITAR-restricted GPU pipeline lag follows policy by 2-4 quarters as capex decisions reprice.",
  },
  {
    id: "br_ip_dxy__gpu_supply_itar",
    source: "ip_dxy",
    target: "gpu_supply_itar",
    weight: 0.4,
    lag: 2,
    type: "temporal",
    confidence: 0.6,
    isInconsistent: false,
    physicalMechanism: "USD strength compresses dollar-denominated price of imported lithography and metrology equipment (ASML EUV scanners, KLA inspection tools), accelerating allied fab tool-up and downstream GPU availability for ITAR-cleared programs.",
  },
  {
    id: "br_mi_industrial_production__milsatcom",
    source: "mi_industrial_production",
    target: "milsatcom_bw",
    weight: 0.35,
    lag: 6,
    type: "temporal",
    confidence: 0.55,
    isInconsistent: false,
    physicalMechanism: "US industrial-production trend signals defense-industrial-base capacity; sustained IP slowdowns precede MILSATCOM procurement compression as DoD competes with civilian sectors for contracted manufacturing slots.",
  },
];
