"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DOC_INDEX, type DocEntry } from "@/lib/docs";

interface DocumentationDrawerProps {
  open: boolean;
  onClose: () => void;
}

// Per-slug fetched markdown cache. Lives outside the component so a
// drawer close/re-open keeps already-fetched docs in memory — the
// underlying files only change at deploy time, no invalidation needed.
const contentCache = new Map<string, string>();

/**
 * Right-anchored documentation drawer surfaced from the Settings →
 * Documentation menu entry. Lazy-loaded via next/dynamic so the
 * react-markdown chunk only lands on demand. Left rail is the
 * doc index (one entry per DOC_INDEX item); right pane fetches
 * the selected doc's markdown from /docs/<slug>.md on demand and
 * renders it.
 *
 * Search filters the left nav by title/blurb substring. Selecting
 * a result scrolls the right pane to top.
 */
export default function DocumentationDrawer({
  open,
  onClose,
}: DocumentationDrawerProps) {
  const [selectedSlug, setSelectedSlug] = useState<string>(DOC_INDEX[0].slug);
  // bumps on every successful fetch — used to invalidate the derived
  // `content` read below when the cache picks up a new entry.
  const [, setCacheTick] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered: DocEntry[] = useMemo(() => {
    if (!query.trim()) return [...DOC_INDEX];
    const q = query.trim().toLowerCase();
    return DOC_INDEX.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.blurb.toLowerCase().includes(q),
    );
  }, [query]);

  // Derived: the effective active slug is the user-selected slug if
  // it's still visible after filtering, else the first match. This
  // replaces a "useEffect → setActiveSlug" pattern that would trip
  // react-hooks/set-state-in-effect for no benefit — the result is
  // already a pure function of selectedSlug + filtered.
  const activeSlug =
    filtered.find((d) => d.slug === selectedSlug)?.slug ??
    filtered[0]?.slug ??
    selectedSlug;

  // Derived: content comes directly from the cache. The fetch effect
  // below is fire-and-forget — on success it populates the cache and
  // bumps cacheTick to force a re-render.
  const content = contentCache.get(activeSlug) ?? null;

  // Close on Escape — body click is handled by the backdrop.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Fetch on slug change. Cache hit → no work.
  useEffect(() => {
    if (!open) return;
    if (contentCache.has(activeSlug)) {
      // No state change needed — the derived `content` above already
      // reads the cached value on this render.
      return;
    }
    let cancelled = false;
    // Pre-fetch state — primes the loading indicator before kicking
    // off the async fetch below. Fires at most once per slug change,
    // so no cascading-renders concern.
    /* eslint-disable react-hooks/set-state-in-effect */
    setLoading(true);
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    fetch(`/docs/${activeSlug}.md`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => {
        if (cancelled) return;
        contentCache.set(activeSlug, text);
        // Bump the tick so the derived `content` re-reads the cache.
        setCacheTick((t) => t + 1);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "fetch failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSlug, open]);

  const handleSelect = useCallback((slug: string) => {
    setSelectedSlug(slug);
    // Scroll right pane back to top on switch.
    document
      .querySelector("[data-docs-content]")
      ?.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  const activeEntry = DOC_INDEX.find((d) => d.slug === activeSlug);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm"
            aria-hidden
          />
          {/* Drawer */}
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.2, ease: "easeOut" }}
            className="fixed right-0 top-0 bottom-0 z-50 w-[min(960px,90vw)] bg-surface-elevated border-l border-border shadow-2xl flex"
            role="dialog"
            aria-modal="true"
            aria-label="Documentation"
          >
            {/* Left nav */}
            <div className="w-64 border-r border-border flex flex-col">
              <div className="px-3 py-3 border-b border-border">
                <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-widest text-accent-cyan mb-2">
                  DOCUMENTATION
                </div>
                <input
                  type="search"
                  placeholder="Search…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full bg-surface border border-border rounded px-2 py-1 text-[11px] font-mono text-foreground placeholder:text-text-muted focus:outline-none focus:border-accent-cyan/60"
                />
              </div>
              <nav className="flex-1 overflow-y-auto py-2">
                {filtered.length === 0 ? (
                  <div className="px-3 py-4 text-[10px] font-mono text-text-muted">
                    No matches.
                  </div>
                ) : (
                  filtered.map((d) => {
                    const active = d.slug === activeSlug;
                    return (
                      <button
                        key={d.slug}
                        onClick={() => handleSelect(d.slug)}
                        className={`w-full text-left px-3 py-2 border-l-2 transition-colors ${
                          active
                            ? "border-accent-cyan bg-accent-cyan/5"
                            : "border-transparent hover:bg-surface"
                        }`}
                      >
                        <div
                          className={`text-[11px] font-[family-name:var(--font-michroma)] tracking-wider ${
                            active ? "text-accent-cyan" : "text-foreground"
                          }`}
                        >
                          {d.title}
                        </div>
                        <div className="text-[9px] font-mono text-text-muted mt-0.5 leading-snug">
                          {d.blurb}
                        </div>
                      </button>
                    );
                  })
                )}
              </nav>
              <div className="px-3 py-2 border-t border-border">
                <button
                  onClick={onClose}
                  className="w-full text-[10px] font-mono text-text-muted hover:text-accent-red transition-colors"
                >
                  Close (Esc)
                </button>
              </div>
            </div>

            {/* Right content */}
            <div
              data-docs-content
              className="flex-1 overflow-y-auto px-8 py-6"
            >
              {activeEntry && (
                <div className="mb-4 pb-3 border-b border-border">
                  <h1 className="text-[18px] font-[family-name:var(--font-michroma)] tracking-wider text-foreground">
                    {activeEntry.title}
                  </h1>
                  <p className="text-[11px] font-mono text-text-muted mt-1">
                    {activeEntry.blurb}
                  </p>
                </div>
              )}
              {loading && (
                <div className="text-[11px] font-mono text-text-muted animate-pulse">
                  Loading…
                </div>
              )}
              {error && (
                <div className="text-[11px] font-mono text-accent-red">
                  Failed to load: {error}
                </div>
              )}
              {!loading && !error && content && (
                <article className="prose prose-invert max-w-none text-[12px] font-mono prose-headings:font-[family-name:var(--font-michroma)] prose-headings:tracking-wider prose-headings:text-foreground prose-a:text-accent-cyan prose-code:text-accent-cyan prose-code:bg-surface prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-pre:bg-surface prose-pre:border prose-pre:border-border">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {content}
                  </ReactMarkdown>
                </article>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
