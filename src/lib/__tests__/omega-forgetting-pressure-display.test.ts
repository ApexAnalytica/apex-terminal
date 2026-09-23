// @vitest-environment node
//
// Tests for the Ω-Forgetting Pressure display-band helper. Pure
// function — no React or DOM access — so the test pins the band
// thresholds + tooltip strings the UI relies on.

import { describe, it, expect } from "vitest";
import { forgettingPressureBand } from "../omega-forgetting-pressure-display";

describe("forgettingPressureBand — thresholds", () => {
  it("NaN / negative inputs return the '—' placeholder band", () => {
    for (const v of [NaN, -0.1, -1, Number.POSITIVE_INFINITY * -1]) {
      const b = forgettingPressureBand(v);
      expect(b.label).toBe("—");
      expect(b.band).toBe("nominal");
      expect(b.color).toBe("var(--text-muted)");
    }
  });

  it("pressure < 0.15 → NOMINAL (green)", () => {
    for (const v of [0, 0.05, 0.149]) {
      const b = forgettingPressureBand(v);
      expect(b.band).toBe("nominal");
      expect(b.label).toBe("NOMINAL");
      expect(b.color).toBe("var(--accent-green)");
    }
  });

  it("0.15 < pressure ≤ 0.30 → ELEVATED (amber)", () => {
    for (const v of [0.16, 0.2, 0.3]) {
      const b = forgettingPressureBand(v);
      expect(b.band).toBe("elevated");
      expect(b.label).toBe("ELEVATED");
      expect(b.color).toBe("var(--accent-amber)");
    }
  });

  it("0.30 < pressure ≤ 0.60 → CRITICAL", () => {
    for (const v of [0.31, 0.45, 0.6]) {
      const b = forgettingPressureBand(v);
      expect(b.band).toBe("critical");
      expect(b.label).toBe("CRITICAL");
      expect(b.color).toBe("#ff7043");
    }
  });

  it("pressure > 0.60 → CATASTROPHIC (red)", () => {
    for (const v of [0.61, 0.8, 1.0]) {
      const b = forgettingPressureBand(v);
      expect(b.band).toBe("catastrophic");
      expect(b.label).toBe("CATASTROPHIC");
      expect(b.color).toBe("#ff1744");
    }
  });
});

describe("forgettingPressureBand — tooltip content", () => {
  it("tooltips contain the threshold ranges", () => {
    expect(forgettingPressureBand(0.05).tooltip).toMatch(/< 0\.15/);
    expect(forgettingPressureBand(0.2).tooltip).toMatch(/0\.15.{0,4}0\.30/);
    expect(forgettingPressureBand(0.45).tooltip).toMatch(/0\.30.{0,4}0\.60/);
    expect(forgettingPressureBand(0.8).tooltip).toMatch(/> 0\.60/);
  });

  it("placeholder tooltip explains the no-data condition", () => {
    expect(forgettingPressureBand(NaN).tooltip).toMatch(/unavailable|degenerate/i);
  });
});
