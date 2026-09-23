import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Lazy service-client construction — see comment in
// `src/app/api/admin/billing/expire/route.ts`. Eager init at module
// load failed Next.js's build-time page-data collection.
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, message, email } = body;

    if (!type || !message) {
      return NextResponse.json(
        { error: "Missing required fields: type, message" },
        { status: 400 }
      );
    }

    const { error } = await getSupabase()
      .from("feedback")
      .insert({ type, message, email: email || null });

    if (error) {
      console.error("Supabase feedback error:", error);
      return NextResponse.json(
        { error: "Failed to save feedback" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Feedback API error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
