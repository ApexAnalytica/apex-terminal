import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin-auth";
import type { Tier, SubscriptionStatus } from "@/lib/billing";

// Lazy service-client construction — see comment in
// `src/app/api/admin/billing/expire/route.ts`.
function getService() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface AdminCustomerRow {
  id: string;
  email: string;
  org_name: string | null;
  tier: Tier;
  subscription_status: SubscriptionStatus | null;
  current_period_start: string | null;
  current_period_end: string | null;
  mercury_invoice_id: string | null;
  seats: number;
  domain_access: string[] | null;
  trial_expires_at: string | null;
  created_at: string;
}

// Lists all profiles for the admin billing console. Sorted with
// soonest current_period_end first so renewals coming due naturally
// surface to the top; rows with no period_end fall to the bottom.
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await getService()
    .from("profiles")
    .select(
      "id, email, org_name, tier, subscription_status, current_period_start, current_period_end, mercury_invoice_id, seats, domain_access, trial_expires_at, created_at"
    )
    .order("current_period_end", { ascending: true, nullsFirst: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { customers: (data ?? []) as AdminCustomerRow[] },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
