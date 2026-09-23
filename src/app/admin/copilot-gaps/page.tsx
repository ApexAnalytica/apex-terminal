import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { analyzeCapabilityGaps, type GapInputRow } from "@/lib/copilot/capability-gaps";
import CopilotGapsAdminList from "./CopilotGapsAdminList";

export const dynamic = "force-dynamic";

// Pull a generous window of recent turns. Service-role bypasses RLS so
// this sees EVERY user's traces (the whole point — aggregate demand),
// unlike the per-user /api/copilot/traces/gaps endpoint.
const FETCH_LIMIT = 5000;

export default async function CopilotGapsAdminPage() {
  // Middleware gates /admin/* to the ADMIN_EMAILS allowlist, so the
  // service-role client is safe here — the anon-session client would
  // hit RLS on copilot_traces and read only the admin's own rows.
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await supabase
    .from("copilot_traces")
    .select("created_at, conversation_id, user_message, display_text, tool_calls")
    .order("created_at", { ascending: false })
    .limit(FETCH_LIMIT);

  if (error) {
    return (
      <div className="min-h-screen bg-background text-foreground p-8 font-mono">
        <div className="text-accent-red">
          Failed to load copilot traces: {error.message}
        </div>
      </div>
    );
  }

  const rows = (data ?? []) as GapInputRow[];
  const report = analyzeCapabilityGaps(rows);
  return <CopilotGapsAdminList report={report} />;
}
