"use client";

import { useCallback, useEffect, useState } from "react";

export type TextSize = "sm" | "md" | "lg";

const STORAGE_KEY = "manifold:text-size";
const DEFAULT: TextSize = "md";

export function isTextSize(v: unknown): v is TextSize {
  return v === "sm" || v === "md" || v === "lg";
}

function readStored(): TextSize {
  if (typeof window === "undefined") return DEFAULT;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return isTextSize(v) ? v : DEFAULT;
}

function apply(size: TextSize) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.textSize = size;
}

export function useTextSize(): { size: TextSize; setSize: (s: TextSize) => void } {
  const [size, setSizeState] = useState<TextSize>(DEFAULT);

  useEffect(() => {
    setSizeState(readStored());
  }, []);

  const setSize = useCallback((next: TextSize) => {
    setSizeState(next);
    apply(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* quota / disabled storage — ignore */
    }
  }, []);

  return { size, setSize };
}
