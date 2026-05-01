"use client";

import Link from "next/link";
import { useState } from "react";
import { NAV, SITE } from "@/lib/site";

export default function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 md:px-6">
        {/* Brand */}
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-accent-cyan opacity-60 pulse-ring" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-cyan" />
          </span>
          <span className="font-[family-name:var(--font-michroma)] text-[12px] tracking-[0.3em] text-foreground group-hover:text-accent-cyan transition-colors">
            APEX ANALYTICA
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-7">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.25em] text-text-muted hover:text-accent-cyan transition-colors"
            >
              {item.label.toUpperCase()}
            </Link>
          ))}
        </nav>

        {/* Right CTAs */}
        <div className="hidden md:flex items-center gap-3">
          <a
            href={SITE.loginUrl}
            className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.25em] text-text-muted hover:text-foreground transition-colors"
          >
            LOGIN
          </a>
          <a
            href={SITE.trialUrl}
            className="px-3 py-2 bg-accent-cyan/10 border border-accent-cyan/40 rounded text-[10px] font-[family-name:var(--font-michroma)] tracking-[0.25em] text-accent-cyan hover:bg-accent-cyan/20 hover:border-accent-cyan/60 transition-all"
          >
            REQUEST ACCESS
          </a>
        </div>

        {/* Mobile menu button */}
        <button
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="md:hidden flex flex-col gap-1.5 p-2"
        >
          <span className={`block h-px w-5 bg-foreground transition-transform ${open ? "translate-y-[6px] rotate-45" : ""}`} />
          <span className={`block h-px w-5 bg-foreground transition-opacity ${open ? "opacity-0" : ""}`} />
          <span className={`block h-px w-5 bg-foreground transition-transform ${open ? "-translate-y-[6px] -rotate-45" : ""}`} />
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden border-t border-border bg-background">
          <div className="flex flex-col px-4 py-4 gap-4">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="font-[family-name:var(--font-michroma)] text-[11px] tracking-[0.25em] text-foreground hover:text-accent-cyan"
              >
                {item.label.toUpperCase()}
              </Link>
            ))}
            <div className="flex gap-3 pt-2">
              <a
                href={SITE.loginUrl}
                className="flex-1 text-center px-3 py-2 border border-border rounded text-[10px] font-[family-name:var(--font-michroma)] tracking-[0.25em] text-text-muted"
              >
                LOGIN
              </a>
              <a
                href={SITE.trialUrl}
                className="flex-1 text-center px-3 py-2 bg-accent-cyan/10 border border-accent-cyan/40 rounded text-[10px] font-[family-name:var(--font-michroma)] tracking-[0.25em] text-accent-cyan"
              >
                REQUEST ACCESS
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
