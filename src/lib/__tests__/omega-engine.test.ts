import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  computeOmegaState,
  computeDoomsdayState,
  computeAlertLevel,
  computeCascadeAnalysis,
  getPresetShocks,
  getStatusColor,
  getFragilityForCategory,
} from "@/lib/omega-engine";
import { CausalShock } from "@/lib/types";
import {
  linearGraph,
  unstableGraph,
  emptyGraph,
  singleNodeGraph,
  makeShock,
} from "./fixtures/graph-fixtures";

// ─── computeOmegaState ─────────────────────────────────────────

describe("computeOmegaState", () => {
  it("returns buffer=100 and NOMINAL for no shocks", () => {
    const state = computeOmegaState([]);
    expect(state.buffer).toBe(100);
    expect(state.status).toBe("NOMINAL");
  });

  it("computes buffer = 100 - totalSeverity*100", () => {
    const shocks = [makeShock({ id: "s1", severity: 0.3 })];
    const state = computeOmegaState(shocks);
    expect(state.buffer).toBeCloseTo(70, 5);
  });

  it("clamps buffer to [0, 100]", () => {
    const shocks = [makeShock({ id: "s1", severity: 0.8 }), makeShock({ id: "s2", severity: 0.5 })];
    const state = computeOmegaState(shocks);
    expect(state.buffer).toBe(0); // 100 - 130 → clamped to 0
  });

  it("returns ELEVATED when buffer is in [35, 65)", () => {
    const shocks = [makeShock({ id: "s1", severity: 0.5 })]; // buffer=50
    const state = computeOmegaState(shocks);
    expect(state.status).toBe("ELEVATED");
  });

  it("returns CRITICAL when buffer is in [15, 35)", () => {
    const shocks = [makeShock({ id: "s1", severity: 0.7 })]; // buffer=30
    const state = computeOmegaState(shocks);
    expect(state.status).toBe("CRITICAL");
  });

  it("returns OMEGA_BREACH when buffer < 15", () => {
    const shocks = [makeShock({ id: "s1", severity: 0.9 })]; // buffer=10
    const state = computeOmegaState(shocks);
    expect(state.status).toBe("OMEGA_BREACH");
  });

  it("includes lastUpdate as a number", () => {
    const state = computeOmegaState([]);
    expect(typeof state.lastUpdate).toBe("number");
  });

  it("includes shocks array in returned state", () => {
    const shocks = [makeShock({ id: "s1" })];
    const state = computeOmegaState(shocks);
    expect(state.shocks).toBe(shocks);
  });
});

// ─── getStatusColor ─────────────────────────────────────────────

describe("getStatusColor", () => {
  it("returns green for NOMINAL", () => {
    expect(getStatusColor("NOMINAL")).toContain("green");
  });

  it("returns amber for ELEVATED", () => {
    expect(getStatusColor("ELEVATED")).toContain("amber");
  });

  it("returns red for CRITICAL", () => {
    expect(getStatusColor("CRITICAL")).toContain("red");
  });

  it("returns red for OMEGA_BREACH", () => {
    expect(getStatusColor("OMEGA_BREACH")).toContain("red");
  });
});

// ─── getFragilityForCategory ────────────────────────────────────

describe("getFragilityForCategory", () => {
  it("returns 0 for no matching shocks", () => {
    expect(getFragilityForCategory([makeShock({ id: "s", category: "energy" })], "compute")).toBe(0);
  });

  it("sums severities for matching category, clamped to 1", () => {
    const shocks = [
      makeShock({ id: "s1", severity: 0.6, category: "energy" }),
      makeShock({ id: "s2", severity: 0.6, category: "energy" }),
    ];
    expect(getFragilityForCategory(shocks, "energy")).toBe(1); // 1.2 clamped
  });
});

// ─── computeDoomsdayState ───────────────────────────────────────

