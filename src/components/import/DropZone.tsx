"use client";

import { useCallback, useRef, useState } from "react";

interface DropZoneProps {
  onFileSelected: (files: File[]) => void;
}

const ACCEPT =
  ".csv,.json,.graphml,.gml,.dot,.gv,.xlsx,.xls,.pdf";

export default function DropZone({ onFileSelected }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) onFileSelected(files);
    },
    [onFileSelected]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) onFileSelected(files);
    },
    [onFileSelected]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`
        flex flex-col items-center justify-center gap-4 p-12 rounded-lg cursor-pointer
        border-2 border-dashed transition-all duration-200
        ${
          dragOver
            ? "border-accent-cyan bg-accent-cyan/5 scale-[1.01]"
            : "border-border hover:border-text-muted"
        }
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        onChange={handleChange}
        className="hidden"
      />

      {/* Icon */}
      <div className="text-3xl text-text-muted">
        {dragOver ? "⬇" : "◇"}
      </div>

      {/* Text */}
      <div className="flex flex-col items-center gap-1">
        <span className="text-[11px] font-mono tracking-wider text-foreground">
          {dragOver ? "DROP FILES TO IMPORT" : "DRAG & DROP FILES OR CLICK TO SELECT"}
        </span>
        <span className="text-[9px] font-mono text-text-muted tracking-wider">
          CSV &middot; JSON &middot; GRAPHML &middot; DOT &middot; XLSX &middot; PDF
        </span>
      </div>
    </div>
  );
}
