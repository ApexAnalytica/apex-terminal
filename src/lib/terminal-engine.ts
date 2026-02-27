import { TerminalLine, CausalShock, ModuleId } from "./types";

let lineCounter = 0;

function makeLine(
  type: TerminalLine["type"],
  content: string,
  module?: ModuleId
): TerminalLine {
  return {
    id: `line-${++lineCounter}`,
    type,
    content,
    timestamp: Date.now(),
    module,
  };
}

interface CommandResult {
  lines: TerminalLine[];
  shockToAdd?: CausalShock;
  shockToRemove?: string;
}

const HELP_TEXT = `
APEX CAUSAL INTELLIGENCE TERMINAL v2.0
══════════════════════════════════════════
Available Commands:
  STRESS_TEST:<SCENARIO>    Inject a causal shock into the system
  DERIVE_ORIGIN:<QUERY>     Trace causal origin of a phenomenon
  COUNTERFACTUAL:<QUERY>    Pearl module — "What If" reasoning
  VERIFY:<STATEMENT>        Tarski module — Physical truth check
  STATUS                    Display current Ω-state
  SHOCKS                    List available shock scenarios
  MITIGATE:<SHOCK_ID>       Remove an active shock
  CLEAR                     Clear terminal
  HELP                      Show this message
`.trim();

const SHOCK_MAP: Record<string, CausalShock> = {
  TAIWAN_BLOCKADE: {
    id: "taiwan_blockade",
    name: "TAIWAN STRAIT BLOCKADE",
    severity: 0.45,
    category: "geopolitical",
    description: "PLA naval exclusion zone — TSMC fab access denied",
    physicalConstraint: "EUV lithography: single-source dependency (ASML)",
  },
  SUBSEA_CABLE_CUT: {
    id: "subsea_cable_cut",
    name: "SUBSEA CABLE SEVERANCE",
    severity: 0.25,
    category: "supply",
    description: "Trans-Pacific fiber optic backbone severed at Luzon Strait",
  },
  HBM_YIELD_FAILURE: {
    id: "hbm_yield_failure",
    name: "HBM YIELD COLLAPSE",
    severity: 0.3,
    category: "compute",
    description: "HBM4 yield drops below 40%",
    physicalConstraint: "Thermal density limit: 25W/cm²",
  },
  GRID_CASCADE: {
    id: "grid_cascade",
    name: "GRID CASCADE FAILURE",
    severity: 0.35,
    category: "energy",
    description: "ERCOT grid destabilization — 4.2GW load shed",
  },
  COOLANT_SHORTAGE: {
    id: "coolant_shortage",
    name: "COOLANT SUPPLY DISRUPTION",
    severity: 0.2,
    category: "cooling",
    description: "3M Novec phase-out — no replacement coolant",
  },
  RARE_EARTH_EMBARGO: {
    id: "rare_earth_embargo",
    name: "RARE EARTH EMBARGO",
    severity: 0.3,
    category: "supply",
    description: "China restricts Ga/Ge exports",
  },
  CARRINGTON_EVENT: {
    id: "solar_flare",
    name: "CARRINGTON-CLASS CME",
    severity: 0.55,
    category: "energy",
    description: "X45+ solar flare — GIC in power grid",
  },
};

