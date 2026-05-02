"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTTS, groupVoicesByLang } from "@/hooks/useTTS";

interface TTSControlsProps {
  /** Text to speak when the speaker button is clicked. */
  text: string;
  /** Optional override for the speaker label (a11y). */
  ariaLabel?: string;
}

/** Speaker button + language pill, used on the Domain Workspace modal so
 *  first-time users can hear the orientation aloud and pick the language
 *  they want it spoken in. The language pill draws from the browser's
 *  installed voices, so coverage matches what the user's OS supports — no
 *  curated list, no backend cost.
 *
 *  Designed to be reusable: if we add an in-tour speaker later, drop this
 *  same component into the tooltip and pass the current step's description. */
export default function TTSControls({ text, ariaLabel }: TTSControlsProps) {
  const {
    supported,
    voicesLoaded,
    voices,
    effectiveVoiceURI,
    setVoiceURI,
    isSpeaking,
    toggle,
    stop,
  } = useTTS();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  // Stop any in-flight utterance when language changes — re-pick should
  // start fresh in the new voice if the user clicks speaker again.
  useEffect(() => {
    stop();
    // intentionally only on effectiveVoiceURI change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveVoiceURI]);

  const grouped = useMemo(
    () => groupVoicesByLang(voices, typeof navigator !== "undefined" ? navigator.language : undefined),
    [voices],
  );

  const currentVoice = voices.find((v) => v.voiceURI === effectiveVoiceURI);
  const currentLangCode = currentVoice?.lang ?? "—";
  const currentLangShort = currentLangCode.split("-")[0].toUpperCase() || "—";

  if (!supported) return null;

  return (
    <div ref={containerRef} className="flex items-center gap-1.5 relative">
      {/* Speaker button — same 7x7 footprint as the "?" so the row aligns. */}
      <button
        onClick={() => toggle(text)}
        disabled={!voicesLoaded}
        className={`flex items-center justify-center w-7 h-7 rounded border transition-colors shrink-0 ${
          isSpeaking
            ? "border-accent-cyan/60 bg-accent-cyan/10 text-accent-cyan"
            : "border-border text-text-muted hover:text-accent-cyan hover:border-accent-cyan/40"
        } disabled:opacity-40 disabled:cursor-not-allowed`}
        title={isSpeaking ? "Stop reading" : "Read aloud"}
        aria-label={ariaLabel ?? (isSpeaking ? "Stop reading aloud" : "Read aloud")}
        aria-pressed={isSpeaking}
      >
        {isSpeaking ? <SpeakerActiveIcon /> : <SpeakerIcon />}
      </button>

      {/* Language pill — shows the current 2-letter lang code. Click to open
          a grouped voice picker. */}
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={!voicesLoaded}
        className="flex items-center gap-1 h-7 px-2 rounded border border-border text-[10px] font-mono tracking-wider text-text-muted hover:text-accent-cyan hover:border-accent-cyan/40 transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
        title={`Voice: ${currentVoice?.name ?? "—"} (${currentLangCode})`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{currentLangShort}</span>
        <span className="text-[8px] opacity-60">{open ? "▲" : "▼"}</span>
      </button>

      <AnimatePresence>
        {open && voicesLoaded && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-8 w-64 max-h-80 overflow-y-auto rounded-md border border-border bg-surface-elevated shadow-2xl z-[80]"
            role="listbox"
          >
            <div className="px-3 py-2 border-b border-border/50 text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted/70">
              {voices.length} VOICES · {grouped.length} LANGUAGES
            </div>
            {grouped.map(([lang, list]) => (
              <div key={lang} className="border-b border-border/30 last:border-b-0">
                <div className="px-3 pt-1.5 pb-0.5 text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted/60">
                  {lang}
                </div>
                {list.map((v) => {
                  const selected = v.voiceURI === effectiveVoiceURI;
                  return (
                    <button
                      key={v.voiceURI}
                      onClick={() => {
                        setVoiceURI(v.voiceURI);
                        setOpen(false);
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left transition-colors ${
                        selected
                          ? "bg-accent-cyan/10 text-accent-cyan"
                          : "text-text-muted hover:bg-white/[0.03] hover:text-foreground"
                      }`}
                      role="option"
                      aria-selected={selected}
                    >
                      <span className="text-[10px] font-mono truncate">{v.name}</span>
                      <span className="text-[9px] font-mono opacity-60 shrink-0">
                        {v.localService ? "local" : "net"}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
            {grouped.length === 0 && (
              <div className="px-3 py-4 text-[10px] font-mono text-text-muted/70 text-center">
                No voices available.
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Inline SVG icons ──────────────────────────────────────────────────
// Avoiding lucide / extra deps for two icons.

function SpeakerIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

function SpeakerActiveIcon() {
  // Same icon plus a small "playing" indicator — tiny dot bottom-right.
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07">
        <animate attributeName="opacity" values="0.4;1;0.4" dur="1.2s" repeatCount="indefinite" />
      </path>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14">
        <animate
          attributeName="opacity"
          values="0.2;1;0.2"
          dur="1.2s"
          begin="0.3s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  );
}
