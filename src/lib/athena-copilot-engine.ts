import { CopilotMessage, ModuleId, CausalGraph } from "./types";

let msgCounter = 0;

function makeMsg(
  role: CopilotMessage["role"],
  content: string,
  module?: ModuleId
): CopilotMessage {
  return {
    id: `acop-${++msgCounter}-${Date.now()}`,
    role,
    content,
    timestamp: Date.now(),
    module,
  };
}

export type AthenaCopilotAction =
  | "DISCOVER_ISR_STRUCTURE"
  | "VERIFY_KILL_CHAIN"
  | "ASSESS_EMBARGO_RISK";

export function processAction(
  action: AthenaCopilotAction,
  graph: CausalGraph
): CopilotMessage[] {
  const domains = [...new Set(graph.nodes.map((n) => n.domain))];
  const topNode = [...graph.nodes].sort(
    (a, b) => b.omegaFragility.composite - a.omegaFragility.composite
  )[0];

  switch (action) {
    case "DISCOVER_ISR_STRUCTURE":
      return [
        makeMsg(
          "assistant",
          `[SPIRTES] Running DCD + NOTEARS structural discovery on ISR supply chain...\n\n` +
            `Identified ${graph.metadata.totalNodes} causal nodes across ${graph.metadata.totalEdges} directed edges.\n` +
            `ISR Domains: ${domains.join(", ")}\n` +
            `Graph density: ${graph.metadata.density.toFixed(3)}\n` +
            `Discovery method: ${graph.metadata.constraintType}\n\n` +
            `Highest Ω-Fragility: ${topNode.label} (Ω ${topNode.omegaFragility.composite.toFixed(1)}) — ${topNode.globalConcentration}\n\n` +
            `ISR architecture analysis:\n` +
            `  • Drone Swarms — edge AI inference drives swarm autonomy\n` +
            `  • SATCOM — protected MILSATCOM bandwidth is critical backhaul\n` +
            `  • ISR Fusion — Multi-INT fusion engine is highest-downstream-load node\n` +
            `  • Chip Embargo — ITAR GPU supply chain is single-thread failure\n` +
            `  • Secure Compute — IL5/IL6 enclave accreditation bottleneck\n` +
            `  • Kill Chain — OODA loop latency bounded by human-in-the-loop gate\n\n` +
            `Cross-domain cascades: Chip Embargo → Drone Swarms → SATCOM → ISR Fusion → Kill Chain.\n\n` +
            `Structure locked. Awaiting Tarski verification pass.`,
          "spirtes"
        ),
      ];

    case "VERIFY_KILL_CHAIN":
      return [
        makeMsg(
          "assistant",
          `[PEARL] Kill chain causal verification via do-calculus...\n\n` +
            `Testing interventional consistency across sensor-to-shooter path:\n` +
            `  • do(Multi-INT Fusion = offline) → OODA loop collapses (Ω 9.7 → kill chain stall)\n` +
            `  • do(MILSATCOM BW = degraded) → Fusion data loss → OODA latency +340%\n` +
            `  • do(Edge AI = disabled) → Swarm autonomy lost → manual C2 fallback\n` +
            `  • do(Human-in-Loop = removed) → Kill chain latency -65% but LOAC violation risk\n\n` +
            `End-to-end kill chain path:\n` +
            `  EO/IR Sensors → Multi-INT Fusion → OODA Loop → Kill Chain Budget\n` +
            `  SIGINT Collection → Multi-INT Fusion → Kill Chain Budget\n` +
            `  Edge AI → OODA Loop (tactical acceleration)\n\n` +
            `Critical finding: Human-in-the-Loop Gate introduces confounded relationship with OODA latency.\n` +
            `DoD Directive 3000.09 compliance requires gate retention despite latency cost.\n\n` +
            `Pearl Engine status: Kill chain verified. JADC2 latency budget at OMEGA-CRITICAL.`,
          "pearl"
        ),
      ];

    case "ASSESS_EMBARGO_RISK":
      return [
        makeMsg(
          "assistant",
          `[TARSKI] Embargo risk assessment — ITAR/EAR compliance scan...\n\n` +
            `Detected: ${graph.metadata.inconsistentEdges} inconsistent edge(s)\n` +
            `Restricted: ${graph.metadata.restrictedNodes} node(s) under export control\n\n` +
            `ITAR Category XI exposure:\n` +
            `  • GPU Supply Chain — 100% TSMC advanced node dependency\n` +
            `  • Rad-Hard FPGA — Microchip/AMD duopoly, SOI process single-source\n` +
            `  • Protected MILSATCOM — sole-source Lockheed/Northrop transponders\n\n` +
            `Embargo cascade analysis:\n` +
            `  do(ITAR GPU Supply = embargo) →\n` +
            `    Drone GPU Allocation (Ω 9.6) → Edge AI Inference (Ω 9.4) →\n` +
            `    Swarm Mesh (Ω 9.1) → MILSATCOM consumption drops\n` +
            `    + Classified Enclave capacity (Ω 9.6) reduced 40%\n\n` +
            `  do(EAR LEO Constellation = restricted) →\n` +
            `    Allied BLOS capability degraded → Swarm range limited to LOS\n\n` +
            `Mitigation: Secure domestic FPGA fab + expand GovCloud enclave capacity.\n` +
            `SCIF infrastructure at ${graph.nodes.find(n => n.id === "scif_infra")?.omegaFragility.composite.toFixed(1) ?? "N/A"} Ω — moderate substitution friction.`,
          "tarski"
        ),
      ];
  }
}

