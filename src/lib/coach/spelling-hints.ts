// ─────────────────────────────────────────────────────────────────────────────
// Spelling coach — deterministic hint builder
// Handles phonics, syllable splitting, visual patterns, mnemonics
// ─────────────────────────────────────────────────────────────────────────────

import { AgeBand, CoachContext, CoachFollowUp, CoachResponse, CoachStep } from "./types";

// ── Phoneme breakdown ─────────────────────────────────────────────────────────

/** Return phoneme-level breakdown for common patterns. Fallback: letter-by-letter. */
function splitPhonemes(word: string): string[] {
  const w = word.toLowerCase();

  // Common digraphs / trigraphs to keep together
  const digraphs = ["igh", "tch", "dge", "tion", "sion", "ough", "augh", "th", "ch", "sh", "ph", "wh", "ck", "ng", "qu", "ea", "ee", "oo", "ou", "ow", "oi", "oy", "au", "aw", "ai", "ay"];

  const phonemes: string[] = [];
  let i = 0;
  while (i < w.length) {
    let matched = false;
    for (const dg of digraphs) {
      if (w.startsWith(dg, i)) {
        phonemes.push(dg);
        i += dg.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      phonemes.push(w[i]!);
      i++;
    }
  }
  return phonemes;
}

/** Split word into syllables using basic vowel-consonant rules. */
function splitSyllables(word: string): string[] {
  if (!word) return [word];
  const w = word.toLowerCase();
  const vowels = "aeiouy";
  const syllables: string[] = [];
  let start = 0;

  for (let i = 1; i < w.length - 1; i++) {
    const isVowel = vowels.includes(w[i] ?? "");
    const nextIsVowel = vowels.includes(w[i + 1] ?? "");
    const prevIsVowel = vowels.includes(w[i - 1] ?? "");

    // VC | CV split
    if (!isVowel && prevIsVowel && !nextIsVowel && i - start > 1) {
      syllables.push(word.slice(start, i + 1));
      start = i + 1;
    }
  }
  syllables.push(word.slice(start));
  return syllables.filter(Boolean);
}

// ── Spelling patterns ─────────────────────────────────────────────────────────

type SpellingPattern =
  | "silent_letter"   // e.g. knight, wrap, gnome
  | "double_letter"   // e.g. accommodate, necessary
  | "ie_ei"           // "i before e except after c"
  | "suffix"          // -tion, -sion, -ous, -ful, -ness, -ing
  | "prefix"          // un-, pre-, dis-, mis-
  | "homophones"      // their/there, to/too/two
  | "compound"        // e.g. something, cannot
  | "common";         // no special pattern

function detectPattern(word: string): SpellingPattern {
  const w = word.toLowerCase();
  if (/kn|wr|gn|mb|gh(?!t)/.test(w)) return "silent_letter";
  if (/(.)\1{1}/.test(w)) return "double_letter";
  if (/ie|ei/.test(w)) return "ie_ei";
  if (/tion$|sion$|ous$|ful$|ness$|ment$|ible$|able$|ive$/.test(w)) return "suffix";
  if (/^un|^pre|^dis|^mis|^re|^over|^under/.test(w)) return "prefix";
  return "common";
}

// ── Follow-up builders ────────────────────────────────────────────────────────

function phonicsFollowUp(word: string, phonemes: string[]): CoachFollowUp {
  const firstSound = phonemes[0] ?? word[0] ?? "";
  return {
    question: `What is the first sound in "${word}"?`,
    options: [firstSound, phonemes[1] ?? word[1] ?? "?", phonemes[phonemes.length - 1] ?? "?", word[word.length - 1] ?? "?"],
    correctIndex: 0,
    onCorrect: `Yes! The first sound is "${firstSound}". Now say the word sound by sound: ${phonemes.join(" • ")}.`,
    onWrong: `The first sound in "${word}" is "${firstSound}" — listen carefully: ${phonemes.slice(0, 3).join(" • ")}…`,
  };
}

function syllableFollowUp(word: string, syllables: string[]): CoachFollowUp {
  return {
    question: `How many syllables (beats) does "${word}" have?`,
    options: [String(syllables.length), String(syllables.length - 1), String(syllables.length + 1), "1"],
    correctIndex: 0,
    onCorrect: `Correct — ${syllables.length} syllable${syllables.length !== 1 ? "s" : ""}: ${syllables.join(" | ")}. Spelling it syllable by syllable helps lock it in.`,
    onWrong: `Count the beats: clap as you say it — ${syllables.join(" / ")} = ${syllables.length} beat${syllables.length !== 1 ? "s" : ""}.`,
  };
}

function patternFollowUp(pattern: SpellingPattern, word: string): CoachFollowUp {
  const rules: Record<SpellingPattern, CoachFollowUp> = {
    silent_letter: {
      question: `"${word}" has a silent letter. Which letter makes no sound?`,
      options: ["k / w / g / b (the silent consonant)", "Every letter sounds", "The vowels are silent", "The last letter"],
      correctIndex: 0,
      onCorrect: `Good awareness! Silent letters are just part of the word's history — memorise it as a unit: "${word}".`,
      onWrong: `In "${word}", one consonant is silent. Look for patterns like kn-, wr-, gn-, or -mb.`,
    },
    double_letter: {
      question: `Where does "${word}" have a double letter?`,
      options: [
        `In the middle: ${word.match(/(.)\1/)?.[0] ?? "??"}`,
        "At the start",
        "There is no double letter",
        "At the end",
      ],
      correctIndex: 0,
      onCorrect: `Spot on! The doubled letter creates a short vowel sound before it — a useful spelling rule.`,
      onWrong: `Look for two identical letters next to each other in "${word}". Double letters often come after a short vowel sound.`,
    },
    ie_ei: {
      question: `Is the pattern "ie" or "ei" in "${word}"?`,
      options: [
        word.includes("ei") ? `"ei" — because it comes after "c" or says "ay"` : `"ie" — the default: i before e`,
        "I'm not sure",
        "Neither applies",
        word.includes("ei") ? `"ie" — i before e always` : `"ei" — always use ei`,
      ],
      correctIndex: 0,
      onCorrect: `Correct! The rule: "i before e, except after c" — with exceptions like 'weird' and 'seize'.`,
      onWrong: `"${word}" follows (or breaks) the i-before-e rule. Always check if there is a 'c' directly before the ie/ei.`,
    },
    suffix: {
      question: `In "${word}", what is the base word before the suffix is added?`,
      options: [
        word.replace(/tion$|sion$|ous$|ful$|ness$|ment$|ible$|able$|ive$/, "") || word,
        word,
        word.slice(0, Math.ceil(word.length / 2)),
        word.slice(0, 3),
      ],
      correctIndex: 0,
      onCorrect: `Exactly! Break it into: base word + suffix. Knowing the base helps with spelling both parts.`,
      onWrong: `Strip the suffix (-tion, -ous, etc.) to find the root. Often the root spelling is more familiar.`,
    },
    prefix: {
      question: `What prefix is added to the start of "${word}"?`,
      options: [
        word.match(/^(un|pre|dis|mis|re|over|under)/)?.[0] ?? "un-",
        "no prefix",
        "-ful",
        "-ing",
      ],
      correctIndex: 0,
      onCorrect: `Right! Knowing the prefix helps — it usually keeps its spelling unchanged when added to a root word.`,
      onWrong: `Look at the first few letters of "${word}" — they form a prefix (un-, pre-, dis-, mis-) with a fixed meaning.`,
    },
    homophones: {
      question: "Homophones sound the same but mean different things. How do you choose the right spelling?",
      options: [
        "Check the meaning in the sentence",
        "Use the shorter one",
        "Use the more common one",
        "It doesn't matter",
      ],
      correctIndex: 0,
      onCorrect: "Perfect — always check the meaning. If it shows belonging, use 'their'. If a place, 'there'. 'They're' = 'they are'.",
      onWrong: "Context decides the spelling. Read the sentence, understand the meaning, then pick the correct homophone.",
    },
    compound: {
      question: "How do you spell a compound word correctly?",
      options: [
        "Combine both root words without changing either spelling",
        "Drop a letter from the second word",
        "Add a hyphen always",
        "Change the vowel in the middle",
      ],
      correctIndex: 0,
      onCorrect: "Correct! Both parts keep their original spelling — just join them together.",
      onWrong: "In compound words, both root words keep their full spelling. No letters are dropped.",
    },
    common: {
      question: "What technique helps you memorise a tricky word?",
      options: [
        "Break it into syllables and say each part",
        "Spell it fast without thinking",
        "Just read it once",
        "Skip it",
      ],
      correctIndex: 0,
      onCorrect: "Brilliant! Syllable-by-syllable spelling plus 'look–cover–write–check' is the most reliable method.",
      onWrong: "Slow and deliberate beats fast and careless every time. Syllables + look–cover–write–check.",
    },
  };
  return rules[pattern];
}

// ── Step builders ─────────────────────────────────────────────────────────────

function buildSpellingSteps(
  word: string,
  phonemes: string[],
  syllables: string[],
  pattern: SpellingPattern,
  hintLevel: number,
): CoachStep[] {
  const steps: CoachStep[] = [
    { expression: phonemes.join(" • "), explanation: `Say it sound by sound: ${phonemes.join(" – ")}` },
    { expression: syllables.join(" | "), explanation: `Beats: ${syllables.length} syllable${syllables.length !== 1 ? "s" : ""}` },
  ];

  if (pattern === "silent_letter") {
    const match = word.match(/kn|wr|gn|mb|gh/);
    if (match) steps.push({ expression: `Remember: the "${match[0]}" — silent!`, explanation: "Memorise this as a chunk." });
  } else if (pattern === "double_letter") {
    const match = word.match(/(.)\1/);
    if (match) steps.push({ expression: `Double "${match[1]}" in the middle`, explanation: "Short vowel before it = double consonant." });
  } else if (pattern === "suffix") {
    const suffixMatch = word.match(/(tion|sion|ous|ful|ness|ment|ible|able|ive)$/);
    if (suffixMatch) {
      const base = word.slice(0, word.length - suffixMatch[0].length);
      steps.push({ expression: `${base} + ${suffixMatch[0]}`, explanation: "Base word + suffix. Learn the base first." });
    }
  } else if (pattern === "prefix") {
    const prefixMatch = word.match(/^(un|pre|dis|mis|re|over|under)/);
    if (prefixMatch) {
      const base = word.slice(prefixMatch[0].length);
      steps.push({ expression: `${prefixMatch[0]} + ${base}`, explanation: "Prefix + root. The prefix stays the same." });
    }
  }

  steps.push({
    expression: `L–C–W–C: Look → Cover → Write → Check`,
    explanation: "Write the full word from memory, then check it.",
  });

  return steps.slice(0, hintLevel + 1);
}

// ── Mnemonic generator ────────────────────────────────────────────────────────

const KNOWN_MNEMONICS: Record<string, string> = {
  "necessary": "One Collar, two Socks — 1 × C, 2 × S",
  "because": "Big Elephants Can Always Understand Small Elephants",
  "beautiful": "Big Elephants Are Useful To Ideal Friends Under Light",
  "friend": "FRI-END — a friend is there to the END",
  "piece": "a PIECE of PIE",
  "believe": "never beLIEve a LIE",
  "Wednesday": "WED-nes-day — the day of WED",
  "separate": "there is A RAT in sepARATe",
  "weird": "WEIRd — it IS weird",
  "which": "WHICH — Which Hat Is Cool Here?",
};

function getMnemonic(word: string): string | null {
  return KNOWN_MNEMONICS[word.toLowerCase()] ?? null;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function buildSpellingCoachResponse(ctx: CoachContext): CoachResponse {
  const word = ctx.correctAnswer.toLowerCase().trim();
  const hintLevel = Math.min(ctx.hintCount + 1, 4);
  const shouldReveal = hintLevel >= 4;
  const { ageBand } = ctx;

  const phonemes = splitPhonemes(word);
  const syllables = splitSyllables(word);
  const pattern = detectPattern(word);
  const mnemonic = getMnemonic(word);

  const steps = buildSpellingSteps(word, phonemes, syllables, pattern, shouldReveal ? 4 : hintLevel);

  const messages: Record<number, string> = {
    1: ageBand === "foundation"
      ? `Say "${word}" out loud — slowly. Listen to each sound.`
      : `Listen for the sounds: ${phonemes.join(" • ")}. Say it syllable by syllable: ${syllables.join(" | ")}.`,
    2: `Break it into ${syllables.length} part${syllables.length !== 1 ? "s" : ""}: ${syllables.join(" | ")}. Spell each part separately.`,
    3: mnemonic
      ? `Memory trick: ${mnemonic}`
      : pattern === "silent_letter"
        ? `There is a silent letter in "${word}" — notice the unusual consonant cluster.`
        : pattern === "double_letter"
          ? `"${word}" has a double letter — look carefully at where the vowel sounds short.`
          : `Try the look–cover–write–check method: study the word, cover it, write it from memory.`,
    4: `The correct spelling is: ${word.toUpperCase()}. Study the pattern${mnemonic ? ` and this mnemonic: ${mnemonic}` : ""}.`,
  };

  const followUp =
    hintLevel === 1
      ? phonicsFollowUp(word, phonemes)
      : hintLevel === 2
        ? syllableFollowUp(word, syllables)
        : hintLevel >= 3
          ? patternFollowUp(pattern, word)
          : null;

  return {
    mode: hintLevel === 1 ? "hint" : hintLevel <= 3 ? "guided_steps" : "reveal",
    ageBand,
    message: messages[hintLevel] ?? messages[4]!,
    steps,
    followUp,
    hintLevel,
    shouldReveal,
    reinforcementNote:
      ageBand === "gcse" || ageBand === "secondary"
        ? "Correct spelling in an exam shows command of written English — examiners notice patterns of careless errors."
        : ageBand === "primary"
          ? "Write it, cover it, write it again — three times and it will stick."
          : "Singing or clapping the syllables helps the spelling stay in your memory.",
    tryAgainPrompt: shouldReveal
      ? "Now try: look at the word for 10 seconds, cover it, write it from memory."
      : null,
    masterySignal: null,
  };
}

/** "Break into syllables" instant display — used by the syllables button (no coach panel). */
export function buildSyllableDisplay(word: string): string {
  const syllables = splitSyllables(word.toLowerCase());
  if (syllables.length <= 1) return `"${word}" has just one beat: ${word}.`;
  return `Say it in ${syllables.length} parts: ${syllables.join(" • ")}. Then spell each part: ${syllables.join("–")}.`;
}

/** "Phonics hint" one-liner — used by the hint button without opening coach panel. */
export function buildPhonicsHint(word: string, ageBand: AgeBand): string {
  const phonemes = splitPhonemes(word.toLowerCase());
  const mnemonic = getMnemonic(word);
  if (ageBand === "foundation") return `Say it out loud: ${phonemes.join(" – ")}.`;
  if (mnemonic) return `Memory trick: ${mnemonic}`;
  return `Sounds: ${phonemes.join(" • ")}. Syllables: ${splitSyllables(word.toLowerCase()).join(" | ")}.`;
}
