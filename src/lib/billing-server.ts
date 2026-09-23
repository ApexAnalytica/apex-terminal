// Server-only billing helpers. Loads the user's profile + tier_features
// from Supabase and resolves effective domain access. Use these in
// route handlers and server components — never import from the client.

import { createClient } from "@/lib/supabase/server";
import {
  effectiveDomainAccess,
  isExpired,
  type Tier,
} from "@/lib/billing";

export interface UserAccess {
  tier: Tier;
  domains: string[];      // resolved effective domain IDs
  isExpired: boolean;
  current_period_end: string | null;
}

export async function getUserAccess(): Promise<UserAccess | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profileRes, featuresRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("tier, current_period_end, domain_access")
      .eq("id", user.id)
      .single<{
        tier: Tier;
        current_period_end: string | null;
        domain_access: string[] | null;
      }>(),
    supabase.from("tier_features").select("tier, domain_ids"),
  ]);

  const profile = profileRes.data;
  if (!profile) return null;

  const featureMap = new Map<Tier, string[]>(
    (featuresRes.data ?? []).map((f) => [
      f.tier as Tier,
      (f.domain_ids ?? []) as string[],
    ])
  );

  const expired = isExpired(profile);
  const domains = expired ? [] : effectiveDomainAccess(profile, featureMap);

  return {
    tier: profile.tier,
    domains,
    isExpired: expired,
    current_period_end: profile.current_period_end,
  };
}

// Defense-in-depth gate for API routes that accept an explicit list
// of domain IDs in the request body. Returns 401 if not authed,
// 403 if expired or any claimed ID is outside the user's effective
// access. The caller should branch on `result.ok` and surface
// `result.error` / `result.status` as the response.
export async function requireDomainAccess(
  claimedDomainIds: readonly string[]
): Promise<
  | { ok: true; access: UserAccess }
  | { ok: false; status: number; error: string }
> {
  const access = await getUserAccess();
  if (!access) return { ok: false, status: 401, error: "Not authenticated" };
  if (access.isExpired)
    return { ok: false, status: 403, error: "Subscription expired" };

  const denied = claimedDomainIds.filter(
    (id) => !access.domains.includes(id)
  );
  if (denied.length > 0) {
    return {
      ok: false,
      status: 403,
      error: `Tier '${access.tier}' does not include: ${denied.join(", ")}`,
    };
  }

  return { ok: true, access };
}