export function processNodeAnalysis(
  nodeId: string,
  graph: CausalGraph
): CopilotMessage[] {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) return [makeMsg("assistant", "Node not found in ISR graph.")];

  const inEdges = graph.edges.filter((e) => e.target === nodeId);
  const outEdges = graph.edges.filter((e) => e.source === nodeId);
  const omega = node.omegaFragility;

  const upstreamNames = inEdges
    .map((e) => {
      const src = graph.nodes.find((n) => n.id === e.source);
      return src ? `${src.shortLabel} (${e.physicalMechanism})` : e.source;
    })
    .join(", ");

  const downstreamNames = outEdges
    .map((e) => {
      const tgt = graph.nodes.find((n) => n.id === e.target);
      return tgt ? `${tgt.shortLabel} (${e.physicalMechanism})` : e.target;
    })
    .join(", ");

  const tier =
    omega.composite > 9
      ? "OMEGA-CRITICAL"
      : omega.composite >= 7
        ? "HIGH RISK"
        : omega.composite >= 5
          ? "ELEVATED"
          : "MODERATE";

  return [
    makeMsg(
      "assistant",
      `[NODE ANALYSIS] ${node.label}\n` +
        `Domain: ${node.domain} | Category: ${node.category}\n` +
        `Risk Tier: ${tier}\n\n` +
        `Ω-Fragility Breakdown:\n` +
        `  Composite:             ${omega.composite.toFixed(1)} / 10\n` +
        `  Irreplaceability:      ${omega.irreplaceability.toFixed(1)} / 10\n` +
        `  Restoration Latency:   ${omega.restorationLatency.toFixed(1)} / 10\n` +
        `  Jurisdictional Hazard: ${omega.jurisdictionalHazard.toFixed(1)} / 10\n` +
        `  Cascade Load:          ${omega.cascadeLoad.toFixed(1)} / 10\n` +
        `  Tail Depth:            ${omega.tailDepth.toFixed(1)} / 10\n\n` +
        `Global Concentration: ${node.globalConcentration}\n` +
        `Replacement Time: ${node.replacementTime}\n` +
        (node.physicalConstraint ? `Physical Constraint: ${node.physicalConstraint}\n` : "") +
        `Discovery Source: ${node.discoverySource}\n` +
        (node.isConfounded ? `⚠ Confounded variable — latent policy/doctrine variable suspected\n` : "") +
        (node.isRestricted ? `⚠ ITAR-restricted — export control compliance required\n` : "") +
        `\nUpstream (${inEdges.length}): ${upstreamNames || "none"}\n` +
        `Downstream (${outEdges.length}): ${downstreamNames || "none"}\n\n` +
        `Intervention impact: do(${node.shortLabel}) would sever ${inEdges.length} upstream edge(s) and propagate through ${outEdges.length} downstream path(s).`
    ),
  ];
}

