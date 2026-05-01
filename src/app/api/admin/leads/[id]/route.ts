import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin-auth";

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_STATUSES = new Set([
  "new",
  "contacted",
  "trial-issued",
  "closed-won",
  "closed-lost",
]);

interface UpdateBody {
  status?: string;
  admin_notes?: string | null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
  }

  let body: UpdateBody;
  try {
    body = (await req.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !VALID_STATUSES.has(body.status)) {
      return NextResponse.json(
        { error: `status must be one of ${[...VALID_STATUSES].join(", ")}` },
        { status: 400 }
      );
    }
    update.status = body.status;
    // Stamp contacted_at the first time a lead moves out of 'new'.
    if (body.status !== "new") {
      update.contacted_at = new Date().toISOString();
    }
  }

  if (body.admin_notes !== undefined) {
    if (body.admin_notes !== null && typeof body.admin_notes !== "string") {
      return NextResponse.json(
        { error: "admin_notes must be a string or null" },
        { status: 400 }
      );
    }
    update.admin_notes = body.admin_notes;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "No fields to update (status or admin_notes)" },
      { status: 400 }
    );
  }

  const { error } = await service.from("leads").update(update).eq("id", id);
  if (error) {
    console.error("admin/leads update:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
