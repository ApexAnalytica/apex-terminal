import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { Resend } from "resend";

// Public lead-capture endpoint. Anonymous; rate-limiting and bot
// protection are out of scope here — Vercel/middleware can layer on
// later if abuse becomes real. Insert via service-role to bypass
// RLS predictably (the policy already allows anon inserts, this is
// belt-and-suspenders).

// Lazy service-client construction — see comment in
// `src/app/api/admin/billing/expire/route.ts`. Eager init at module
// load was breaking the production build's page-data collection.
function getService() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Resend is optional — if RESEND_API_KEY isn't set (dev environments,
// preview deploys without the secret) we skip the notification email
// and the lead still lands in public.leads. Admins fall back to
// /admin/leads in that case. Lazy-init for the same build-time reason.
function getResend(): Resend | null {
  return process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY)
    : null;
}

const NOTIFY_TO =
  process.env.RESEND_NOTIFY_TO ?? "info@apexanalytica.co";
const NOTIFY_FROM =
  process.env.RESEND_FROM ?? "Manifold <manifold@send.apexanalytica.co>";
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://manifold.apexanalytica.co";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FIELD = 500;
const MAX_USE_CASE = 4000;

interface LeadBody {
  name?: unknown;
  email?: unknown;
  organization?: unknown;
  useCase?: unknown;
  source?: unknown;
}

function asBoundedString(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface NotificationLead {
  name: string;
  email: string;
  organization: string;
  useCase: string | null;
  source: string;
}

function buildEmailHtml(lead: NotificationLead): string {
  const useCaseBlock = lead.useCase
    ? `<blockquote style="margin:8px 0;padding:8px 12px;border-left:3px solid #00e5ff;color:#444;white-space:pre-wrap">${escapeHtml(lead.useCase)}</blockquote>`
    : `<p style="color:#888"><em>(no use case provided)</em></p>`;
  return `
    <div style="font-family:ui-monospace,Menlo,monospace;font-size:13px;line-height:1.6;color:#222">
      <h2 style="margin:0 0 12px 0;font-size:14px;letter-spacing:0.1em;color:#0aa">NEW MANIFOLD ACCESS REQUEST</h2>
      <p><strong>${escapeHtml(lead.name)}</strong> &lt;<a href="mailto:${encodeURIComponent(lead.email)}">${escapeHtml(lead.email)}</a>&gt; from <strong>${escapeHtml(lead.organization)}</strong> requested access.</p>
      <p><strong>Source:</strong> ${escapeHtml(lead.source)}</p>
      <p><strong>Use case:</strong></p>
      ${useCaseBlock}
      <p style="margin-top:20px"><a href="${SITE_URL}/admin/leads" style="color:#0aa">View in admin console &rarr;</a></p>
    </div>
  `;
}

function buildEmailText(lead: NotificationLead): string {
  return [
    `New Manifold access request`,
    ``,
    `Name:         ${lead.name}`,
    `Email:        ${lead.email}`,
    `Organization: ${lead.organization}`,
    `Source:       ${lead.source}`,
    ``,
    `Use case:`,
    lead.useCase ?? "(no use case provided)",
    ``,
    `Admin console: ${SITE_URL}/admin/leads`,
  ].join("\n");
}

export async function POST(req: NextRequest) {
  let body: LeadBody;
  try {
    body = (await req.json()) as LeadBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = asBoundedString(body.name, MAX_FIELD);
  const email = asBoundedString(body.email, MAX_FIELD);
  const organization = asBoundedString(body.organization, MAX_FIELD);
  const useCase =
    body.useCase == null ? null : asBoundedString(body.useCase, MAX_USE_CASE);
  const source =
    asBoundedString(body.source, MAX_FIELD) ?? "request-access";

  if (!name) {
    return NextResponse.json(
      { error: "name is required (1-500 chars)" },
      { status: 400 }
    );
  }
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "valid email is required" },
      { status: 400 }
    );
  }
  if (!organization) {
    return NextResponse.json(
      { error: "organization is required (1-500 chars)" },
      { status: 400 }
    );
  }

  const lowercaseEmail = email.toLowerCase();

  const { error } = await getService().from("leads").insert({
    name,
    email: lowercaseEmail,
    organization,
    use_case: useCase,
    source,
  });

  if (error) {
    console.error("request-access insert error:", error);
    return NextResponse.json(
      { error: "Could not record request. Please email us instead." },
      { status: 500 }
    );
  }

  // Best-effort admin notification. The lead is already saved at this
  // point; an email failure should not roll the request back. We
  // await the send so Vercel doesn't kill the function before the
  // request hits Resend, but catch any error and log it.
  const resend = getResend();
  if (resend) {
    const lead: NotificationLead = {
      name,
      email: lowercaseEmail,
      organization,
      useCase,
      source,
    };
    try {
      await resend.emails.send({
        from: NOTIFY_FROM,
        to: NOTIFY_TO,
        replyTo: lowercaseEmail,
        subject: `[Manifold] Access request: ${name} @ ${organization}`,
        html: buildEmailHtml(lead),
        text: buildEmailText(lead),
      });
    } catch (err) {
      console.error("request-access notification failed:", err);
    }
  }

  return NextResponse.json({ success: true });
}