export function processQuery(
  query: string,
  graph: CausalGraph
): CopilotMessage[] {
  const q = query.trim().toUpperCase();
  const topNodes = [...graph.nodes]
    .sort((a, b) => b.omegaFragility.composite - a.omegaFragility.composite)
    .slice(0, 5);

  if (q.includes("RISK") || q.includes("PROPAGAT") || q.includes("CASCADE")) {
    return [
      makeMsg(
        "assistant",
        `ISR risk propagation analysis (cross-domain Ω-cascade):\n\n` +
          `Root chokepoints by Ω-Fragility:\n` +
          topNodes
            .map(
              (n, i) =>
                `  ${i + 1}. ${n.label} (Ω ${n.omegaFragility.composite.toFixed(1)}) — ${n.domain} — ${n.globalConcentration}`
            )
            .join("\n") +
          `\n\nKey ISR cascade chains:\n` +
          `  GPU Supply (ITAR) → Drone GPU → Edge AI → Swarm Mesh → MILSATCOM → Fusion → Kill Chain\n` +
          `  EO/IR Sensors → Multi-INT Fusion → OODA Loop → Kill Chain Latency\n` +
          `  ITAR/EAR Gate → GPU Supply → Classified Enclave → Fusion Engine\n\n` +
          `Total ISR risk exposure: OMEGA-CRITICAL across 6 defense domains.`,
        "spirtes"
      ),
    ];
  }

  if (q.includes("COUNTERFACT") || q.includes("WHAT IF") || q.includes("DO(")) {
    return [
      makeMsg(
        "assistant",
        `[PEARL] Counterfactual engine activated for ISR operations.\n\n` +
          `Constructing structural causal model from ${graph.metadata.totalNodes}-node ISR DAG...\n` +
          `Applying do-calculus across ${[...new Set(graph.nodes.map((n) => n.domain))].length} defense domains.\n\n` +
          `Available intervention targets:\n` +
          topNodes.map((n) => `  • ${n.label} (Ω ${n.omegaFragility.composite.toFixed(1)}, ${n.domain})`).join("\n") +
          `\n\nSuggested scenarios:\n` +
          `  • do(GPU Supply ITAR = embargo) — total drone fleet degradation\n` +
          `  • do(MILSATCOM = jammed) — BLOS swarm ops impossible\n` +
          `  • do(Human-in-Loop = autonomous) — kill chain latency reduced but LOAC risk\n\n` +
          `Use INTERVENTION MODE on the DAG to select do(X) targets.`,
        "pearl"
      ),
    ];
  }

  if (q.includes("SHOCK") || q.includes("INJECT") || q.includes("STRESS") || q.includes("ATTACK")) {
    return [
      makeMsg(
        "assistant",
        `Shock injection available via the CDΩ buffer system.\n\n` +
          `Available ISR scenarios:\n` +
          `  TAIWAN_BLOCKADE — TSMC GPU supply severed\n` +
          `  SATCOM_JAMMING — protected MILSATCOM degraded\n` +
          `  ITAR_EMBARGO_EXPANSION — allied GPU access restricted\n` +
          `  SCIF_BREACH — classified enclave compromised\n` +
          `  SWARM_COMM_LOSS — mesh network disrupted\n` +
          `  OODA_COLLAPSE — fusion engine offline\n` +
          `  KESSLER_EVENT — LEO constellation degraded\n\n` +
          `Cross-domain cascades will propagate through ${graph.metadata.totalEdges} edges across ${[...new Set(graph.nodes.map((n) => n.domain))].length} ISR domains.\n\n` +
          `Use the terminal command STRESS_TEST:<SCENARIO> or inject via the shock panel.`,
        "pareto"
      ),
    ];
  }

  if (q.includes("ITAR") || q.includes("EXPORT") || q.includes("EMBARGO") || q.includes("COMPLIANCE")) {
    return [
      makeMsg(
        "assistant",
        `ITAR/EAR compliance analysis:\n\n` +
          `Export-controlled nodes in ISR graph:\n` +
          graph.nodes
            .filter((n) => n.isRestricted)
            .map((n) => `  • ${n.label} (Ω ${n.omegaFragility.composite.toFixed(1)}) — ${n.domain}`)
            .join("\n") +
          `\n\nITAR Category XI items:\n` +
          `  • GPU silicon (advanced node fab)\n` +
          `  • Rad-hard FPGA (SOI process)\n` +
          `  • Protected MILSATCOM transponders\n` +
          `  • SIGINT collection systems\n\n` +
          `DDTC license processing: 90-180 day latency.\n` +
          `Deemed export risk: foreign national access to ITAR technical data.\n\n` +
          `Recommendation: Run ASSESS EMBARGO RISK for full cascade analysis.`,
        "tarski"
      ),
    ];
  }

  return [
    makeMsg(
      "assistant",
      `Analyzing: "${query}"\n\n` +
        `The ISR causal graph contains ${graph.metadata.totalNodes} nodes and ${graph.metadata.totalEdges} edges across ${[...new Set(graph.nodes.map((n) => n.domain))].length} defense domains.\n` +
        `Highest Ω-Fragility: ${topNodes[0]?.label} (Ω ${topNodes[0]?.omegaFragility.composite.toFixed(1)})\n\n` +
        `Use the action buttons for structured ISR analysis, or ask about risk propagation, kill chain verification, ITAR compliance, or shock scenarios.`
    ),
  ];
}
