import { describe, it, expect } from "vitest";
import {
  deriveEdgeAppearance,
  edgeWidthFactor,
} from "@/lib/edge-styling";
import type { CausalEdge } from "@/lib/types";

function mkEdge(overrides: Partial<CausalEdge> = {}): CausalEdge {
  return {
    id: "e1",
    source: "a",
    target: "b",
    weight: 0.5,
    lag: 0,
    type: "directed",
    confidence: 0.9,
    isInconsistent: false,
    physicalMechanism: "test",
    ...overrides,
  };
}

describe("deriveEdgeAppearance — color tier precedence", () => {
  it("ablated overrides everything (magenta + dashed)", () => {
    // Even a severed inconsistent confounded edge becomes magenta+dashed
    // when ablated — Pearl do(X) supremacy.
    const out = deriveEdgeAppearance({
      edge: mkEdge({
        type: "confounded",
        isInconsistent: true,
        isSevered: true,
      }),
      truthFilter: "verified",
      isAblated: true,
    });
    expect(out.color).toBe("#e040fb");
    expect(out.isDashed).toBe(true);
  });

  it("severed beats consequence/inconsistent/type (slate + dashed)", () => {
    const out = deriveEdgeAppearance({
      edge: mkEdge({
        isInconsistent: true,
        isSevered: true,
        isConsequenceEdge: true,
      }),
      truthFilter: "verified",
      isAblated: false,
    });
    expect(out.color).toBe("#78909c");
    expect(out.isDashed).toBe(true);
  });

  it("consequence edge beats inconsistent + type (orange, solid unless type-confounded)", () => {
    const out = deriveEdgeAppearance({
      edge: mkEdge({ isConsequenceEdge: true, isInconsistent: true }),
      truthFilter: "verified",
      isAblated: false,
    });
    expect(out.color).toBe("#ff6d00");
    // Inconsistent in verified mode still triggers dashed
    expect(out.isDashed).toBe(true);
  });

  it("inconsistent only flags red in verified truthFilter mode", () => {
    const raw = deriveEdgeAppearance({
      edge: mkEdge({ isInconsistent: true }),
      truthFilter: "raw",
      isAblated: false,
    });
    expect(raw.color).toBe("#00e5ff"); // type-based fallback
    expect(raw.isDashed).toBe(false);

    const verified = deriveEdgeAppearance({
      edge: mkEdge({ isInconsistent: true }),
      truthFilter: "verified",
      isAblated: false,
    });
    expect(verified.color).toBe("#ff1744");
    expect(verified.isDashed).toBe(true);
  });

  it("type-based color fallback: directed → cyan, temporal → amber, confounded → orange", () => {
    expect(
      deriveEdgeAppearance({
        edge: mkEdge({ type: "directed" }),
        truthFilter: "raw",
        isAblated: false,
      }).color,
    ).toBe("#00e5ff");
    expect(
      deriveEdgeAppearance({
        edge: mkEdge({ type: "temporal" }),
        truthFilter: "raw",
        isAblated: false,
      }).color,
    ).toBe("#ffab00");
    expect(
      deriveEdgeAppearance({
        edge: mkEdge({ type: "confounded" }),
        truthFilter: "raw",
        isAblated: false,
      }).color,
    ).toBe("#ff6d00");
  });

  it("confounded type is dashed even without ablation/inconsistency/sever", () => {
    const out = deriveEdgeAppearance({
      edge: mkEdge({ type: "confounded" }),
      truthFilter: "raw",
      isAblated: false,
    });
    expect(out.isDashed).toBe(true);
  });

  it("directed type is solid by default", () => {
    const out = deriveEdgeAppearance({
      edge: mkEdge({ type: "directed" }),
      truthFilter: "raw",
      isAblated: false,
    });
    expect(out.isDashed).toBe(false);
  });
});

describe("edgeWidthFactor — power-scaled width", () => {
  it("clamps weight to [0, 1]", () => {
    expect(edgeWidthFactor(-1)).toBeCloseTo(0.7, 5);
    expect(edgeWidthFactor(2)).toBeCloseTo(4.0, 5);
  });

  it("returns 0.7 at weight 0 and 4.0 at weight 1", () => {
    expect(edgeWidthFactor(0)).toBeCloseTo(0.7, 5);
    expect(edgeWidthFactor(1)).toBeCloseTo(4.0, 5);
  });

  it("widens the visible band over the typical 0.4–0.8 weight range", () => {
    // Power-scaling — a 2× weight ratio should give meaningfully more
    // than 2× width perception. Concretely: w=0.8 should be at least
    // ~1.5× the width of w=0.4 once we subtract the constant base.
    const w04 = edgeWidthFactor(0.4) - 0.7;
    const w08 = edgeWidthFactor(0.8) - 0.7;
    expect(w08 / Math.max(w04, 1e-6)).toBeGreaterThan(1.5);
  });
});
