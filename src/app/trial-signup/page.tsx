"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

export default function TrialSignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          org_name: orgName || null,
          // Browser-supplied tier is intentionally ignored by the
          // handle_new_user trigger (forced to 'trial'). Sent for
          // forward-compat / observability only.
          tier: "trial",
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="text-center space-y-2">
          <Image
            src="/logo.png"
            alt="Manifold Logo"
            width={160}
            height={160}
            className="mx-auto object-contain"
            priority
          />
          <h1 className="text-xl font-[family-name:var(--font-michroma)] tracking-[0.3em] text-accent-cyan">
            MANIFOLD
          </h1>
          <span className="font-[family-name:var(--font-michroma)] text-[8px] tracking-[0.25em] text-text-muted">
            by APEX ANALYTICA
          </span>
          <div className="text-[10px] font-mono text-text-muted tracking-wider mt-1">
            48-HOUR TRIAL ACCESS
          </div>
          <div className="w-16 h-px bg-accent-cyan/40 mx-auto mt-4" />
        </div>

        {/* Trial info */}
        <div className="bg-surface border border-border rounded p-4 space-y-2">
          <div className="text-[10px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-cyan">
            WHAT YOU GET
          </div>
          <div className="text-[11px] font-mono text-text-muted leading-relaxed">
            Full access to Manifold for 48 hours.
            All modules active: Spirtes structure discovery, Tarski formal
            verification, Pearl intervention engine, Pareto optimization.
            Access expires automatically.
          </div>
        </div>

        {/* Signup Form */}
        <form onSubmit={handleSignup} className="space-y-5">
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-text-muted tracking-wider uppercase">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2.5 bg-surface border border-border rounded text-sm font-mono text-foreground placeholder:text-text-muted/50 focus:outline-none focus:border-accent-cyan/60 transition-colors"
              placeholder="you@organization.com"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-mono text-text-muted tracking-wider uppercase">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2.5 bg-surface border border-border rounded text-sm font-mono text-foreground placeholder:text-text-muted/50 focus:outline-none focus:border-accent-cyan/60 transition-colors"
              placeholder="Minimum 6 characters"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-mono text-text-muted tracking-wider uppercase">
              Organization{" "}
              <span className="text-text-muted/40">(optional)</span>
            </label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="w-full px-3 py-2.5 bg-surface border border-border rounded text-sm font-mono text-foreground placeholder:text-text-muted/50 focus:outline-none focus:border-accent-cyan/60 transition-colors"
              placeholder="Your company or fund"
            />
          </div>

          {error && (
            <div className="text-[11px] font-mono text-accent-red bg-accent-red/10 border border-accent-red/20 rounded px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-accent-cyan/10 border border-accent-cyan/40 rounded text-[11px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-cyan hover:bg-accent-cyan/20 hover:border-accent-cyan/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "CREATING ACCESS..." : "START TRIAL"}
          </button>
        </form>

        {/* Back to login */}
        <p className="text-center text-[10px] font-mono text-text-muted">
          Already have access?{" "}
          <Link
            href="/login"
            className="text-accent-cyan/70 hover:text-accent-cyan"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
