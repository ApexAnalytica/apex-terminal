"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApexStore } from "@/stores/useApexStore";
import {
  processAction,
  processQuery,
  CopilotAction,
} from "@/lib/copilot-engine";
import { CopilotMessage } from "@/lib/types";

const ACTIONS: { label: string; action: CopilotAction; color: string }[] = [
  { label: "DISCOVER STRUCTURE", action: "DISCOVER_STRUCTURE", color: "var(--accent-cyan)" },
  { label: "EXPLAIN REJECTION", action: "EXPLAIN_REJECTION", color: "var(--accent-green)" },
  { label: "VERIFY LOGIC", action: "VERIFY_LOGIC", color: "var(--accent-amber)" },
];

function getRoleColor(role: CopilotMessage["role"]): string {
  switch (role) {
    case "system": return "var(--text-muted)";
    case "user": return "var(--accent-cyan)";
    case "assistant": return "var(--foreground)";
  }
}

function getRoleLabel(role: CopilotMessage["role"]): string {
  switch (role) {
    case "system": return "SYS";
    case "user": return "YOU";
    case "assistant": return "APEX";
  }
}

export default function SystemCopilot() {
  const { copilotMessages, addCopilotMessage, graphData } = useApexStore();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [copilotMessages]);

  const handleAction = (action: CopilotAction) => {
    const userMsg: CopilotMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: action.replace(/_/g, " "),
      timestamp: Date.now(),
    };
    addCopilotMessage(userMsg);

    const responses = processAction(action, graphData);
    responses.forEach((msg) => addCopilotMessage(msg));
  };

  const handleSubmit = () => {
    if (!input.trim()) return;

    const userMsg: CopilotMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input,
      timestamp: Date.now(),
    };
    addCopilotMessage(userMsg);

    const responses = processQuery(input, graphData);
    responses.forEach((msg) => addCopilotMessage(msg));

    setInput("");
  };

  return (
    <aside className="flex flex-col w-80 border-r border-border bg-surface h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-surface-elevated">
        <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.25em] text-accent-cyan">
          SYSTEM COPILOT
        </div>
        <div className="text-[9px] text-text-muted font-mono mt-0.5">
          Synthetic Scientist Interface
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-2"
      >
        <AnimatePresence>
          {copilotMessages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className="text-[11px] font-mono leading-relaxed"
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span
                  className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider"
                  style={{ color: getRoleColor(msg.role) }}
                >
                  {getRoleLabel(msg.role)}
                </span>
                {msg.module && (
                  <span className="text-[8px] text-text-muted tracking-wider uppercase">
                    [{msg.module}]
                  </span>
                )}
              </div>
              <div
                className="whitespace-pre-wrap pl-2 border-l border-border"
                style={{ color: getRoleColor(msg.role) }}
              >
                {msg.content}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Action Buttons */}
      <div className="px-3 py-2 border-t border-border flex flex-wrap gap-1.5">
        {ACTIONS.map((a) => (
          <button
            key={a.action}
            onClick={() => handleAction(a.action)}
            className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider px-2.5 py-1.5 rounded border transition-colors"
            style={{
              borderColor: `color-mix(in srgb, ${a.color} 40%, transparent)`,
              color: a.color,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${a.color} 10%, transparent)`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            {a.label}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="px-3 py-2 border-t border-border">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            className="flex-1 bg-surface-elevated font-mono text-[11px] text-foreground outline-none px-2.5 py-1.5 rounded border border-border placeholder:text-text-muted focus:border-accent-cyan/50 transition-colors"
            placeholder="Ask the system to analyze or verify..."
            spellCheck={false}
          />
          <button
            onClick={handleSubmit}
            className="text-[10px] text-accent-cyan font-mono px-2 py-1.5 hover:bg-accent-cyan/10 rounded transition-colors"
          >
            &gt;
          </button>
        </div>
      </div>
    </aside>
  );
}
