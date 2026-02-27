import { CausalShock, OmegaState } from "./types";

const PRESET_SHOCKS: CausalShock[] = [
  {
    id: "subsea_cable_cut",
    name: "SUBSEA CABLE SEVERANCE",
    severity: 0.25,
    category: "supply",
    description: "Trans-Pacific fiber optic backbone severed at Luzon Strait",
    physicalConstraint: "Signal propagation limit: 2/3c in fiber",
  },
  {
    id: "hbm_yield_failure",
    name: "HBM YIELD COLLAPSE",
    severity: 0.3,
    category: "compute",
    description: "SK Hynix HBM4 yield drops below 40% — DRAM thermal envelope exceeded",
    physicalConstraint: "Thermal density limit: 25W/cm² for 3D stacking",
  },
  {
    id: "taiwan_blockade",
    name: "TAIWAN STRAIT BLOCKADE",
    severity: 0.45,
    category: "geopolitical",
    description: "PLA naval exclusion zone — TSMC fab access denied",
    physicalConstraint: "EUV lithography: single-source dependency (ASML)",
  },
  {
    id: "grid_cascade",
    name: "GRID CASCADE FAILURE",
    severity: 0.35,
    category: "energy",
    description: "ERCOT grid destabilization — 4.2GW datacenter load shed",
    physicalConstraint: "Carnot efficiency floor: η < 0.65 at ambient >45°C",
  },
  {
    id: "coolant_shortage",
    name: "COOLANT SUPPLY DISRUPTION",
    severity: 0.2,
    category: "cooling",
    description: "3M Novec phase-out — no drop-in immersion coolant replacement",
    physicalConstraint: "Boiling point constraint: Tb must be 49-61°C for 2-phase",
  },
  {
    id: "rare_earth_embargo",
    name: "RARE EARTH EMBARGO",
    severity: 0.3,
    category: "supply",
    description: "China restricts Gallium/Germanium exports — III-V compound shortage",
    physicalConstraint: "Bandgap engineering requires Ga concentration >99.9999%",
  },
  {
    id: "solar_flare",
    name: "CARRINGTON-CLASS CME",
    severity: 0.55,
    category: "energy",
    description: "X45+ solar flare — geomagnetically induced currents in power grid",
    physicalConstraint: "GIC threshold: >100A/phase in HV transformers",
  },
];

export function getPresetShocks(): CausalShock[] {
  return PRESET_SHOCKS;
}

export function computeOmegaState(shocks: CausalShock[]): OmegaState {
  const totalSeverity = shocks.reduce((sum, s) => sum + s.severity, 0);
  const buffer = Math.max(0, Math.min(100, 100 - totalSeverity * 100));

  let status: OmegaState["status"] = "NOMINAL";
  if (buffer < 15) status = "OMEGA_BREACH";
  else if (buffer < 35) status = "CRITICAL";
  else if (buffer < 65) status = "ELEVATED";

  return {
    buffer,
    shocks,
    status,
    lastUpdate: Date.now(),
  };
}

export function getStatusColor(status: OmegaState["status"]): string {
  switch (status) {
    case "NOMINAL":
      return "var(--accent-green)";
    case "ELEVATED":
      return "var(--accent-amber)";
    case "CRITICAL":
      return "var(--accent-red)";
    case "OMEGA_BREACH":
      return "var(--accent-red)";
  }
}

export function getFragilityForCategory(
  shocks: CausalShock[],
  category: string
): number {
  const relevant = shocks.filter((s) => s.category === category);
  if (relevant.length === 0) return 0;
  return Math.min(1, relevant.reduce((sum, s) => sum + s.severity, 0));
}
