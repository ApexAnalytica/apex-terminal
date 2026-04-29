// Billing / tier types and helpers shared by middleware, API routes,
// and UI. This module deliberately has no React or Supabase imports
// so it is safe to use in edge middleware.

export type Tier =
  | "trial"
  | "analyst"
  | "multi_domain"
  | "enterprise"
  | "trusted"
  | "expired";

export type SubscriptionStatus =
  | "active"
  | "past_due"
  | "canceled"
  | "pending"
  | "none";

export interface BillingProfile {
  tier: Tier;
  subscription_status: SubscriptionStatus | null;
  current_period_start: string | null;
  current_period_end: string | null;
  mercury_invoice_id: string | null;
  seats: number | null;
  domain_access: string[] | null;
}

export const TIER_LABELS: Record<Tier, string> = {
  trial: "Trial",
  analyst: "Analyst",
  multi_domain: "Multi-Domain",
  enterprise: "Enterprise",
  trusted: "Trusted",
  expired: "Expired",
};

// Tiers that are billed (i.e. require Mercury invoice + period dates).
export const PAID_TIERS: ReadonlyArray<Tier> = [
  "analyst",
  "multi_domain",
  "enterprise",
];

// Tiers that always have access regardless of period dates.
export const UNCAPPED_TIERS: ReadonlyArray<Tier> = ["trusted"];

// Decide whether a profile's access window has lapsed. Returns true
// if the user should be redirected to the upgrade wall.
//
// Rules:
//   - tier === 'expired'                    => expired
//   - tier === 'trusted'                    => never expired
//   - current_period_end set and in past    => expired
//   - paid tier with no period_end set      => not yet expired (admin
//                                              hasn't finished onboarding;
//                                              fail-open for that brief
//                                              window — Phase 3 closes it)
//   - trial with no period_end set          => expired (defensive: a
//                                              trial without an end date
//                                              is malformed)
export function isExpired(
  profile: Pick<BillingProfile, "tier" | "current_period_end">,
  now: Date = new Date()
): boolean {
  if (profile.tier === "expired") return true;
  if (profile.tier === "trusted") return false;

  if (profile.current_period_end) {
    return new Date(profile.current_period_end) <= now;
  }

  // No period end recorded.
  if (profile.tier === "trial") return true;
  return false;
}
