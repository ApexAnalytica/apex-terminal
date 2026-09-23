import { describe, it, expect } from "vitest";
import {
  canAccessDomain,
  effectiveDomainAccess,
  isExpired,
} from "@/lib/billing";

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

describe("effectiveDomainAccess", () => {
  const features = new Map<
    "trial" | "analyst" | "multi_domain" | "enterprise" | "trusted" | "expired",
    string[]
  >([
    ["trial", ["a", "b", "c"]],
    ["analyst", []],
    ["multi_domain", ["a", "b", "c"]],
    ["enterprise", ["a", "b", "c"]],
    ["trusted", ["a", "b", "c"]],
    ["expired", []],
  ]);

  it("returns tier default when domain_access is null", () => {
    expect(
      effectiveDomainAccess({ tier: "multi_domain", domain_access: null }, features)
    ).toEqual(["a", "b", "c"]);
  });

  it("returns the override when domain_access is set (even if empty)", () => {
    expect(
      effectiveDomainAccess({ tier: "analyst", domain_access: ["a"] }, features)
    ).toEqual(["a"]);
    // Empty override is honored — admin assigned no domain yet.
    expect(
      effectiveDomainAccess({ tier: "analyst", domain_access: [] }, features)
    ).toEqual([]);
  });

  it("expired tier always returns empty regardless of override", () => {
    expect(
      effectiveDomainAccess(
        { tier: "expired", domain_access: ["a", "b"] },
        features
      )
    ).toEqual([]);
  });

  it("falls back to [] when tier has no feature row", () => {
    const empty = new Map<typeof features extends Map<infer K, unknown> ? K : never, string[]>();
    expect(
      effectiveDomainAccess({ tier: "trusted", domain_access: null }, empty)
    ).toEqual([]);
  });

  it("accepts a Record in addition to a Map", () => {
    const record: Record<
      "trial" | "analyst" | "multi_domain" | "enterprise" | "trusted" | "expired",
      string[] | undefined
    > = {
      trial: ["x"],
      analyst: undefined,
      multi_domain: undefined,
      enterprise: undefined,
      trusted: undefined,
      expired: undefined,
    };
    expect(
      effectiveDomainAccess({ tier: "trial", domain_access: null }, record)
    ).toEqual(["x"]);
  });
});

describe("canAccessDomain", () => {
  it("matches by exact id", () => {
    expect(canAccessDomain(["a", "b"], "a")).toBe(true);
    expect(canAccessDomain(["a", "b"], "c")).toBe(false);
    expect(canAccessDomain([], "a")).toBe(false);
  });
});
