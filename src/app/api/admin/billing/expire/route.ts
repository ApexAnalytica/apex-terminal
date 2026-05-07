import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin-auth";

// Lazy service-client construction — calling createServiceClient at module
// load tripped Next.js's build-time page-data collection when env vars
// were absent (`Error: supabaseUrl is required.`), failing the entire
// production build. Defer to request time so the build never instantiates
// it; missing-env failures still surface, just as a runtime 500 instead
// of breaking deploy.
function getService() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Fast-path mutation to flip a customer to tier='expired' immediately.
// Equivalent to grant-tier { tier: 'expired' } but easier to use from
// the admin UI (single button, no form fill).
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await req.json().catch(() => ({}))) as { userId?: string };
  if (!body.userId || !UUID_RE.test(body.userId)) {
    return NextResponse.json(
      { error: "userId (uuid) is required" },
      { status: 400 }
    );
  }

  const { error } = await getService()
    .from("profiles")
    .update({
      tier: "expired",
      subscription_status: "none",
    })
    .eq("id", body.userId);

  if (error) {
    console.error("admin/billing/expire:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
