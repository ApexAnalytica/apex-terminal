"use client";

import { useApexStore } from "@/stores/useApexStore";

export default function ImportButton() {
  const setImportModalOpen = useApexStore((s) => s.setImportModalOpen);

  return (
    <button
      onClick={() => setImportModalOpen(true)}
      data-tour="import-button"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-[9px] font-mono tracking-wider text-text-muted hover:text-accent-cyan hover:border-accent-cyan/40 transition-colors"
    >
      <span className="text-[10px]">+</span> IMPORT
    </button>
  );
}
