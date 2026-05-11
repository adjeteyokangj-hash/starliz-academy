export type WordStatus = "seen" | "weak" | "mastered";

export type Letter = {
  letter: string;
  sound: string;
  example: string;
};

export type WordItem = {
  word: string;
  letters: string[];
  sounds: string[];
};

export type WordFamily = {
  family: string;
  words: string[];
};

export type SpellingLevel = "alphabet" | "two_letter" | "cvc" | "word_family";

const CONSONANTS = ["c", "m", "s", "t", "p", "b", "d", "g"];
const VOWELS = ["a", "i", "o", "u", "e"];
const TWO_LETTER_WORDS = ["am", "an", "at", "in", "it", "is", "up", "us", "on"];

const SOUND_MAP: Record<string, { sound: string; example: string }> = {
  a: { sound: "/a/", example: "apple" },
  i: { sound: "/i/", example: "igloo" },
  o: { sound: "/o/", example: "orange" },
  u: { sound: "/u/", example: "umbrella" },
  e: { sound: "/e/", example: "egg" },
  c: { sound: "/c/", example: "cat" },
  m: { sound: "/m/", example: "moon" },
  s: { sound: "/s/", example: "sun" },
  t: { sound: "/t/", example: "tap" },
  p: { sound: "/p/", example: "pen" },
  b: { sound: "/b/", example: "bat" },
  d: { sound: "/d/", example: "dog" },
  g: { sound: "/g/", example: "goat" },
};

const WORD_FAMILIES: WordFamily[] = [
  { family: "at", words: ["cat", "mat", "sat", "bat"] },
  { family: "it", words: ["sit", "hit", "pit", "kit"] },
  { family: "an", words: ["man", "pan", "tan", "can"] },
  { family: "op", words: ["top", "hop", "mop", "pop"] },
  { family: "ug", words: ["bug", "mug", "rug"] },
];

function randomFrom<T>(values: T[]): T {
  return values[Math.floor(Math.random() * values.length)] as T;
}

function normalizeWord(value: string): string {
  return value.trim().toLowerCase();
}

export function detectMistake(input: string, correct: string): string | null {
  const attempt = normalizeWord(input);
  const target = normalizeWord(correct);

  if (!attempt || attempt === target) return null;

  if (`${attempt}e` === target || attempt === target.slice(0, -1)) {
    return "missing_e";
  }

  if (target.length >= 2 && attempt[0] !== target[0]) {
    return "wrong_start_sound";
  }

  if (target.length >= 3 && attempt.length >= 2) {
    const targetVowel = [...target].find((char) => "aeiou".includes(char));
    const attemptVowel = [...attempt].find((char) => "aeiou".includes(char));
    if (targetVowel && attemptVowel && targetVowel !== attemptVowel) {
      return "wrong_vowel";
    }
  }

  if (target.length >= 2 && attempt.length >= 2 && attempt[attempt.length - 1] !== target[target.length - 1]) {
    return "wrong_end_sound";
  }

  if (attempt.length === target.length && [...attempt].sort().join("") === [...target].sort().join("")) {
    return "wrong_order";
  }

  if (attempt.length + 1 === target.length || attempt.length === target.length - 1) {
    return "missing_letter";
  }

  if (attempt.length === target.length && attempt[0] === target[0]) {
    return "recognition_issue";
  }

  return "general";
}

export function calculateStatus(attempts: number, correctCount: number): WordStatus {
  if (attempts <= 0) return "seen";

  const accuracy = correctCount / attempts;

  if (accuracy >= 0.8 && attempts >= 3) return "mastered";
  if (accuracy < 0.5 || (attempts >= 2 && correctCount === 0)) return "weak";
  return "seen";
}

export function getPattern(word: string): string {
  const normalized = normalizeWord(word);

  if (normalized.endsWith("ight")) return "ight";
  if (normalized.endsWith("ake")) return "ake";
  if (normalized.endsWith("ike")) return "ike";
  if (/[aeiou]e$/.test(normalized)) return "silent_e";
  if (normalized.length >= 3) return normalized.slice(-3);
  return "general";
}

