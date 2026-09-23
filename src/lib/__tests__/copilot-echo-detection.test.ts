// ─── echo-detection token-overlap tests ────────────────────────
//
// Pure-function tests for the helpers used by the voice-mode
// loop to recognize when the mic has captured the AI's own TTS.
// Covers the specific transcription pitfalls that motivated this
// approach: digit-to-word ("8.5" → "eight point five"), hyphen
// drops, punctuation drops, casing.

import { describe, it, expect } from "vitest";
import { tokenize, echoOverlapRatio } from "@/lib/copilot/echo-detection";

describe("tokenize", () => {
  it("lowercases and splits on non-alphanumerics", () => {
    expect(tokenize("Hello, World!")).toEqual(["hello", "world"]);
  });

  it("drops punctuation and markdown", () => {
    expect(tokenize("**[ANALYSIS]** the score is 8.5.")).toEqual([
      "analysis",
      "the",
      "score",
      "is",
      "8",
      "5",
    ]);
  });

  it("splits hyphenated words into separate tokens", () => {
    expect(tokenize("omega-fragility metric")).toEqual([
      "omega",
      "fragility",
      "metric",
    ]);
  });

  it("returns empty array for empty / non-alphanumeric input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   !!!  ")).toEqual([]);
  });
});

describe("echoOverlapRatio", () => {
  it("returns 1.0 when every heard token is in aiSaid", () => {
    const ai = "The Strait of Hormuz handles 20% of global oil transit.";
    const heard = "strait of hormuz handles global oil transit";
    expect(echoOverlapRatio(heard, ai)).toBe(1);
  });

  it("returns near-1 when transcription differs in formatting but not words", () => {
    // The kind of failure mode that motivated this approach:
    // the AI says "omega-fragility composite is 8.5", the mic
    // hears "omega fragility composite is eight point five".
    const ai = "Omega-fragility composite is 8.5.";
    const heard = "omega fragility composite is eight point five";
    // 4 of 7 heard tokens ("omega", "fragility", "composite",
    // "is") are in the AI message — the digits go to "eight",
    // "point", "five" which aren't. Still recognizably partial
    // echo. Ratio: 4/7 ≈ 0.571.
    const overlap = echoOverlapRatio(heard, ai);
    expect(overlap).toBeGreaterThan(0.5);
    expect(overlap).toBeLessThan(0.75);
  });

  it("returns 0 for a clean user reply that introduces new words", () => {
    const ai = "Top risk nodes are Hormuz, the Suez Canal, and Bab el Mandeb.";
    const heard = "tell me more about cascade defense";
    // None of {"tell", "me", "more", "about", "cascade", "defense"} appear in AI.
    expect(echoOverlapRatio(heard, ai)).toBe(0);
  });

  it("returns low value when the user replies referencing one or two AI words", () => {
    const ai = "Top risk nodes are Hormuz, the Suez Canal, and Bab el Mandeb.";
    const heard = "tell me more about hormuz";
    // 1 of 5 tokens ("hormuz") in AI message.
    expect(echoOverlapRatio(heard, ai)).toBe(0.2);
  });

  it("returns 0 when either side is empty", () => {
    expect(echoOverlapRatio("", "some ai text")).toBe(0);
    expect(echoOverlapRatio("user heard", "")).toBe(0);
    expect(echoOverlapRatio("", "")).toBe(0);
  });

  it("is case-insensitive", () => {
    expect(echoOverlapRatio("HELLO World", "hello world")).toBe(1);
  });

  it("handles the [CLARIFICATION] feedback loop case", () => {
    // The actual production failure: AI says
    //   "[CLARIFICATION] Please articulate your question..."
    // and the mic captures
    //   "clarification" as user input.
    const ai = "[CLARIFICATION] Please articulate your question or the specific aspect you require clarification on.";
    const heard = "clarification";
    // Single token, and it's in the AI text → ratio 1.0 → would
    // trigger STRONG suppression in the submit path.
    expect(echoOverlapRatio(heard, ai)).toBe(1);
  });
});
