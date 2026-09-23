"use client";

import { useEffect, useState, useCallback, useRef } from "react";

const STORAGE_KEY = "manifold:tts-voice-uri";

export interface TTSVoice {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
}

/** Hook around the browser's SpeechSynthesis API.
 *
 * Voices load asynchronously in some browsers (Chrome especially) — the
 * `voicesLoaded` flag flips true once we've heard from `getVoices()` with a
 * non-empty list. Until then, callers should treat the speaker control as
 * pending rather than missing.
 *
 * Selection is persisted in localStorage so the user's language choice
 * survives reloads and works the same way across the modal speaker, the
 * in-tour speaker (when added), and any future TTS surfaces.
 */
/** Resolve a sensible default voice when nothing is persisted. Order:
 *  navigator-language exact match → same base language → first English →
 *  first voice. Pure function so it can run during render or at speak-time. */
function pickDefaultVoice(voices: TTSVoice[]): TTSVoice | undefined {
  if (voices.length === 0) return undefined;
  const navLang = (typeof navigator !== "undefined" && navigator.language) || "en-US";
  const navPrefix = navLang.split("-")[0];
  const byLang = (test: (lang: string) => boolean) =>
    voices.find((v) => v.default && test(v.lang)) ?? voices.find((v) => test(v.lang));
  return (
    byLang((l) => l === navLang) ??
    byLang((l) => l.startsWith(navPrefix)) ??
    byLang((l) => l.startsWith("en")) ??
    voices[0]
  );
}

/** Read the persisted voice URI synchronously during render, so we don't
 *  need an effect (which the react-hooks lint rule flags as cascading-render
 *  risk). Returns null in SSR or when localStorage is unavailable. */
function readPersistedVoiceURI(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function useTTS() {
  const [voices, setVoices] = useState<TTSVoice[]>([]);
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  // Lazy initializer — runs once during the first render, no effect needed.
  const [voiceURI, setVoiceURIState] = useState<string | null>(() => readPersistedVoiceURI());
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // ─── Voice loading ─────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const sync = () => {
      const list = window.speechSynthesis.getVoices().map((v) => ({
        voiceURI: v.voiceURI,
        name: v.name,
        lang: v.lang,
        localService: v.localService,
        default: v.default,
      }));
      if (list.length > 0) {
        setVoices(list);
        setVoicesLoaded(true);
      }
    };

    sync();
    window.speechSynthesis.onvoiceschanged = sync;
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  const setVoiceURI = useCallback((uri: string) => {
    setVoiceURIState(uri);
    try {
      window.localStorage.setItem(STORAGE_KEY, uri);
    } catch {
      // ignore
    }
  }, []);

  // The voice we'll actually speak in: persisted choice, or a derived default
  // computed from the loaded voice list. Computed during render rather than
  // pushed into state so we don't need an effect to keep them in sync.
  const effectiveVoiceURI =
    voiceURI ?? (voicesLoaded ? pickDefaultVoice(voices)?.voiceURI ?? null : null);

  // ─── Speak / Stop ──────────────────────────────────────────────────
  const stop = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      // Always stop any in-flight utterance — clicking the speaker again should
      // toggle, not stack utterances.
      window.speechSynthesis.cancel();

      // Strip basic markdown noise so the voice doesn't say "asterisk" etc.
      const clean = text
        .replace(/[*_#`~]/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/\n{2,}/g, ". ")
        .replace(/\n/g, ", ")
        .trim();
      if (!clean) return;

      const utterance = new SpeechSynthesisUtterance(clean);
      const native = window.speechSynthesis
        .getVoices()
        .find((v) => v.voiceURI === effectiveVoiceURI);
      if (native) {
        utterance.voice = native;
        utterance.lang = native.lang;
      }
      utterance.rate = 0.95;
      utterance.pitch = 1;
      utterance.volume = 1;
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
      setIsSpeaking(true);
    },
    [effectiveVoiceURI],
  );

  const toggle = useCallback(
    (text: string) => {
      if (isSpeaking) {
        stop();
      } else {
        speak(text);
      }
    },
    [isSpeaking, speak, stop],
  );

  // Stop any in-flight utterance on unmount so closing the modal doesn't
  // leave the voice running.
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const supported = typeof window !== "undefined" && !!window.speechSynthesis;

  return {
    supported,
    voicesLoaded,
    voices,
    /** The voice the user has selected (persisted) or null if defaulting. */
    voiceURI,
    /** What we'll actually speak in — derives a default from the loaded
     *  voice list when nothing is persisted. Use this for UI display. */
    effectiveVoiceURI,
    setVoiceURI,
    isSpeaking,
    speak,
    stop,
    toggle,
  };
}

/** Group voices by their BCP-47 base language for a tidier dropdown. Returns
 *  pairs of [langCode, voices]. Sorts so the user's locale floats up. */
export function groupVoicesByLang(
  voices: TTSVoice[],
  preferredLang?: string,
): Array<[string, TTSVoice[]]> {
  const map = new Map<string, TTSVoice[]>();
  for (const v of voices) {
    const arr = map.get(v.lang) ?? [];
    arr.push(v);
    map.set(v.lang, arr);
  }
  const entries = Array.from(map.entries());
  const prefBase = preferredLang?.split("-")[0];
  entries.sort(([a], [b]) => {
    const aPref = prefBase ? a.startsWith(prefBase) : false;
    const bPref = prefBase ? b.startsWith(prefBase) : false;
    if (aPref !== bPref) return aPref ? -1 : 1;
    return a.localeCompare(b);
  });
  return entries;
}
