"use client";

import { useCallback, useRef, useState } from "react";

interface DropZoneProps {
  onFileSelected: (file: File) => void;
}

const ACCEPT =
  ".csv,.json,.graphml,.gml,.dot,.gv";

export default function DropZone({ onFileSelected }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) onFileSelected(file);
    },
    [onFileSelected]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFileSelected(file);
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
          {dragOver ? "DROP FILE TO IMPORT" : "DRAG & DROP OR CLICK TO SELECT"}
        </span>
        <span className="text-[9px] font-mono text-text-muted tracking-wider">
          CSV &middot; JSON &middot; GRAPHML &middot; DOT
        </span>
      </div>
    </div>
  );
}
