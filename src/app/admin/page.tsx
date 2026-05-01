import Link from "next/link";
import { headers } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import TrustedInviteCard from "./TrustedInviteCard";

export const dynamic = "force-dynamic";

interface AdminCard {
  href: string;
  title: string;
  blurb: string;
  stats: Array<{ label: string; value: number | string; tone?: "default" | "warn" | "ok" }>;
}

export default async function AdminLandingPage() {
  // Middleware gates /admin/* via ADMIN_EMAILS, so service-role here is
  // safe and necessary — the anon-session client would hit RLS on most
  // of these tables and read zero rows.
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const thirtyDaysFromNow = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  const [profilesAll, profilesDueSoon, leadsNew, feedbackNew] =
    await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }),
      supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .lte("current_period_end", thirtyDaysFromNow)
        .neq("tier", "expired"),
      supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("status", "new"),
      supabase
        .from("feedback")
        .select("*", { count: "exact", head: true })
        .eq("status", "new"),
    ]);

  const cards: AdminCard[] = [
    {
      href: "/admin/billing",
      title: "BILLING",
      blurb:
        "Customer tiers, period dates, Mercury invoice tracking. Edit, expire, renew.",
      stats: [
        { label: "customers", value: profilesAll.count ?? 0 },
        {
          label: "due in 30d",
          value: profilesDueSoon.count ?? 0,
          tone: (profilesDueSoon.count ?? 0) > 0 ? "warn" : "default",
        },
      ],
    },
    {
      href: "/admin/leads",
      title: "LEADS",
      blurb:
        "Access requests from /request-access. Triage, take notes, transition status.",
      stats: [
        {
          label: "new",
          value: leadsNew.count ?? 0,
          tone: (leadsNew.count ?? 0) > 0 ? "warn" : "default",
        },
      ],
    },
    {
      href: "/admin/feedback",
      title: "FEEDBACK",
      blurb:
        "Product feedback inbox. Approve to GitHub issues, reject, track ship state.",
      stats: [
        {
          label: "new",
          value: feedbackNew.count ?? 0,
          tone: (feedbackNew.count ?? 0) > 0 ? "warn" : "default",
        },
      ],
    },
  ];

  // Build the absolute signup URL from the incoming request so it
  // works on prod, preview deploys, and localhost without hardcoding.
  const headersList = await headers();
  const host =
    headersList.get("host") ?? "manifold.apexanalytica.co";
  const proto =
    headersList.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const signupUrl = `${proto}://${host}/trusted-signup`;
  const inviteCode = process.env.TRUSTED_INVITE_CODE ?? null;

  return (
    <div className="min-h-screen bg-background text-foreground p-6 font-mono">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-[14px] font-[family-name:var(--font-michroma)] tracking-wider">
              ADMIN CONSOLE
            </h1>
            <div className="text-[10px] text-text-muted mt-1">
              Operational surfaces. Gated by ADMIN_EMAILS allowlist.
            </div>
          </div>
          <Link
            href="/"
            className="text-[10px] tracking-wider text-text-muted hover:text-foreground transition-colors"
          >
            ← WORKSPACE
          </Link>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group block border border-border rounded p-5 bg-surface hover:border-accent-cyan/40 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="text-[11px] font-[family-name:var(--font-michroma)] tracking-[0.2em] text-foreground group-hover:text-accent-cyan transition-colors">
                  {card.title}
                </div>
                <span className="text-[10px] text-text-muted/60 group-hover:text-accent-cyan/60 transition-colors">
                  →
                </span>
              </div>
              <p className="text-[10px] text-text-muted leading-relaxed mb-4">
                {card.blurb}
              </p>
              <div className="flex flex-wrap gap-3 pt-3 border-t border-border/60">
                {card.stats.map((s) => (
                  <div key={s.label} className="leading-tight">
                    <div
                      className={`text-[14px] font-[family-name:var(--font-michroma)] ${
                        s.tone === "warn"
                          ? "text-accent-amber"
                          : s.tone === "ok"
                            ? "text-accent-green"
                            : "text-foreground"
                      }`}
                    >
                      {s.value}
                    </div>
                    <div className="text-[8px] text-text-muted tracking-wider uppercase">
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-6">
          <TrustedInviteCard
            signupUrl={signupUrl}
            inviteCode={inviteCode}
          />
        </div>

        <div className="mt-10 text-[9px] text-text-muted/70 leading-relaxed border-t border-border/60 pt-4">
          For the canonical reference on the billing motion (sale closed,
          renewal due, comping, etc.), see{" "}
          <code className="text-text-muted">docs/BILLING.md</code> in the
          repo. Deferred items live in{" "}
          <code className="text-text-muted">BILLING_BLOCKERS.md</code>.
        </div>
      </div>
    </div>
  );
}
