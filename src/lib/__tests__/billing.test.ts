import { describe, it, expect } from "vitest";
import { isExpired } from "@/lib/billing";

describe("isExpired", () => {
  const now = new Date("2026-04-29T12:00:00Z");

  it("returns true for tier='expired' regardless of period", () => {
    expect(isExpired({ tier: "expired", current_period_end: null }, now)).toBe(true);
    expect(
      isExpired(
        { tier: "expired", current_period_end: "2099-01-01T00:00:00Z" },
        now
      )
    ).toBe(true);
  });

  it("returns false for tier='trusted' regardless of period", () => {
    expect(isExpired({ tier: "trusted", current_period_end: null }, now)).toBe(false);
    expect(
      isExpired(
        { tier: "trusted", current_period_end: "1999-01-01T00:00:00Z" },
        now
      )
    ).toBe(false);
  });

  it("respects current_period_end for paid tiers", () => {
    expect(
      isExpired(
        { tier: "analyst", current_period_end: "2026-04-30T00:00:00Z" },
        now
      )
    ).toBe(false);
    expect(
      isExpired(
        { tier: "analyst", current_period_end: "2026-04-29T11:59:59Z" },
        now
      )
    ).toBe(true);
  });

  it("trial without period_end is treated as expired (malformed)", () => {
    expect(isExpired({ tier: "trial", current_period_end: null }, now)).toBe(true);
  });

  it("paid tier without period_end is fail-open (admin onboarding window)", () => {
    expect(
      isExpired({ tier: "multi_domain", current_period_end: null }, now)
    ).toBe(false);
    expect(
      isExpired({ tier: "enterprise", current_period_end: null }, now)
    ).toBe(false);
  });

  it("trial with future period_end is active", () => {
    expect(
      isExpired(
        { tier: "trial", current_period_end: "2026-04-30T00:00:00Z" },
        now
      )
    ).toBe(false);
  });
});
