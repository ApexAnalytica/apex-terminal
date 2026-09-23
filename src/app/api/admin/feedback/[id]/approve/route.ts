import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin-auth";
import { createFeedbackIssue } from "@/lib/github";

// Lazy service-client construction — see comment in
// `src/app/api/admin/billing/expire/route.ts`.
function getService() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id: feedbackId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(feedbackId)) {
    return NextResponse.json({ error: "Invalid feedback id" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    admin_notes?: string | null;
  };
  const adminNotes = body.admin_notes?.trim() || null;

  // Load the feedback row
  const service = getService();
  const { data: row, error: selectErr } = await service
    .from("feedback")
    .select("id, type, message, email, status")
    .eq("id", feedbackId)
    .single();

  if (selectErr || !row) {
    return NextResponse.json(
      { error: selectErr?.message ?? "Feedback not found" },
      { status: 404 },
    );
  }

  if (row.status !== "new") {
    return NextResponse.json(
      { error: `Cannot approve — current status is ${row.status}` },
      { status: 409 },
    );
  }

  // Create the GH issue
  let issue;
  try {
    issue = await createFeedbackIssue({
      feedbackId: row.id,
      type: row.type,
      message: row.message,
      adminNotes,
      submitterEmail: row.email,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  // Flip the row to approved with the issue linkage
  const { error: updateErr } = await service
    .from("feedback")
    .update({
      status: "approved",
      admin_notes: adminNotes,
      github_issue_url: issue.url,
      github_issue_number: issue.number,
    })
    .eq("id", feedbackId);

  if (updateErr) {
    return NextResponse.json(
      { error: `Issue created (${issue.url}) but DB update failed: ${updateErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, issue });
}
