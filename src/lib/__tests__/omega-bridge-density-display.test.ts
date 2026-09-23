import { describe, it, expect } from "vitest";
import { bridgeDensityBand } from "@/lib/omega-bridge-density-display";

// Display-band tests — verifies the threshold mapping is exhaustive
// and matches the documented bands. The math itself is covered by
// src/lib/__tests__/estimators/omega-bridge-density.test.ts.

describe("bridgeDensityBand — threshold coverage", () => {
  it("density > 0.60 → FRAGILE (red)", () => {
    expect(bridgeDensityBand(0.61).band).toBe("fragile");
    expect(bridgeDensityBand(0.8).band).toBe("fragile");
    expect(bridgeDensityBand(1.0).band).toBe("fragile");
  });

  it("0.30 < density ≤ 0.60 → ELEVATED (amber)", () => {
    expect(bridgeDensityBand(0.31).band).toBe("elevated");
    expect(bridgeDensityBand(0.45).band).toBe("elevated");
    expect(bridgeDensityBand(0.6).band).toBe("elevated");
  });

  it("0.05 ≤ density ≤ 0.30 → NOMINAL (green)", () => {
    expect(bridgeDensityBand(0.05).band).toBe("nominal");
    expect(bridgeDensityBand(0.1).band).toBe("nominal");
    expect(bridgeDensityBand(0.15).band).toBe("nominal");
    expect(bridgeDensityBand(0.3).band).toBe("nominal");
  });

  it("density < 0.05 → REDUNDANT (green)", () => {
    expect(bridgeDensityBand(0).band).toBe("redundant");
    expect(bridgeDensityBand(0.01).band).toBe("redundant");
    expect(bridgeDensityBand(0.049).band).toBe("redundant");
  });
});

describe("bridgeDensityBand — degenerate inputs", () => {
  it("NaN → nominal placeholder with em-dash", () => {
    const r = bridgeDensityBand(Number.NaN);
    expect(r.band).toBe("nominal");
    expect(r.label).toBe("—");
  });

  it("negative → nominal placeholder", () => {
    const r = bridgeDensityBand(-0.1);
    expect(r.label).toBe("—");
  });

  it("Infinity → nominal placeholder (not finite)", () => {
    const r = bridgeDensityBand(Number.POSITIVE_INFINITY);
    expect(r.label).toBe("—");
  });
});

describe("bridgeDensityBand — band record completeness", () => {
  it("every band returns a non-empty label, color, and tooltip", () => {
    const samples = [0, 0.02, 0.1, 0.3, 0.45, 0.7];
    for (const d of samples) {
      const r = bridgeDensityBand(d);
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.color.length).toBeGreaterThan(0);
      expect(r.tooltip.length).toBeGreaterThan(10);
    }
  });

  it("FRAGILE / ELEVATED bands use distinct warning colors", () => {
    const fragile = bridgeDensityBand(0.8);
    const elevated = bridgeDensityBand(0.45);
    const nominal = bridgeDensityBand(0.15);
    expect(fragile.color).not.toBe(elevated.color);
    expect(fragile.color).not.toBe(nominal.color);
    expect(elevated.color).not.toBe(nominal.color);
  });
});
