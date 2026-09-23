import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import BillingAdminList from "./BillingAdminList";
import type { AdminCustomerRow } from "@/app/api/admin/billing/customers/route";

export const dynamic = "force-dynamic";

export default async function BillingAdminPage() {
  // Middleware gates /admin/* to ADMIN_EMAILS allowlist, so it's safe to
  // bypass RLS here with the service-role client.
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, email, org_name, tier, subscription_status, current_period_start, current_period_end, mercury_invoice_id, seats, domain_access, trial_expires_at, created_at"
    )
    .order("current_period_end", { ascending: true, nullsFirst: false })
    .limit(500);

  if (error) {
    return (
      <div className="min-h-screen bg-background text-foreground p-8 font-mono">
        <div className="text-accent-red">Failed to load customers: {error.message}</div>
      </div>
    );
  }

  const rows = (data ?? []) as AdminCustomerRow[];
  return <BillingAdminList rows={rows} />;
}
