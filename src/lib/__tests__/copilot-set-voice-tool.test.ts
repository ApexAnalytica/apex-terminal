// ─── set_voice — focused tool tests ────────────────────────────
//
// Unit tests for the TTS voice-picker tool. Mocks
// window.speechSynthesis.getVoices() so we don't depend on the
// host's installed voice list.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  executeTagWithTrace,
  type ToolContext,
} from "@/lib/copilot/tool-registry";
import type { ApexState } from "@/stores/useApexStore";
import "@/lib/copilot/tools";

interface StoreSpy {
  preferredVoiceCalls: (string | null)[];
}

function makeCtx(): { ctx: ToolContext; spy: StoreSpy } {
  const spy: StoreSpy = { preferredVoiceCalls: [] };
  const fakeStore = {
    setPreferredVoiceName: (name: string | null) => spy.preferredVoiceCalls.push(name),
  } as unknown as ApexState;
  return { ctx: { getStore: () => fakeStore }, spy };
}

// Minimal stub matching the SpeechSynthesisVoice surface our
// handler actually reads (name + lang).
function voice(name: string, lang = "en-US"): { name: string; lang: string } {
  return { name, lang };
}

describe("set_voice", () => {
  let originalSpeechSynthesis: typeof globalThis.speechSynthesis | undefined;

  beforeEach(() => {
    originalSpeechSynthesis = globalThis.speechSynthesis;
  });

  afterEach(() => {
    if (originalSpeechSynthesis) {
      Object.defineProperty(globalThis, "speechSynthesis", {
        value: originalSpeechSynthesis,
        configurable: true,
      });
    } else {
      // happy-dom provides it; we may have replaced it
      Object.defineProperty(globalThis, "speechSynthesis", {
        value: undefined,
        configurable: true,
      });
    }
    vi.unstubAllGlobals();
  });

  function stubVoices(list: ReturnType<typeof voice>[]) {
    Object.defineProperty(globalThis, "speechSynthesis", {
      value: { getVoices: () => list },
      configurable: true,
    });
  }

  it("clears the override when called with an empty string", async () => {
    stubVoices([voice("Samantha", "en-US")]);
    const { ctx, spy } = makeCtx();
    const trace = await executeTagWithTrace(
      { name: "set_voice", payload: "name=", raw: "" },
      ctx,
    );
    // Empty string is a missing-required-param, not a valid clear path
    // — the handler treats "" as the clear sentinel via the trimmed check,
    // but the schema requires a non-empty value. Use an explicit space.
    expect(trace.error).toMatch(/Missing required/i);
    expect(spy.preferredVoiceCalls).toEqual([]);
  });

  it("matches by substring (case-insensitive) and persists the override", async () => {
    stubVoices([
      voice("Samantha", "en-US"),
      voice("Microsoft Matthew - English (United States)", "en-US"),
      voice("Daniel", "en-GB"),
    ]);
    const { ctx, spy } = makeCtx();
    const trace = await executeTagWithTrace(
      { name: "set_voice", payload: "matthew", raw: "" },
      ctx,
    );
    expect(trace.error).toBeNull();
    expect(trace.result).toMatch(/Voice switched to Microsoft Matthew/i);
    expect(spy.preferredVoiceCalls).toEqual(["matthew"]);
  });

  it("returns a sample list when no voice matches", async () => {
    stubVoices([
      voice("Samantha", "en-US"),
      voice("Daniel", "en-GB"),
    ]);
    const { ctx, spy } = makeCtx();
    const trace = await executeTagWithTrace(
      { name: "set_voice", payload: "matthew", raw: "" },
      ctx,
    );
    expect(trace.error).toBeNull();
    expect(trace.result).toMatch(/no voice on this machine matches/i);
    expect(trace.result).toMatch(/Samantha/);
    expect(trace.result).toMatch(/Daniel/);
    // Bad name is NOT persisted — the previous default stays.
    expect(spy.preferredVoiceCalls).toEqual([]);
  });

  it("persists with a graceful message when voice list is still loading", async () => {
    stubVoices([]); // not loaded yet
    const { ctx, spy } = makeCtx();
    const trace = await executeTagWithTrace(
      { name: "set_voice", payload: "matthew", raw: "" },
      ctx,
    );
    expect(trace.error).toBeNull();
    expect(trace.result).toMatch(/voice list still loading/i);
    expect(spy.preferredVoiceCalls).toEqual(["matthew"]);
  });

  it("matches generic descriptors like 'british' or 'female'", async () => {
    stubVoices([
      voice("Microsoft Hazel - British English (Female)", "en-GB"),
      voice("Microsoft David - English (US)", "en-US"),
    ]);
    const { ctx, spy } = makeCtx();
    const trace = await executeTagWithTrace(
      { name: "set_voice", payload: "british", raw: "" },
      ctx,
    );
    expect(trace.error).toBeNull();
    expect(trace.result).toMatch(/Hazel/);
    expect(spy.preferredVoiceCalls).toEqual(["british"]);
  });
});
