"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
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
            CAUSAL INTELLIGENCE PLATFORM
          </div>
          <div className="w-16 h-px bg-accent-cyan/40 mx-auto mt-4" />
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-5">
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
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-mono text-text-muted tracking-wider uppercase">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-[9px] font-mono text-text-muted hover:text-accent-cyan transition-colors tracking-wider"
              >
                FORGOT?
              </Link>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2.5 bg-surface border border-border rounded text-sm font-mono text-foreground placeholder:text-text-muted/50 focus:outline-none focus:border-accent-cyan/60 transition-colors"
              placeholder="Enter password"
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
            {loading ? "AUTHENTICATING..." : "ACCESS TERMINAL"}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-[9px] font-mono text-text-muted tracking-wider">
            OR
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Trial CTA */}
        <Link
          href="/trial-signup"
          className="block w-full py-2.5 text-center bg-surface border border-border rounded text-[11px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted hover:text-foreground hover:border-border-bright transition-all"
        >
          START 48-HOUR TRIAL
        </Link>

        <p className="text-center text-[9px] font-mono text-text-muted">
          Trial provides full platform access for 48 hours.
          <br />
          Have an invite code?{" "}
          <Link
            href="/trusted-signup"
            className="text-accent-cyan/70 hover:text-accent-cyan"
          >
            Activate full access
          </Link>
          {" · "}
          <a
            href="mailto:info@apexanalytica.co"
            className="text-accent-cyan/70 hover:text-accent-cyan"
          >
            info@apexanalytica.co
          </a>
        </p>
      </div>
    </div>
  );
}