export function processCommand(
  rawInput: string,
  activeShocks: CausalShock[]
): CommandResult {
  const input = rawInput.trim().toUpperCase();
  const lines: TerminalLine[] = [];

  if (input === "HELP") {
    lines.push(makeLine("system", HELP_TEXT));
    return { lines };
  }

  if (input === "CLEAR") {
    return { lines: [makeLine("system", "__CLEAR__")] };
  }

  if (input === "STATUS") {
    const totalSev = activeShocks.reduce((s, sh) => s + sh.severity, 0);
    const buffer = Math.max(0, 100 - totalSev * 100);
    lines.push(
      makeLine("system", `Ω-STATE REPORT`, "pareto"),
      makeLine("output", `  Criticality Buffer: ${buffer.toFixed(1)}%`),
      makeLine("output", `  Active Shocks: ${activeShocks.length}`),
      makeLine(
        "output",
        `  System Status: ${buffer < 15 ? "OMEGA_BREACH" : buffer < 35 ? "CRITICAL" : buffer < 65 ? "ELEVATED" : "NOMINAL"}`
      )
    );
    activeShocks.forEach((s) => {
      lines.push(
        makeLine("warning", `    ▸ ${s.name} [severity: ${(s.severity * 100).toFixed(0)}%]`)
      );
    });
    return { lines };
  }

  if (input === "SHOCKS") {
    lines.push(makeLine("system", "AVAILABLE SHOCK SCENARIOS:"));
    Object.entries(SHOCK_MAP).forEach(([key, shock]) => {
      const active = activeShocks.some((s) => s.id === shock.id);
      lines.push(
        makeLine(
          active ? "warning" : "output",
          `  ${key} — ${shock.description} ${active ? "[ACTIVE]" : ""}`
        )
      );
    });
    return { lines };
  }

  if (input.startsWith("STRESS_TEST:")) {
    const scenario = input.replace("STRESS_TEST:", "").trim();
    const shock = SHOCK_MAP[scenario];
    if (!shock) {
      lines.push(
        makeLine("error", `Unknown scenario: ${scenario}`),
        makeLine("system", `Available: ${Object.keys(SHOCK_MAP).join(", ")}`)
      );
      return { lines };
    }
    if (activeShocks.some((s) => s.id === shock.id)) {
      lines.push(makeLine("warning", `Shock already active: ${shock.name}`));
      return { lines };
    }
    lines.push(
      makeLine("system", `[PARETO] Injecting causal shock...`, "pareto"),
      makeLine("warning", `  ▸ ${shock.name}`),
      makeLine("output", `  ▸ ${shock.description}`),
      makeLine(
        "output",
        `  ▸ Severity: ${(shock.severity * 100).toFixed(0)}%`
      )
    );
    if (shock.physicalConstraint) {
      lines.push(
        makeLine("system", `  ▸ Physical Constraint: ${shock.physicalConstraint}`, "tarski")
      );
    }
    return { lines, shockToAdd: shock };
  }

  if (input.startsWith("MITIGATE:")) {
    const shockId = input.replace("MITIGATE:", "").trim().toLowerCase();
    const found = activeShocks.find(
      (s) => s.id === shockId || s.name.toUpperCase().includes(shockId)
    );
    if (!found) {
      lines.push(makeLine("error", `No active shock matching: ${shockId}`));
      return { lines };
    }
    lines.push(
      makeLine("system", `[SPIRTES] Mitigating causal shock...`, "spirtes"),
      makeLine("output", `  ▸ Removed: ${found.name}`)
    );
    return { lines, shockToRemove: found.id };
  }

  if (input.startsWith("DERIVE_ORIGIN:")) {
    const query = input.replace("DERIVE_ORIGIN:", "").trim();
    lines.push(
      makeLine("system", `[SPIRTES] Tracing causal origin...`, "spirtes"),
      makeLine("output", `  Query: "${query}"`),
      makeLine("output", `  ▸ Scanning causal graph for root nodes...`),
      makeLine("output", `  ▸ Identified 3 primary causal pathways`),
      makeLine("output", `  ▸ Origin Hypothesis: Physical supply chain constraint`),
      makeLine(
        "output",
        `  ▸ Confidence: 0.87 | Causal Depth: 4 edges from terminal node`
      )
    );
    return { lines };
  }

  if (input.startsWith("COUNTERFACTUAL:")) {
    const query = input.replace("COUNTERFACTUAL:", "").trim();
    lines.push(
      makeLine("system", `[PEARL] Counterfactual reasoning engine...`, "pearl"),
      makeLine("output", `  Hypothesis: "${query}"`),
      makeLine("output", `  ▸ Constructing structural causal model...`),
      makeLine("output", `  ▸ Interventional distribution computed`),
      makeLine("output", `  ▸ P(Y|do(X)) diverges from P(Y|X) by Δ=0.34`),
      makeLine(
        "output",
        `  ▸ Conclusion: Intervention shows significant causal effect`
      )
    );
    return { lines };
  }

  if (input.startsWith("VERIFY:")) {
    const statement = input.replace("VERIFY:", "").trim();
    const violatesPhysics =
      statement.includes("EXCEED") ||
      statement.includes("INFINITE") ||
      statement.includes("PERPETUAL") ||
      statement.includes("100% EFFICIENCY");
    lines.push(
      makeLine("system", `[TARSKI] Physical truth verification...`, "tarski"),
      makeLine("output", `  Statement: "${statement}"`)
    );
    if (violatesPhysics) {
      lines.push(
        makeLine("error", `  ╔══════════════════════════════════════════╗`),
        makeLine("error", `  ║  PHYSICAL CONSTRAINT VIOLATION DETECTED  ║`),
        makeLine("error", `  ╚══════════════════════════════════════════╝`),
        makeLine("error", `  ▸ Statement violates known physical laws`),
        makeLine(
          "error",
          `  ▸ Tech 1.0 hallucination rejected by Tarski module`
        )
      );
    } else {
      lines.push(
        makeLine("output", `  ▸ No physical constraint violations detected`),
        makeLine("output", `  ▸ Statement consistent with known causal model`)
      );
    }
    return { lines };
  }

  lines.push(
    makeLine("error", `Unrecognized command: ${rawInput.trim()}`),
    makeLine("system", `Type HELP for available commands`)
  );
  return { lines };
}
