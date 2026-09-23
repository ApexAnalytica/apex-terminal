import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS, never exposed to the browser.
// Lazy-init: see comment in `src/app/api/admin/billing/expire/route.ts`.
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, orgName, inviteCode } = body;

    // ── Validate inputs ──────────────────────────────────────────
    if (!email || !password || !inviteCode) {
      return NextResponse.json(
        { error: "Missing required fields: email, password, inviteCode" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    // ── Validate invite code against env var ─────────────────────
    const validCode = process.env.TRUSTED_INVITE_CODE;
    if (!validCode) {
      console.error("TRUSTED_INVITE_CODE env var is not set");
      return NextResponse.json(
        { error: "Trusted signup is not configured. Contact the platform team." },
        { status: 503 }
      );
    }

    if (inviteCode !== validCode) {
      return NextResponse.json(
        { error: "Invalid invite code" },
        { status: 403 }
      );
    }

    // ── Create user via admin API (service-role) ─────────────────
    // The handle_new_user trigger reads `tier` from raw_user_meta_data
    // when invoked under service-role. Browser callers cannot reach
    // this path, so the metadata is trustworthy.
    const supabase = getSupabase();
    const { data, error: createError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // skip email verification for trusted users
        user_metadata: {
          tier: "trusted",
          org_name: orgName || null,
        },
      });

    if (createError) {
      console.error("Admin createUser error:", createError);
      // Surface user-facing messages for common cases
      if (createError.message?.includes("already been registered")) {
        return NextResponse.json(
          { error: "This email is already registered. Sign in instead, or contact the platform team to upgrade your access." },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: createError.message || "Failed to create user" },
        { status: 500 }
      );
    }

    // ── Belt-and-suspenders: explicitly flip the profile row ─────
    // The trigger should have created it as 'trusted' via metadata,
    // but we enforce it server-side in case the trigger logic ever
    // changes or the metadata key is renamed.
    if (data.user) {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          tier: "trusted",
          subscription_status: "active",
          trial_expires_at: null,
          current_period_end: null,
          access_type: "trusted",
        })
        .eq("id", data.user.id);

      if (updateError) {
        console.error("Profile update error (non-fatal):", updateError);
        // Non-fatal — the trigger should have handled it. Log and move on.
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Trusted signup API error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
