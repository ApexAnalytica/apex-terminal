import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin-auth";
import type { SubscriptionStatus, Tier } from "@/lib/billing";

// Lazy service-client construction — see comment in
// `src/app/api/admin/billing/expire/route.ts`. Eager init at module
// load was failing the production build's page-data collection.
function getService() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const VALID_TIERS = new Set<Tier>([
  "trial",
  "analyst",
  "multi_domain",
  "enterprise",
  "trusted",
  "expired",
]);

const VALID_STATUSES = new Set<SubscriptionStatus>([
  "active",
  "past_due",
  "canceled",
  "pending",
  "none",
]);

const PAID_TIERS = new Set<Tier>(["analyst", "multi_domain", "enterprise"]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface GrantBody {
  userId?: string;
  tier?: Tier;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  mercuryInvoiceId?: string | null;
  seats?: number | null;
  domainAccess?: string[] | null;
  subscriptionStatus?: SubscriptionStatus | null;
}

// Sets tier + billing fields on a profile. Used for: closing a sale
// (grant analyst/multi_domain/enterprise + period dates + invoice
// id), renewing (extend currentPeriodEnd), comping a user (set
// trusted), or extending a trial (set tier=trial + new period_end).
//
// All fields except userId and tier are optional — anything omitted
// from the body is left untouched on the row. Sensible defaults for
// subscription_status are applied when omitted.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: GrantBody;
  try {
    body = (await req.json()) as GrantBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.userId || !UUID_RE.test(body.userId)) {
    return NextResponse.json(
      { error: "userId (uuid) is required" },
      { status: 400 }
    );
  }
  if (!body.tier || !VALID_TIERS.has(body.tier)) {
    return NextResponse.json(
      { error: `tier must be one of ${[...VALID_TIERS].join(", ")}` },
      { status: 400 }
    );
  }
  if (
    body.subscriptionStatus !== undefined &&
    body.subscriptionStatus !== null &&
    !VALID_STATUSES.has(body.subscriptionStatus)
  ) {
    return NextResponse.json(
      {
        error: `subscriptionStatus must be one of ${[...VALID_STATUSES].join(", ")}`,
      },
      { status: 400 }
    );
  }
  if (body.seats !== undefined && body.seats !== null) {
    if (!Number.isInteger(body.seats) || body.seats < 1) {
      return NextResponse.json(
        { error: "seats must be an integer >= 1" },
        { status: 400 }
      );
    }
  }
  if (body.domainAccess !== undefined && body.domainAccess !== null) {
    if (
      !Array.isArray(body.domainAccess) ||
      body.domainAccess.some((d) => typeof d !== "string")
    ) {
      return NextResponse.json(
        { error: "domainAccess must be a string[] or null" },
        { status: 400 }
      );
    }
  }

  const update: Record<string, unknown> = { tier: body.tier };
  if (body.currentPeriodStart !== undefined)
    update.current_period_start = body.currentPeriodStart;
  if (body.currentPeriodEnd !== undefined)
    update.current_period_end = body.currentPeriodEnd;
  if (body.mercuryInvoiceId !== undefined)
    update.mercury_invoice_id = body.mercuryInvoiceId;
  if (body.seats !== undefined && body.seats !== null) update.seats = body.seats;
  if (body.domainAccess !== undefined) update.domain_access = body.domainAccess;

  // Apply default subscription_status when admin didn't specify one.
  if (body.subscriptionStatus !== undefined) {
    update.subscription_status = body.subscriptionStatus;
  } else {
    if (body.tier === "expired") update.subscription_status = "none";
    else if (body.tier === "trusted") update.subscription_status = "active";
    else if (body.tier === "trial") update.subscription_status = "active";
    else if (PAID_TIERS.has(body.tier) && body.currentPeriodEnd) {
      update.subscription_status = "active";
    }
  }

  const { error } = await getService()
    .from("profiles")
    .update(update)
    .eq("id", body.userId);

  if (error) {
    console.error("admin/billing/grant-tier:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
