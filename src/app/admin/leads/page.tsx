import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import LeadsAdminList from "./LeadsAdminList";

export const dynamic = "force-dynamic";

export type LeadStatus =
  | "new"
  | "contacted"
  | "trial-issued"
  | "closed-won"
  | "closed-lost";

export interface LeadRow {
  id: string;
  name: string;
  email: string;
  organization: string;
  use_case: string | null;
  source: string;
  status: LeadStatus;
  admin_notes: string | null;
  contacted_at: string | null;
  created_at: string;
}

export default async function LeadsAdminPage() {
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data, error } = await supabase
    .from("leads")
    .select(
      "id, name, email, organization, use_case, source, status, admin_notes, contacted_at, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return (
      <div className="min-h-screen bg-background text-foreground p-8 font-mono">
        <div className="text-accent-red">
          Failed to load leads: {error.message}
        </div>
      </div>
    );
  }

  const rows = (data ?? []) as LeadRow[];
  return <LeadsAdminList rows={rows} />;
}