describe("computeDoomsdayState", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("computes fragilityIndex = min(100, severity*50 + (100-buffer)*0.5)", () => {
    const shocks = [makeShock({ id: "s", severity: 0.4 })];
    const d = computeDoomsdayState(shocks, 60);
    // 0.4*50 + (100-60)*0.5 = 20 + 20 = 40
    expect(d.fragilityIndex).toBeCloseTo(40, 5);
  });

  it("clamps fragilityIndex to [0, 100]", () => {
    const shocks = [makeShock({ id: "s", severity: 2.0 })];
    const d = computeDoomsdayState(shocks, 0);
    expect(d.fragilityIndex).toBe(100);
  });

  it("computes timeToFailureDays = max(3, round(365 * buffer/100))", () => {
    const d = computeDoomsdayState([], 50);
    expect(d.timeToFailureDays).toBe(Math.round(365 * 0.5)); // 183
  });

  it("clamps timeToFailureDays minimum to 3", () => {
    const d = computeDoomsdayState([], 0);
    expect(d.timeToFailureDays).toBe(3);
  });

  it("detects regimeType STABLE when fragilityIndex <= 20", () => {
    const d = computeDoomsdayState([], 100);
    expect(d.regimeType).toBe("STABLE");
  });

  it("detects regimeType STAGNATION when fragilityIndex in (20,40]", () => {
    const shocks = [makeShock({ id: "s", severity: 0.5 })];
    const d = computeDoomsdayState(shocks, 90);
    // fragility = 0.5*50 + 10*0.5 = 30
    expect(d.regimeType).toBe("STAGNATION");
  });

  it("detects regimeType MELT_UP when fragilityIndex in (40,60]", () => {
    const shocks = [makeShock({ id: "s", severity: 0.8 })];
    const d = computeDoomsdayState(shocks, 60);
    // fragility = 0.8*50 + 40*0.5 = 60
    expect(d.regimeType).toBe("MELT_UP");
  });

  it("detects regimeType PHASE_TRANSITION when fragilityIndex in (60,80]", () => {
    const shocks = [makeShock({ id: "s", severity: 1.0 })];
    const d = computeDoomsdayState(shocks, 40);
    // fragility = 1.0*50 + 60*0.5 = 80
    expect(d.regimeType).toBe("PHASE_TRANSITION");
  });

  it("detects regimeType CRASH when fragilityIndex > 80", () => {
    const shocks = [makeShock({ id: "s", severity: 1.5 })];
    const d = computeDoomsdayState(shocks, 10);
    // fragility = min(100, 1.5*50 + 90*0.5) = min(100, 120) = 100
    expect(d.regimeType).toBe("CRASH");
  });

  it("detects dragonKing when fragilityIndex > 70", () => {
    const shocks = [makeShock({ id: "s", severity: 1.2 })];
    const d = computeDoomsdayState(shocks, 20);
    expect(d.dragonKingDetected).toBe(true);
  });

  it("dragonKingProbability = clamp((fragility-50)/50, 0, 1)", () => {
    const shocks = [makeShock({ id: "s", severity: 0.8 })];
    const d = computeDoomsdayState(shocks, 60);
    // fragility = 60, P = (60-50)/50 = 0.2
    expect(d.dragonKingProbability).toBeCloseTo(0.2, 5);
  });

  it("computes LPPLS oscillation frequency = 6.36 + severity*2.1", () => {
    const shocks = [makeShock({ id: "s", severity: 0.5 })];
    const d = computeDoomsdayState(shocks, 50);
    expect(d.lpplsOscFreq).toBeCloseTo(6.36 + 0.5 * 2.1, 5);
  });

  it("singularityScore > 0 only when fragilityIndex > 60", () => {
    const low = computeDoomsdayState([], 100);
    expect(low.singularityScore).toBe(0);

    const shocks = [makeShock({ id: "s", severity: 1.0 })];
    const high = computeDoomsdayState(shocks, 40);
    // fragility = 80 → singularity = 80/100 = 0.8
    expect(high.singularityScore).toBeCloseTo(0.8, 5);
  });
});

// ─── computeAlertLevel ──────────────────────────────────────────

