// ─── TTS echo detection — token-overlap helpers ────────────────
//
// Used by the voice-mode loop to detect when the mic has captured
// the AI's own TTS bleeding back through speakers. Token-based
// (not literal substring) because SpeechRecognition transcribes
// "8.5" as "eight point five", drops hyphens ("omega-fragility"
// → "omega fragility"), and strips punctuation. Substring
// comparisons fail on those cases; token-overlap survives them.

/**
 * Lowercase alphanumeric tokens. Strips markdown, punctuation,
 * and condenses digits — the smallest unit at which "TTS audio
 * captured by the mic" and "original AI text" agree.
 */
export function tokenize(s: string): string[] {
  const m = s.toLowerCase().match(/[a-z0-9]+/g);
  return m ?? [];
}

/**
 * Fraction of `heard` tokens that appear in `aiSaid`'s token set.
 * 1.0 = every word in `heard` came from `aiSaid` (almost certainly
 * a mic capture of the AI's own TTS). Low values = the user said
 * genuinely new words.
 *
 * Returns 0 for empty inputs so callers can safely skip the
 * suppression branch when there's nothing to compare.
 */
export function echoOverlapRatio(heard: string, aiSaid: string): number {
  const heardTokens = tokenize(heard);
  if (heardTokens.length === 0) return 0;
  const aiTokens = new Set(tokenize(aiSaid));
  if (aiTokens.size === 0) return 0;
  let hits = 0;
  for (const t of heardTokens) if (aiTokens.has(t)) hits++;
  return hits / heardTokens.length;
}
