import { describe, it, expect } from "vitest";
import { analyzeCapabilityGaps, type GapInputRow } from "@/lib/copilot/capability-gaps";

function row(p: Partial<GapInputRow> & { user_message: string | null }): GapInputRow {
  return {
    created_at: "2026-06-04T00:00:00Z",
    conversation_id: "c1",
    display_text: "",
    tool_calls: [],
    ...p,
  };
}

describe("analyzeCapabilityGaps", () => {
  it("classifies an explicit refusal (Tier A) from the honesty marker", () => {
    const r = analyzeCapabilityGaps([
      row({
        user_message: "export the graph as a PDF",
        display_text: "I can't do that yet — there's no control wired into me for that.",
      }),
    ]);
    expect(r.explicit_refusal_count).toBe(1);
    expect(r.suspected_gap_count).toBe(0);
    expect(r.explicit_refusals[0].examples[0]).toMatch(/export the graph/i);
  });

  it("classifies an action with no tool fired as a suspected gap (Tier B)", () => {
    const r = analyzeCapabilityGaps([
      row({ user_message: "change the background to dark mode", display_text: "Here's some prose." }),
    ]);
    expect(r.suspected_gap_count).toBe(1);
    expect(r.explicit_refusal_count).toBe(0);
  });

  it("does NOT flag a turn where a tool fired", () => {
    const r = analyzeCapabilityGaps([
      row({
        user_message: "switch to the pearl module",
        display_text: "Switching now.",
        tool_calls: [{ name: "set_module" }],
      }),
    ]);
    expect(r.turns_with_tools).toBe(1);
    expect(r.suspected_gap_count).toBe(0);
    expect(r.explicit_refusal_count).toBe(0);
  });

  it("does NOT flag a plain question with no action verb", () => {
    const r = analyzeCapabilityGaps([
      row({ user_message: "what is omega-fragility?", display_text: "It's a 0-10 metric..." }),
    ]);
    expect(r.suspected_gap_count).toBe(0);
    expect(r.explicit_refusal_count).toBe(0);
  });

  it("groups near-duplicate requests and ranks by count", () => {
    const r = analyzeCapabilityGaps([
      row({ user_message: "export the graph as a PDF please", display_text: "prose" }),
      row({ user_message: "export the graph as a PDF now", display_text: "prose" }),
      row({ user_message: "hide the trade edges", display_text: "prose" }),
    ]);
    expect(r.suspected_gaps[0].count).toBe(2); // the two PDF exports collapse
    expect(r.suspected_gaps[0].examples.length).toBe(2);
    expect(r.suspected_gaps).toHaveLength(2);
  });

  it("counts a refusal as Tier A even if the message also reads as an action", () => {
    const r = analyzeCapabilityGaps([
      row({
        user_message: "set the theme to neon", // action verb present
        display_text: "I can't do that yet.",
      }),
    ]);
    expect(r.explicit_refusal_count).toBe(1);
    expect(r.suspected_gap_count).toBe(0); // not double-counted
  });

  it("skips empty user messages and handles null display_text", () => {
    const r = analyzeCapabilityGaps([
      row({ user_message: "", display_text: null }),
      row({ user_message: "   ", display_text: null }),
    ]);
    expect(r.total_turns).toBe(2);
    expect(r.explicit_refusal_count).toBe(0);
    expect(r.suspected_gap_count).toBe(0);
  });
});
