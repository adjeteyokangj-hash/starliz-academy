export type SpeechMatchResult = "exact" | "close" | "wrong";

/** Map spoken letter names to their single-character form */
const LETTER_NAME_MAP: Record<string, string> = {
  ay: "a", bee: "b", see: "c", dee: "d", ee: "e", ef: "f",
  gee: "g", aitch: "h", eye: "i", jay: "j", kay: "k", el: "l",
  em: "m", en: "n", oh: "o", pee: "p", cue: "q", ar: "r",
  ess: "s", tee: "t", you: "u", vee: "v", "double you": "w",
  ex: "x", why: "y", zed: "z", zee: "z",
};

/** Spoken phrase prefixes to strip before comparing to target */
const PHRASE_PREFIXES = [
  "the word ", "the letter ", "it is ", "i see ", "i say ",
  "that is ", "word ", "letter ", "lowercase ", "capital ", "uppercase ",
];

/** Common child speech recognition mishears for short CVC-style words */
const COMMON_MISHEARS: Record<string, string[]> = {
  cat: ["cut", "cap", "cot", "cart", "kit"],
  dog: ["dock", "dug", "dot", "dig"],
  pin: ["pen", "bin", "pan"],
  bed: ["bad", "bid", "bet"],
  mat: ["mad", "met", "bat"],
  hat: ["hot", "hit", "had"],
  cup: ["cap", "cop", "cut"],
  sit: ["set", "sat", "bit"],
  hop: ["hot", "hip", "top"],
  big: ["bag", "bug", "bit"],
  red: ["rid", "rod", "bed"],
  run: ["ran", "fun", "rung"],
  sun: ["son", "sin", "gun"],
  hen: ["him", "hip", "pen"],
  pig: ["peg", "big", "pit"],
  bus: ["boss", "bud", "pus"],
  mud: ["mad", "mod", "bud"],
  fox: ["box", "sock", "fax"],
  log: ["lag", "leg", "dog"],
  wet: ["set", "wit", "bet"],
};

function stripPunctuation(text: string): string {
  return text.replace(/[.,!?'"]/g, "").trim();
}

function stripPhrasePrefix(text: string): string {
  for (const prefix of PHRASE_PREFIXES) {
    if (text.startsWith(prefix)) {
      return text.slice(prefix.length).trim();
    }
  }
  return text;
}

function resolveLetterName(text: string): string {
  return LETTER_NAME_MAP[text] ?? text;
}

function countCharDiffs(a: string, b: string): number {
  if (a.length !== b.length) return Infinity;
  let diffs = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) diffs++;
  }
  return diffs;
}

/**
 * Classify how well a spoken transcript matches a target word.
 * Returns "exact" (accept), "close" (gentle retry), or "wrong" (support needed).
 */
export function classifySpeechMatch(spoken: string, target: string): SpeechMatchResult {
  const t = target.toLowerCase().trim();
  const raw = spoken.toLowerCase().trim();

  // Step 1: Strip trailing punctuation
  const s = stripPunctuation(raw);

  // Step 2: Direct exact match
  if (s === t) return "exact";

  // Step 3: Phrase extraction ("the word cat" → "cat")
  const stripped = stripPhrasePrefix(s);
  if (stripped === t) return "exact";

  // Step 4: Letter name resolution ("ay" → "a")
  if (resolveLetterName(stripped) === t) return "exact";
  if (resolveLetterName(s) === t) return "exact";

  // Step 5: Target word appears as a whole word in transcript
  const words = s.split(/\s+/);
  if (words.includes(t)) return "exact";
  const strippedWords = stripped.split(/\s+/);
  if (strippedWords.includes(t)) return "exact";

  // Step 6: Common mishear map for short words (child voice accuracy)
  if (COMMON_MISHEARS[t]?.includes(s) || COMMON_MISHEARS[t]?.includes(stripped)) return "close";

  // Step 7: Short word fuzzy — only 1 character different (words 2–5 chars)
  if (t.length >= 2 && t.length <= 5) {
    const candidate = s.length === t.length ? s : stripped.length === t.length ? stripped : null;
    if (candidate !== null && countCharDiffs(t, candidate) === 1) return "close";
  }

  return "wrong";
}

export function checkPronunciation(spoken: string, target: string): boolean {
  if (!spoken) return false;
  const result = classifySpeechMatch(spoken, target);
  return result === "exact" || result === "close";
}
