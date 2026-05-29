import { describe, it, expect } from "vitest";
import {
  buildCopilotSystemPrompt,
  COPILOT_SYSTEM_PROMPT,
} from "@/lib/copilot/system-prompt";

// ─── Copilot system-prompt builder tests ──────────────────────────────
//
// The prompt is per-profile so a T1D session doesn't get geopolitical
// framing in the LLM's reasoning (and vice versa). Tests pin:
//
//   - Domain-scope clause swaps with profile
//   - Example tool-syntax node ids swap with profile
//   - Default (no profile id) returns the geopolitical variant for
//     backwards compat with callers that haven't been updated
//   - The COPILOT_SYSTEM_PROMPT named export remains the geopolitical
//     variant (call sites that import the constant directly keep
//     working until they're migrated to the builder)
//   - Shared structure (capabilities list, action-syntax rule, prose
//     header rule) is present in both variants

describe("buildCopilotSystemPrompt", () => {
  it("geopolitical variant uses semiconductor / energy / finance framing", () => {
    const out = buildCopilotSystemPrompt("geopolitical");
    expect(out).toContain("semiconductors, energy, finance");
    expect(out).toContain("GRID_USA|FAB_TW");
    expect(out).not.toContain("β-cell");
    expect(out).not.toContain("CGM");
  });

  it("t1d variant uses β-cell / glucose / trial-endpoint framing", () => {
    const out = buildCopilotSystemPrompt("t1d");
    expect(out).toContain("β-cell");
    expect(out).toContain("glucose-insulin");
    expect(out).toContain("CGM_GLUCOSE");
    expect(out).not.toContain("semiconductors");
    expect(out).not.toContain("GRID_USA");
  });

  it("defaults to geopolitical when no profile id is passed", () => {
    expect(buildCopilotSystemPrompt()).toBe(
      buildCopilotSystemPrompt("geopolitical"),
    );
  });

  it("both variants share the action-syntax rule and capabilities list", () => {
    const shared = [
      "Omega-Fragility",
      "Structural causal discovery (DCD/NOTEARS, PCMCI+, FCI)",
      "Tarski truth-filter verification",
      "Pearl do-calculus",
      "Pareto shock injection",
      "<<<ACTION:name:param>>>",
      "[ANALYSIS]",
    ];
    const geo = buildCopilotSystemPrompt("geopolitical");
    const t1d = buildCopilotSystemPrompt("t1d");
    for (const s of shared) {
      expect(geo).toContain(s);
      expect(t1d).toContain(s);
    }
  });

  it("COPILOT_SYSTEM_PROMPT constant exports the geopolitical variant", () => {
    expect(COPILOT_SYSTEM_PROMPT).toBe(buildCopilotSystemPrompt("geopolitical"));
  });
});
