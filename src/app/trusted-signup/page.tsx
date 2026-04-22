"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function TrustedSignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Step 1: Create the trusted user via our server-side API route
      // (service-role, validates invite code, creates profile as trusted)
      const res = await fetch("/api/trusted-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, orgName, inviteCode }),
      });

      const result = await res.json();

      if (!res.ok) {
        setError(result.error || "Signup failed");
        setLoading(false);
        return;
      }

      // Step 2: Sign in immediately so the session cookie is set
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
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
            AUTHORIZED ACCESS
          </div>
          <div className="w-16 h-px bg-accent-cyan/40 mx-auto mt-4" />
        </div>

        {/* Trusted access info */}
        <div className="bg-surface border border-accent-cyan/20 rounded p-4 space-y-2">
          <div className="text-[10px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-cyan">
            FULL ACCESS
          </div>
          <div className="text-[11px] font-mono text-text-muted leading-relaxed">
            Create your account with an invite code from the Apex Analytica
            team. Full platform access with no expiration.
          </div>
        </div>

        {/* Signup Form */}
        <form onSubmit={handleSignup} className="space-y-5">
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-text-muted tracking-wider uppercase">
              Invite Code
            </label>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              required
              className="w-full px-3 py-2.5 bg-surface border border-accent-cyan/30 rounded text-sm font-mono text-accent-cyan placeholder:text-text-muted/50 focus:outline-none focus:border-accent-cyan/60 transition-colors tracking-wider"
              placeholder="Enter invite code"
            />
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
            {loading ? "CREATING ACCESS..." : "ACTIVATE ACCESS"}
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
