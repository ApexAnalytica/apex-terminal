import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin-auth";

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

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

  const { error } = await service
    .from("feedback")
    .update({ status: "rejected", admin_notes: adminNotes })
    .eq("id", feedbackId)
    .eq("status", "new");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
