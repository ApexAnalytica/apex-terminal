"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const origin = window.location.origin;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback?next=/reset-password`,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <img
            src="/logo.png"
            alt="Manifold Logo"
            className="w-40 h-40 mx-auto object-contain"
          />
          <h1 className="text-xl font-[family-name:var(--font-michroma)] tracking-[0.3em] text-accent-cyan">
            MANIFOLD
          </h1>
          <span className="font-[family-name:var(--font-michroma)] text-[8px] tracking-[0.25em] text-text-muted">
            by APEX ANALYTICA
          </span>
          <div className="text-[10px] font-mono text-text-muted tracking-wider mt-1">
            PASSWORD RECOVERY
          </div>
          <div className="w-16 h-px bg-accent-cyan/40 mx-auto mt-4" />
        </div>

        {sent ? (
          <div className="space-y-5">
            <div className="text-[11px] font-mono text-accent-cyan bg-accent-cyan/5 border border-accent-cyan/20 rounded px-3 py-3 leading-relaxed">
              Reset link sent. Check <span className="text-foreground">{email}</span> for a message from Supabase Auth and follow the link to set a new password.
            </div>
            <Link
              href="/login"
              className="block w-full py-2.5 text-center bg-surface border border-border rounded text-[11px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted hover:text-foreground hover:border-border-bright transition-all"
            >
              BACK TO SIGN IN
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="text-[10px] font-mono text-text-muted leading-relaxed">
              Enter the email on your account. We&apos;ll send a one-time link you can use to set a new password.
            </div>

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
              {loading ? "SENDING..." : "SEND RESET LINK"}
            </button>

            <div className="text-center">
              <Link
                href="/login"
                className="text-[10px] font-mono text-text-muted hover:text-accent-cyan transition-colors"
              >
                {"\u2190"} Back to sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
