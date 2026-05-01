"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useApexStore } from "@/stores/useApexStore";
import { NODE_CATEGORIES } from "./DomainSelector";

export default function CategoryFilterDropdown() {
  const visibleCategories = useApexStore((s) => s.visibleCategories);
  const setVisibleCategories = useApexStore((s) => s.setVisibleCategories);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const toggle = useCallback(
    (id: string) => {
      const next = new Set(visibleCategories);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setVisibleCategories(next);
    },
    [visibleCategories, setVisibleCategories]
  );

  const clear = useCallback(() => setVisibleCategories(new Set()), [setVisibleCategories]);

  const count = visibleCategories.size;
  const triggerLabel = count === 0 ? "ALL CATEGORIES" : `${count} CATEGOR${count === 1 ? "Y" : "IES"}`;

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 px-2 py-1 rounded border border-border hover:border-accent-cyan/40 transition-colors group"
        title="Filter visible node categories"
        data-tour="category-filter"
      >
        <span className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted group-hover:text-accent-cyan transition-colors">
          {triggerLabel}
        </span>
        <span
          className="text-[8px] text-text-muted group-hover:text-accent-cyan transition-all"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          ▾
        </span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-56 rounded border border-border bg-surface-elevated shadow-lg p-2">
          <div className="text-[7px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted/60 mb-1.5 px-1">
            NODE CATEGORIES
            <span className="ml-2 text-[7px] font-mono text-text-muted/40">
              {count === 0 ? "showing all" : `${count} selected`}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            {NODE_CATEGORIES.map((cat) => {
              const checked = visibleCategories.has(cat.id);
              return (
                <button
                  key={cat.id}
                  onClick={() => toggle(cat.id)}
                  className="flex items-center gap-2 px-2 py-1 rounded text-[9px] font-mono hover:bg-border/30 transition-colors text-left"
                  style={{
                    color: count === 0 || checked ? "var(--foreground)" : "var(--text-muted)",
                    opacity: count === 0 || checked ? 1 : 0.5,
                  }}
                >
                  <span
                    className="w-3 h-3 rounded-sm border flex items-center justify-center text-[8px]"
                    style={{
                      borderColor: checked ? "var(--accent-cyan)" : "var(--border)",
                      backgroundColor: checked ? "rgba(0,229,255,0.15)" : "transparent",
                      color: "var(--accent-cyan)",
                    }}
                  >
                    {checked ? "✓" : ""}
                  </span>
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
          {count > 0 && (
            <button
              onClick={clear}
              className="mt-2 w-full px-2 py-1 text-[8px] font-mono text-accent-cyan/60 hover:text-accent-cyan transition-colors text-left"
            >
              ✕ CLEAR FILTERS
            </button>
          )}
        </div>
      )}
    </div>
  );
}
