import { describe, it, expect } from "vitest";
import {
  CAPABILITY_META,
  tailwindClassesForTone,
  type Capability,
} from "../capability";

describe("capability metadata", () => {
  const all: Capability[] = [
    "live",
    "live-synthetic",
    "porting",
    "awaiting-data",
    "phase-2",
  ];

  it("every capability has meta with non-empty label and description", () => {
    for (const c of all) {
      const m = CAPABILITY_META[c];
      expect(m).toBeDefined();
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.description.length).toBeGreaterThan(0);
    }
  });

  it("every capability tone resolves to a non-empty class set", () => {
    for (const c of all) {
      const cls = tailwindClassesForTone(CAPABILITY_META[c].tone);
      expect(cls.border.length).toBeGreaterThan(0);
      expect(cls.bg.length).toBeGreaterThan(0);
      expect(cls.text.length).toBeGreaterThan(0);
    }
  });

  it("descriptions are honest — they mention the limitation, not just the feature", () => {
    // Quick guard against drift toward marketing copy. Each description
    // should reference what is or isn't real.
    expect(CAPABILITY_META.live.description.toLowerCase()).toMatch(
      /production|verified|tests/,
    );
    expect(CAPABILITY_META["live-synthetic"].description.toLowerCase()).toMatch(
      /synthetic|illustrative/,
    );
    expect(CAPABILITY_META.porting.description.toLowerCase()).toMatch(
      /python|deferred|research/,
    );
    expect(CAPABILITY_META["awaiting-data"].description.toLowerCase()).toMatch(
      /data|wired/,
    );
    expect(CAPABILITY_META["phase-2"].description.toLowerCase()).toMatch(
      /roadmap|partnership/,
    );
  });

  it("tailwindClassesForTone tolerates the muted fallback", () => {
    const cls = tailwindClassesForTone("muted");
    expect(cls.border.length).toBeGreaterThan(0);
  });
});
