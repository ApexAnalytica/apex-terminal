"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApexStore } from "@/stores/useApexStore";
import { useTextSize, type TextSize } from "@/hooks/useTextSize";

const TEXT_OPTIONS: Array<{ value: TextSize; label: string; title: string }> = [
  { value: "sm", label: "S", title: "Small text" },
  { value: "md", label: "M", title: "Medium text (default)" },
  { value: "lg", label: "L", title: "Large text" },
];

/** Feather "settings" gear, inline so it stays crisp and never renders
 *  as a color emoji the way a ⚙ glyph can on some platforms. */
function GearIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/**
 * SettingsMenu — the single gear dropdown in the top-right.
 *
 * Consolidates what used to be five separate header controls (the
 * +IMPORT button, the S/M/L text-size toggle, the "?" tour button, a
 * decorative "TECH 2.0 / CAUSAL DERIVATION" label, and a standalone
 * SIGN OUT) into one menu, so the header reads clean. Contents:
 *   - signed-in account + sign out
 *   - text size (S / M / L)
 *   - import data
 *   - tutorial (relaunch the guided tour)
 *   - a small version stamp (where the old decorative label's only real
 *     payload — a version — honestly belongs)
 */
export default function SettingsMenu() {
  const setImportModalOpen = useApexStore((s) => s.setImportModalOpen);
  const setTourActive = useApexStore((s) => s.setTourActive);
  // Pulled so handleSignOut can wipe any LLM API keys the user pasted
  // into the import / news / column-mapper panels. Keys live only in
  // memory but a shared-machine logout that didn't clear them would
  // leave them readable to the next session via DevTools console.
  const setClaudeApiKey = useApexStore((s) => s.setClaudeApiKey);
  const setGeminiApiKey = useApexStore((s) => s.setGeminiApiKey);
  const { size, setSize } = useTextSize();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Lazily resolve the signed-in email only when the menu first opens,
  // so the @supabase/ssr chunk stays off the eager bundle.
  useEffect(() => {
    if (!open || email) return;
    let cancelled = false;
    import("@/lib/supabase/client").then(({ createClient }) => {
      if (cancelled) return;
      createClient()
        .auth.getUser()
        .then(({ data: { user } }) => {
          if (!cancelled && user?.email) setEmail(user.email);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [open, email]);

  const handleSignOut = useCallback(async () => {
    // Wipe LLM keys from the in-memory store BEFORE the auth call so
    // the keys can't ride along in any straggling network requests
    // that fire during the auth tear-down (the auth state change
    // triggers re-render of the LLM-using panels). Idempotent and
    // safe even if the keys were already empty.
    setClaudeApiKey("");
    setGeminiApiKey("");
    const { createClient } = await import("@/lib/supabase/client");
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }, [router, setClaudeApiKey, setGeminiApiKey]);

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        data-tour="settings-menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Settings"
        title="Settings"
        className={`flex items-center justify-center w-7 h-7 rounded border transition-colors ${
          open
            ? "border-accent-cyan/60 text-accent-cyan"
            : "border-border text-text-muted hover:text-accent-cyan hover:border-accent-cyan/40"
        }`}
      >
        <GearIcon />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 z-30 w-60 bg-surface-elevated border border-border rounded shadow-2xl overflow-hidden"
        >
          {/* Account */}
          <div className="px-3 py-2.5 border-b border-border">
            <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-widest text-text-muted mb-0.5">
              SIGNED IN
            </div>
            <div className="text-[11px] font-mono text-foreground truncate">
              {email ?? "—"}
            </div>
          </div>

          {/* Text size */}
          <div className="px-3 py-2.5 border-b border-border">
            <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-widest text-text-muted mb-1.5">
              TEXT SIZE
            </div>
            <div
              className="flex items-center rounded border border-border overflow-hidden"
              role="radiogroup"
              aria-label="Text size"
            >
              {TEXT_OPTIONS.map((opt) => {
                const active = size === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setSize(opt.value)}
                    role="radio"
                    aria-checked={active}
                    title={opt.title}
                    className={`flex-1 h-7 flex items-center justify-center text-[10px] font-[family-name:var(--font-michroma)] tracking-wider transition-colors ${
                      active
                        ? "bg-accent-cyan/10 text-accent-cyan"
                        : "text-text-muted hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="py-1">
            <button
              role="menuitem"
              onClick={() => {
                setImportModalOpen(true);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-mono text-text-muted hover:text-accent-cyan hover:bg-accent-cyan/5 transition-colors"
            >
              <span className="text-accent-cyan/70 w-3.5 text-center">+</span>
              Import data
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setTourActive(true);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-mono text-text-muted hover:text-accent-cyan hover:bg-accent-cyan/5 transition-colors"
            >
              <span className="text-accent-cyan/70 w-3.5 text-center">?</span>
              Tutorial
            </button>
          </div>

          {/* Sign out */}
          <div className="py-1 border-t border-border">
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                handleSignOut();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-mono text-text-muted hover:text-accent-red hover:bg-accent-red/5 transition-colors"
            >
              <span className="w-3.5 text-center">⏻</span>
              Sign out
            </button>
          </div>

          {/* Version stamp */}
          <div className="px-3 py-1.5 border-t border-border">
            <span className="text-[8px] font-mono tracking-widest text-text-muted">
              MANIFOLD v2.0
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