describe("computeAlertLevel", () => {
  const lowDoom = { timeToFailureDays: 100, fragilityIndex: 20 } as any;
  const highDoom = { timeToFailureDays: 10, fragilityIndex: 80 } as any;
  const medDoom = { timeToFailureDays: 100, fragilityIndex: 50 } as any;

  it("returns RED for OMEGA_BREACH", () => {
    expect(computeAlertLevel("OMEGA_BREACH", lowDoom)).toBe("RED");
  });

  it("returns RED for CRITICAL", () => {
    expect(computeAlertLevel("CRITICAL", lowDoom)).toBe("RED");
  });

  it("returns RED when timeToFailureDays < 30", () => {
    expect(computeAlertLevel("NOMINAL", highDoom)).toBe("RED");
  });

  it("returns AMBER for ELEVATED status", () => {
    expect(computeAlertLevel("ELEVATED", lowDoom)).toBe("AMBER");
  });

  it("returns AMBER when fragilityIndex > 40", () => {
    expect(computeAlertLevel("NOMINAL", medDoom)).toBe("AMBER");
  });

  it("returns GREEN for NOMINAL with low fragility", () => {
    expect(computeAlertLevel("NOMINAL", lowDoom)).toBe("GREEN");
  });
});

// ─── computeCascadeAnalysis ────────────────────────────────────

describe("computeCascadeAnalysis", () => {
  it("computes lambdaMax as max weighted row sum of adjacency", () => {
    const graph = linearGraph();
    // A: weight 0.7, B: weight 0.6, C: 0 → max = 0.7
    const analysis = computeCascadeAnalysis(graph);
    expect(analysis.lambdaMax).toBeCloseTo(0.7, 5);
  });

  it("reports isStable=true when lambdaMax < 1.0", () => {
    const graph = linearGraph();
    const analysis = computeCascadeAnalysis(graph);
    expect(analysis.isStable).toBe(true);
  });

  it("reports isStable=false when lambdaMax >= 1.0", () => {
    const graph = unstableGraph();
    // A: 0.8+0.7+0.6=2.1, B: 0.5+0.4=0.9, C: 0.3 → max=2.1
    const analysis = computeCascadeAnalysis(graph);
    expect(analysis.lambdaMax).toBeCloseTo(2.1, 5);
    expect(analysis.isStable).toBe(false);
  });

  it("returns top 3 centrality nodes", () => {
    const analysis = computeCascadeAnalysis(unstableGraph());
    expect(analysis.topCentralityNodes).toHaveLength(3);
    expect(analysis.topCentralityNodes[0].centrality).toBeGreaterThanOrEqual(
      analysis.topCentralityNodes[1].centrality
    );
  });

  it("computes dampingCoeff = 1 - lambdaMax when stable", () => {
    const analysis = computeCascadeAnalysis(linearGraph());
    expect(analysis.dampingCoeff).toBeCloseTo(1 - 0.7, 5);
  });

  it("dampingCoeff = 0 when unstable", () => {
    const analysis = computeCascadeAnalysis(unstableGraph());
    expect(analysis.dampingCoeff).toBe(0);
  });

  it("computes forgettingRate = 0.05 + lambdaMax * 0.1", () => {
    const analysis = computeCascadeAnalysis(linearGraph());
    expect(analysis.forgettingRate).toBeCloseTo(0.05 + 0.7 * 0.1, 5);
  });

  it("handles empty graph without error", () => {
    const analysis = computeCascadeAnalysis(emptyGraph());
    expect(analysis.lambdaMax).toBe(0);
    expect(analysis.isStable).toBe(true);
  });

  it("handles single-node graph", () => {
    const analysis = computeCascadeAnalysis(singleNodeGraph());
    expect(analysis.lambdaMax).toBe(0);
    expect(analysis.isStable).toBe(true);
  });

  it("excludes severed edges from lambdaMax calculation", () => {
    const graph = linearGraph();
    graph.edges[0].isSevered = true;
    const analysis = computeCascadeAnalysis(graph);
    // Only e_BC with weight 0.6 counts
    expect(analysis.lambdaMax).toBeCloseTo(0.6, 5);
  });
});

// ─── getPresetShocks ────────────────────────────────────────────

describe("getPresetShocks", () => {
  it("returns an empty array by default (preset library cleared)", () => {
    expect(getPresetShocks()).toEqual([]);
  });

  it("never returns a preset with invalid severity (contract holds for any future entries)", () => {
    for (const s of getPresetShocks()) {
      expect(s.severity).toBeGreaterThan(0);
      expect(s.severity).toBeLessThanOrEqual(1);
    }
  });
});
