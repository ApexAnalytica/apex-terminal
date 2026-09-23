import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { TIER_LABELS, type Tier } from "@/lib/billing";
import UpgradeCTA from "@/components/UpgradeCTA";
import SignOutButton from "./SignOutButton";

export const dynamic = "force-dynamic";

export default async function ExpiredPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let tier: Tier | null = null;
  let orgName: string | null = null;
  let periodEnd: string | null = null;

  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("tier, org_name, current_period_end")
      .eq("id", user.id)
      .single<{ tier: Tier; org_name: string | null; current_period_end: string | null }>();
    if (data) {
      tier = data.tier;
      orgName = data.org_name;
      periodEnd = data.current_period_end;
    }
  }

  // Headline copy depends on which state the user is in: trial that
  // ran out, paid tier whose period lapsed, or admin-flipped expired.
  const headline =
    tier === "trial"
      ? "TRIAL ACCESS EXPIRED"
      : tier === "expired"
        ? "ACCESS EXPIRED"
        : "ACCESS EXPIRED";

  const blurb =
    tier === "trial"
      ? "Your 48-hour pilot has ended. Speak with us about an Analyst, Multi-Domain, or Enterprise seat."
      : tier === "expired"
        ? "Your subscription has lapsed. Schedule a call to renew, or email us to discuss an upgrade."
        : "Your access window has closed. Reach out to renew or upgrade.";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-7 text-center">
        <div className="space-y-2">
          <Image
            src="/logo.png"
            alt="Manifold"
            width={140}
            height={140}
            className="mx-auto object-contain"
            priority
          />
          <h1 className="text-xl font-[family-name:var(--font-michroma)] tracking-[0.3em] text-accent-cyan">
            MANIFOLD
          </h1>
          <span className="font-[family-name:var(--font-michroma)] text-[8px] tracking-[0.25em] text-text-muted">
            by APEX ANALYTICA
          </span>
          <div className="w-16 h-px bg-accent-red/40 mx-auto mt-3" />
        </div>

        <div className="bg-surface border border-accent-red/20 rounded p-6 space-y-4">
          <div className="text-[11px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-red">
            {headline}
          </div>
          <p className="text-[12px] font-mono text-text-muted leading-relaxed">
            {blurb}
          </p>

          {(orgName || tier) && (
            <div className="text-[10px] font-mono text-text-muted/80 border-t border-border pt-3 space-y-0.5">
              {orgName && <div>Org · {orgName}</div>}
              {tier && <div>Last tier · {TIER_LABELS[tier]}</div>}
              {periodEnd && (
                <div>
                  Period ended ·{" "}
                  {new Date(periodEnd).toISOString().slice(0, 10)}
                </div>
              )}
            </div>
          )}

          <div className="pt-2">
            <UpgradeCTA
              primaryLabel="Schedule a renewal call"
              subjectHint="Manifold renewal / upgrade"
            />
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 text-[10px] font-mono text-text-muted">
          <Link href="/pricing" className="hover:text-foreground">
            View pricing
          </Link>
          <span className="text-border">·</span>
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