export function inferLevelFromWord(word: string): number {
  const length = normalizeWord(word).length;
  if (length <= 3) return 1;
  if (length <= 4) return 2;
  if (length <= 5) return 3;
  if (length <= 6) return 4;
  if (length <= 7) return 5;
  if (length <= 8) return 6;
  if (length <= 10) return 7;
  return 7;
}

export function getSessionPhase(questionIndex: number):
  | "learn"
  | "practice"
  | "pattern"
  | "recall"
  | "mini_test"
  | "boss_test" {
  if (questionIndex <= 1) return "learn";
  if (questionIndex <= 4) return "practice";
  if (questionIndex === 5) return "pattern";
  if (questionIndex <= 7) return "recall";
  if (questionIndex <= 9) return "mini_test";
  return "boss_test";
}

export function getModeRotation(): Array<
  | "listen_type"
  | "build_word"
  | "missing_letter"
  | "choose_correct"
  | "fix_mistake"
  | "scramble_word"
  | "alphabetical_order"
  | "pattern_mode"
> {
  return [
    "listen_type",
    "build_word",
    "missing_letter",
    "choose_correct",
    "fix_mistake",
    "scramble_word",
    "alphabetical_order",
    "pattern_mode",
  ];
}

export function generateCVCWord(): WordItem {
  const c1 = randomFrom(CONSONANTS);
  const v = randomFrom(VOWELS);
  const c2 = randomFrom(CONSONANTS);
  const word = `${c1}${v}${c2}`;

  return {
    word,
    letters: [c1, v, c2],
    sounds: [SOUND_MAP[c1]?.sound ?? c1, SOUND_MAP[v]?.sound ?? v, SOUND_MAP[c2]?.sound ?? c2],
  };
}

export function getTwoLetterWord(): WordItem {
  const word = randomFrom(TWO_LETTER_WORDS);
  return {
    word,
    letters: word.split(""),
    sounds: word.split("").map((letter) => SOUND_MAP[letter]?.sound ?? letter),
  };
}

export function getWordFamily(): WordFamily {
  return randomFrom(WORD_FAMILIES);
}

export function getWordFromFamily(family: WordFamily): WordItem {
  const word = randomFrom(family.words);
  return {
    word,
    letters: word.split(""),
    sounds: word.split("").map((letter) => SOUND_MAP[letter]?.sound ?? letter),
  };
}

export function getWordBySpellingLevel(level: SpellingLevel): WordItem {
  if (level === "alphabet") {
    const letter = randomFrom([...CONSONANTS, ...VOWELS]);
    return {
      word: letter,
      letters: [letter],
      sounds: [SOUND_MAP[letter]?.sound ?? letter],
    };
  }
  if (level === "two_letter") return getTwoLetterWord();
  if (level === "cvc") return generateCVCWord();
  return getWordFromFamily(getWordFamily());
}

export function generateLetterOptions(correctLetters: string[]): string[] {
  const allLetters = [...CONSONANTS, ...VOWELS];
  const distractors = allLetters
    .filter((letter) => !correctLetters.includes(letter))
    .sort(() => 0.5 - Math.random())
    .slice(0, 3);
  return [...correctLetters, ...distractors].sort(() => 0.5 - Math.random());
}

export function blendSounds(sounds: string[]): string {
  return sounds.join(" ");
}

export function getWordBreakdown(word: string): string[] {
  return word.split("");
}

export function getBlendSteps(word: string): { letters: string[]; sounds: string[]; steps: string[] } {
  const letters = word.split("");
  return {
    letters,
    sounds: letters.map((letter) => SOUND_MAP[letter]?.sound ?? letter),
    steps: [letters[0], `${letters[0] ?? ""}${letters[1] ?? ""}`, word].filter(Boolean),
  };
}

export function getBlendText(word: string): { soundLine: string; buildLine: string; finalWord: string } {
  const blend = getBlendSteps(word);
  return {
    soundLine: blend.sounds.join("  "),
    buildLine: blend.steps.join(" -> "),
    finalWord: word,
  };
}