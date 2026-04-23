"use client";

import { useTextSize, type TextSize } from "@/hooks/useTextSize";

const OPTIONS: Array<{ value: TextSize; label: string; title: string }> = [
  { value: "sm", label: "S", title: "Small text" },
  { value: "md", label: "M", title: "Medium text (default)" },
  { value: "lg", label: "L", title: "Large text" },
];

export default function TextSizeToggle() {
  const { size, setSize } = useTextSize();
  return (
    <div
      className="hidden md:flex items-center rounded border border-border overflow-hidden shrink-0"
      role="radiogroup"
      aria-label="Text size"
      data-tour="text-size-toggle"
    >
      {OPTIONS.map((opt) => {
        const active = size === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => setSize(opt.value)}
            role="radio"
            aria-checked={active}
            title={opt.title}
            className={`w-6 h-7 flex items-center justify-center text-[10px] font-[family-name:var(--font-michroma)] tracking-wider transition-colors ${
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
  );
}
