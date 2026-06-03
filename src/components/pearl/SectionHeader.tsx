"use client";

// ─── SectionHeader ───────────────────────────────────────────────
//
// The single header primitive for the redesigned PEARL workspace.
//
// Why this exists: the classic PEARL stack printed a permanently-
// visible gray explanatory paragraph under every panel title (plus a
// module-level intro blurb). That prose was always-on, ate vertical
// space, and buried the controls. Progressive disclosure (Nielsen
// 1995): show the title, defer the explanation to a `?` the analyst
// reveals on demand (hover / focus / click-to-pin).
//
// One component, used everywhere, so the headers are consistent —
// which is itself a cognitive-load win (predictable patterns let the
// eye move from reading to reasoning).

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export default function SectionHeader({
  title,
  accent = "var(--text-muted)",
  info,
  right,
  collapsible = false,
  collapsed = false,
  onToggleCollapse,
}: {
  /** Short uppercase label, e.g. "DEFINE CUTS". */
  title: string;
  /** Accent color var for the title text. */
  accent?: string;
  /** Plain-language help shown behind the `?`. Omit to hide the `?`. */
  info?: ReactNode;
  /** Optional right-aligned content (status chip, count, etc.). */
  right?: ReactNode;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  // Popover visibility = hovered OR focused OR pinned (clicked).
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || focused || pinned;
  const popId = useId();

  // The `?` popover renders into a body-level portal rather than as an
  // in-flow absolute child. The PEARL module panel is a fixed-width
  // (320px) column with `overflow-hidden` plus a scrolling `overflow-y-auto`
  // body — both clip an absolutely-positioned popover, so the widest and
  // most important explanation (DEFINE CUTS) was getting cut off exactly
  // where it mattered. A fixed-position portal escapes the clip; we clamp
  // `left` so it can never run off the viewport edge.
  const btnRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const POP_W = 240; // px — must match the w-60 below

  useEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const update = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const margin = 8;
      const left = Math.min(
        Math.max(margin, r.left),
        window.innerWidth - POP_W - margin,
      );
      setCoords({ top: r.bottom + 6, left });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  const TitleEl = (
    <span
      className="text-[11px] font-[family-name:var(--font-michroma)] tracking-wider"
      style={{ color: accent }}
    >
      {title}
    </span>
  );

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 min-w-0">
        {collapsible && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-expanded={!collapsed}
            className="text-text-muted hover:text-foreground transition-colors text-[9px] leading-none w-3"
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? "▸" : "▾"}
          </button>
        )}
        {TitleEl}
        {info && (
          <span className="relative inline-flex">
            <button
              ref={btnRef}
              type="button"
              aria-label={`About ${title}`}
              aria-describedby={open ? popId : undefined}
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onClick={() => setPinned((p) => !p)}
              className="flex items-center justify-center w-3.5 h-3.5 rounded-full border text-[8px] leading-none font-mono transition-colors"
              style={{
                borderColor: open ? accent : "var(--border)",
                color: open ? accent : "var(--text-muted)",
                background: open ? "color-mix(in srgb, var(--surface) 80%, transparent)" : "transparent",
              }}
            >
              ?
            </button>
            {open &&
              coords &&
              typeof document !== "undefined" &&
              createPortal(
                <div
                  id={popId}
                  role="tooltip"
                  className="fixed z-[100] w-60 rounded border bg-surface-elevated p-2 text-[9px] font-mono leading-relaxed text-text-muted shadow-lg"
                  style={{
                    top: coords.top,
                    left: coords.left,
                    borderColor: "var(--border)",
                  }}
                  onMouseEnter={() => setHovered(true)}
                  onMouseLeave={() => setHovered(false)}
                >
                  {info}
                </div>,
                document.body,
              )}
          </span>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
