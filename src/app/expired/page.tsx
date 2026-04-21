"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

export default function ExpiredPage() {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8 text-center">
        {/* Logo */}
        <div className="space-y-2">
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
          <div className="w-16 h-px bg-accent-red/40 mx-auto mt-4" />
        </div>

        {/* Expired notice */}
        <div className="bg-surface border border-accent-red/20 rounded p-6 space-y-4">
          <div className="text-[11px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-red">
            TRIAL ACCESS EXPIRED
          </div>
          <p className="text-[12px] font-mono text-text-muted leading-relaxed">
            Your 48-hour trial access has ended. To continue using
            Manifold, contact us for extended or permanent access.
          </p>
          <a
            href="mailto:info@apexanalytica.co"
            className="inline-block px-5 py-2.5 bg-accent-cyan/10 border border-accent-cyan/40 rounded text-[11px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-cyan hover:bg-accent-cyan/20 hover:border-accent-cyan/60 transition-all"
          >
            CONTACT info@apexanalytica.co
          </a>
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="text-[10px] font-mono text-text-muted hover:text-foreground transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
