import { createClient } from "@/lib/supabase/server";
import FeedbackAdminList from "./FeedbackAdminList";

export const dynamic = "force-dynamic";

type FeedbackRow = {
  id: number;
  created_at: string;
  updated_at: string | null;
  type: string;
  email: string | null;
  message: string;
  status: "new" | "approved" | "in_progress" | "shipped" | "rejected";
  admin_notes: string | null;
  github_issue_url: string | null;
  github_issue_number: number | null;
  pr_url: string | null;
  shipped_at: string | null;
};

export default async function FeedbackAdminPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feedback")
    .select(
      "id, created_at, updated_at, type, email, message, status, admin_notes, github_issue_url, github_issue_number, pr_url, shipped_at"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return (
      <div className="min-h-screen bg-background text-foreground p-8 font-mono">
        <div className="text-accent-red">Failed to load feedback: {error.message}</div>
      </div>
    );
  }

  const rows = (data ?? []) as FeedbackRow[];
  return <FeedbackAdminList rows={rows} />;
}
