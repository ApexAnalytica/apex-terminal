"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TerminalLine, CausalShock } from "@/lib/types";
import { processCommand } from "@/lib/terminal-engine";

interface SyntheticTerminalProps {
  shocks: CausalShock[];
  onShockAdd: (shock: CausalShock) => void;
  onShockRemove: (id: string) => void;
}

export default function SyntheticTerminal({
  shocks,
  onShockAdd,
  onShockRemove,
}: SyntheticTerminalProps) {
  const [lines, setLines] = useState<TerminalLine[]>([
    {
      id: "init-1",
      type: "system",
      content:
        "APEX CAUSAL INTELLIGENCE TERMINAL v2.0 — Ω-Critical AI Systems™",
      timestamp: Date.now(),
    },
    {
      id: "init-2",
      type: "system",
      content: 'Type HELP for available commands. "Bits to Atoms" paradigm active.',
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const handleSubmit = () => {
    if (!input.trim()) return;

    const inputLine: TerminalLine = {
      id: `input-${Date.now()}`,
      type: "input",
      content: input,
      timestamp: Date.now(),
    };

    const result = processCommand(input, shocks);

    if (result.lines.some((l) => l.content === "__CLEAR__")) {
      setLines([]);
    } else {
      setLines((prev) => [...prev, inputLine, ...result.lines]);
    }

    if (result.shockToAdd) onShockAdd(result.shockToAdd);
    if (result.shockToRemove) onShockRemove(result.shockToRemove);

    setHistory((prev) => [input, ...prev]);
    setHistoryIndex(-1);
    setInput("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSubmit();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setInput(history[newIndex]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(history[newIndex]);
      } else {
        setHistoryIndex(-1);
        setInput("");
      }
    }
  };

  const getLineColor = (type: TerminalLine["type"]) => {
    switch (type) {
      case "input": return "var(--accent-cyan)";
      case "error": return "var(--accent-red)";
      case "warning": return "var(--accent-amber)";
      case "system": return "var(--text-muted)";
      default: return "var(--foreground)";
    }
  };

  return (
    <div
      className="flex flex-col h-full border-t border-border bg-surface"
      onClick={() => inputRef.current?.focus()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-border bg-surface-elevated">
        <div className="flex items-center gap-2">
          <span className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.2em] text-text-muted">
            SYNTHETIC SCIENTIST
          </span>
          <span className="text-[9px] text-text-muted">|</span>
          <span className="text-[9px] text-accent-green font-mono">READY</span>
        </div>
        <span className="text-[9px] text-text-muted font-mono">
          {lines.length} lines
        </span>
      </div>

      {/* Output */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-2 font-mono text-[12px] leading-5"
      >
        <AnimatePresence>
          {lines.map((line) => (
            <motion.div
              key={line.id}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.15 }}
              className="whitespace-pre-wrap"
              style={{ color: getLineColor(line.type) }}
            >
              {line.type === "input" ? (
                <span>
                  <span style={{ color: "var(--accent-cyan)" }}>&gt; </span>
                  {line.content}
                </span>
              ) : (
                line.content
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Input */}
      <div className="flex items-center px-4 py-2 border-t border-border">
        <span className="text-accent-cyan mr-2 text-sm">&gt;</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent font-mono text-[12px] text-foreground outline-none placeholder:text-text-muted caret-accent-cyan"
          placeholder="Enter causal query..."
          spellCheck={false}
          autoComplete="off"
        />
        <span className="cursor-blink text-accent-cyan ml-1">_</span>
      </div>
    </div>
  );
}
