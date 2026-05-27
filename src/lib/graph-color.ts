import type { CausalGraph } from "./types";

// ─── Empty Graph (lightweight constant) ──────────────────────────
// Lives here (rather than in graph-data.ts) so that consumers needing
// only a placeholder graph don't pull the full 3000-line dataset.
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
    case "Saudi Aramco Energy": return "#00e676";
    case "QatarEnergy LNG": return "#00e5ff";
    case "QAFCO Fertilizer": return "#76ff03";
    case "Ma'aden Phosphate": return "#ffab00";
    case "Financial Contagion": return "#ff6d00";
    case "Sovereign Risk": return "#ffab00";
    case "Supply Chain Food Security": return "#00e5ff";
    case "Undersea Cable Infrastructure": return "#7c4dff";
    case "Macro Impact: Labor, Growth & Housing": return "#40c4ff";
    case "Macro Impact: Inflation & Policy": return "#ff80ab";
    // Defense & ISR (ATHENA) domains
    case "Drone Swarms": return "#ff4081";       // pink
    case "SATCOM": return "#448aff";             // blue
    case "ISR Fusion": return "#ea80fc";         // purple-pink
    case "Chip Embargo": return "#ff9100";       // deep orange
    case "Secure Compute": return "#69f0ae";     // mint green
    case "Kill Chain": return "#ff1744";         // red
    // Life sciences (T1D β-cell) domains
    case "T1D Autoimmune": return "#ff80ab";     // soft pink
    case "T1D β-cell Biology": return "#40c4ff"; // T1D brand cyan
    case "T1D Metabolic": return "#69f0ae";      // mint green
    case "T1D Intervention": return "#ffab00";   // amber
    case "T1D Complications": return "#ff6d00";  // deep orange
    // AI Safety / endogenous catastrophe (Ghauri 2025 D.Eng.)
    case "AI Safety / IDS": return "#7B68EE";    // medium slate violet
    default: return "#5a5e72";
  }
}
