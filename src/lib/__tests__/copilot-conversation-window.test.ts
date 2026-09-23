import { describe, it, expect } from "vitest";
import {
  pruneConversation,
  DEFAULT_CONVERSATION_WINDOW,
} from "@/lib/copilot/conversation-window";
import type { CopilotMessage } from "@/lib/types";

function msg(role: "user" | "assistant", content: string): CopilotMessage {
  return { id: `m-${content}`, role, content, timestamp: Date.now() };
}

describe("pruneConversation", () => {
  it("returns history unchanged when under the limit", () => {
    const history = [msg("user", "1"), msg("assistant", "2")];
    const out = pruneConversation(history, 10);
    expect(out.kept).toEqual(history);
    expect(out.droppedCount).toBe(0);
  });

  it("returns history unchanged when exactly at the limit", () => {
    const history = Array.from({ length: 12 }, (_, i) => msg("user", String(i)));
    const out = pruneConversation(history, 12);
    expect(out.kept).toHaveLength(12);
    expect(out.droppedCount).toBe(0);
  });

  it("drops older messages from the front when over the limit", () => {
    const history = Array.from({ length: 20 }, (_, i) => msg("user", String(i)));
    const out = pruneConversation(history, 12);
    expect(out.kept).toHaveLength(12);
    expect(out.droppedCount).toBe(8);
    // Kept the most recent.
    expect(out.kept[0].content).toBe("8");
    expect(out.kept[11].content).toBe("19");
  });

  it("defaults to DEFAULT_CONVERSATION_WINDOW when no limit is passed", () => {
    const history = Array.from({ length: 20 }, (_, i) => msg("user", String(i)));
    const out = pruneConversation(history);
    expect(out.kept).toHaveLength(DEFAULT_CONVERSATION_WINDOW);
    expect(out.droppedCount).toBe(20 - DEFAULT_CONVERSATION_WINDOW);
  });

  it("handles empty input", () => {
    const out = pruneConversation([], 12);
    expect(out.kept).toEqual([]);
    expect(out.droppedCount).toBe(0);
  });

  it("treats limit=0 as 'keep nothing' (defensive)", () => {
    const history = [msg("user", "1"), msg("assistant", "2")];
    const out = pruneConversation(history, 0);
    expect(out.kept).toEqual([]);
    expect(out.droppedCount).toBe(2);
  });

  it("preserves message identity (kept array references the originals)", () => {
    const original = [msg("user", "1"), msg("assistant", "2"), msg("user", "3")];
    const out = pruneConversation(original, 2);
    // Same object references, not a deep copy.
    expect(out.kept[0]).toBe(original[1]);
    expect(out.kept[1]).toBe(original[2]);
  });
});
