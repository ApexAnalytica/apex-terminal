"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const REQUEST_TYPES = [
  { value: "feedback", label: "FEEDBACK" },
  { value: "feature_request", label: "FEATURE REQUEST" },
  { value: "data_request", label: "DATA REQUEST" },
] as const;

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string>("feedback");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setUserEmail(user.email);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;

    setStatus("sending");

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, message, email: userEmail }),
      });

      if (res.ok) {
        setStatus("sent");
        setMessage("");
        setTimeout(() => {
          setStatus("idle");
          setOpen(false);
        }, 2000);
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Expanded panel */}
      {open && (
        <div className="mb-2 w-80 bg-surface-elevated border border-border rounded-lg shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-[10px] font-[family-name:var(--font-michroma)] tracking-wider text-foreground">
              SUBMIT REQUEST
            </span>
            <button
              onClick={() => setOpen(false)}
              className="text-text-muted hover:text-foreground text-xs transition-colors"
            >
              &times;
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-4 space-y-3">
            {/* Type selector */}
            <div className="flex gap-1">
              {REQUEST_TYPES.map((rt) => (
                <button
                  key={rt.value}
                  type="button"
                  onClick={() => setType(rt.value)}
                  className={`flex-1 py-1.5 text-[8px] font-[family-name:var(--font-michroma)] tracking-wider rounded border transition-all ${
                    type === rt.value
                      ? "bg-accent-cyan/10 border-accent-cyan/40 text-accent-cyan"
                      : "bg-surface border-border text-text-muted hover:text-foreground hover:border-border-bright"
                  }`}
                >
                  {rt.label}
                </button>
              ))}
            </div>

            {/* Message */}
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              rows={4}
              placeholder="Describe what you'd like to see..."
              className="w-full px-3 py-2 bg-surface border border-border rounded text-[11px] font-mono text-foreground placeholder:text-text-muted/50 focus:outline-none focus:border-accent-cyan/60 transition-colors resize-none"
            />

            {/* User email display */}
            {userEmail && (
              <div className="text-[9px] font-mono text-text-muted">
                Submitting as {userEmail}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={status === "sending" || !message.trim()}
              className="w-full py-2 bg-accent-cyan/10 border border-accent-cyan/40 rounded text-[10px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-cyan hover:bg-accent-cyan/20 hover:border-accent-cyan/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "sending"
                ? "SENDING..."
                : status === "sent"
                  ? "SENT"
                  : status === "error"
                    ? "FAILED — RETRY"
                    : "SUBMIT"}
            </button>
          </form>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-4 py-2 rounded-full border shadow-lg transition-all ${
          open
            ? "bg-accent-cyan/10 border-accent-cyan/40 text-accent-cyan"
            : "bg-surface-elevated border-border text-text-muted hover:text-foreground hover:border-border-bright"
        }`}
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-cyan opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-cyan" />
        </span>
        <span className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider">
          FEEDBACK
        </span>
      </button>
    </div>
  );
}
