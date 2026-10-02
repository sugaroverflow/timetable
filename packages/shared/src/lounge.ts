/** ❤️ and 💙 are weighted votes in Topic, not reactions — a ❤️ react would
 * blur what they mean, so the Lounge refuses them (Ed, 2026-09-30). Any
 * spelling: with or without the variation selector. */
const RESERVED_REACTIONS = new Set(["❤", "❤️", "💙"]);

/** A single emoji grapheme — letters, digits and punctuation alone are
 * refused; ZWJ sequences, skin tones, flags and keycaps pass. */
const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u{20E3}/u;

/** Normalises a reaction for storage, or null when it isn't one emoji or is
 * reserved. The picker only offers valid emoji; this guards the API. */
export function normalizeReaction(raw: string): string | null {
  const emoji = raw.trim();
  if (emoji.length === 0 || emoji.length > 32) return null;
  if (RESERVED_REACTIONS.has(emoji)) return null;
  const graphemes = [
    ...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
      emoji,
    ),
  ];
  if (graphemes.length !== 1) return null;
  if (!EMOJI_RE.test(emoji)) return null;
  return emoji;
}
