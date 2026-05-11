import { VoiceStyle } from "@/lib/voice_options";

type TutorSubject = "alphabet" | "spelling" | "maths" | "reading";
type TutorMode = "choice" | "prompt";
type TutorPersonality = "default" | "robot" | "princess" | "superhero" | "gentle";
export type SpellingDisplayMode =
  | "listen_type"
  | "build_word"
  | "missing_letter"
  | "choose_correct"
  | "fix_mistake"
  | "scramble_word"
  | "alphabetical_order"
  | "pattern_mode"
  | "recall_test"
  | "boss_test";

type TutorLineInput = {
  subject: TutorSubject;
  mode?: TutorMode;
  prompt?: string;
  answer?: string;
  purchasedVoice?: VoiceStyle;
  includePrompt?: boolean;
  includeEncouragement?: boolean;
};

const ENCOURAGEMENT_BY_PERSONALITY: Record<TutorPersonality, string[]> = {
  default: ["You can do it!", "Listen carefully.", "Try your best."],
  robot: ["Beep boop. You can do it!", "Robot focus mode on!", "Scanning... great effort!"],
  princess: ["Shine bright, star learner!", "You are doing magical work!", "Keep going, brave learner!"],
  superhero: ["Hero mode activated!", "Power up and try your best!", "You are stronger each round!"],
  gentle: ["Take your time.", "You are safe to learn here.", "Nice and steady."],
};

const SPELLING_ENCOURAGEMENTS = [
  "Great job!",
  "You're doing amazing!",
  "Nice work!",
  "Keep going!",
];

function cleanWord(value: string | undefined): string {
  return (value ?? "").trim().replace(/[.]+$/g, "");
}

function pickRandom(values: string[]): string {
  if (!values.length) return "";
  return values[Math.floor(Math.random() * values.length)] ?? values[0] ?? "";
}

export function isAlphabetWord(word?: string): boolean {
  return Boolean(word && word.trim().length === 1 && /^[a-z]$/i.test(word.trim()));
}

export function resolveTutorVoicePersonality(style?: VoiceStyle): TutorPersonality {
  if (!style) return "default";
  if (style === "fun_robot") return "robot";
  if (style === "superhero_coach") return "superhero";
  if (style === "soft_encourager" || style === "calm_reader") return "gentle";
  if (style === "storyteller") return "princess";
  return "default";
}

export type TutorSituation =
  | "correct_first_try"
  | "correct_after_retry"
  | "retry"
  | "skip";

/**
 * Fixed tone lines per situation — no random variation.
 * Consistency builds trust for young learners.
 */
export function getTutorToneLine(situation: TutorSituation): string {
  switch (situation) {
    case "correct_first_try":
      return "Excellent!";
    case "correct_after_retry":
      return "Great effort!";
    case "retry":
      return "Let's try that again.";
    case "skip":
      return "We'll come back to this.";
  }
}

export function getTutorLine(input: TutorLineInput): string {
  const voicePersonality = resolveTutorVoicePersonality(input.purchasedVoice);
  const includePrompt = input.includePrompt ?? true;
  const includeEncouragement = input.includeEncouragement ?? false;
  const answer = cleanWord(input.answer);
  const prompt = (input.prompt ?? "").trim();

  let line = "Let's begin.";

  if (input.subject === "alphabet") {
    const letter = answer ? answer.toUpperCase() : "";
    line = letter ? `Alphabet round. Tap the letter ${letter}.` : "Alphabet round. Tap the correct letter.";
  } else if (input.subject === "spelling") {
    if (isAlphabetWord(answer)) {
      const letter = answer.toUpperCase();
      line = `Alphabet round. Tap the letter ${letter}.`;
    } else if (input.mode === "choice") {
      line = "Choose the correct answer.";
    } else {
      line = answer ? `Spelling round. Spell the word ${answer}.` : "Spelling round. Spell the word.";
    }
  } else if (input.subject === "maths") {
    line = "Maths round. Solve this question.";
    if (includePrompt && prompt) {
      line = `${line} ${prompt}`;
    }
  } else if (input.subject === "reading") {
    line = input.mode === "choice"
      ? "Choose the correct answer."
      : "Reading round. Read carefully, then choose the best answer.";
  }

  if (includeEncouragement) {
    const encouragement = input.subject === "spelling"
      ? pickRandom(SPELLING_ENCOURAGEMENTS)
      : pickRandom(ENCOURAGEMENT_BY_PERSONALITY[voicePersonality]);
    if (encouragement) {
      line = `${line} ${encouragement}`;
    }
  }

  return line;
}

export function getSpellingModePromptTitle(mode: SpellingDisplayMode, word?: string): string {
  if (isAlphabetWord(word)) {
    const letter = word!.trim().toUpperCase();
    if (mode === "listen_type" || mode === "recall_test" || mode === "boss_test") return `Tap the letter ${letter}`;
    if (mode === "build_word") return `Find the letter ${letter}`;
    if (mode === "choose_correct" || mode === "missing_letter") return `Tap the letter ${letter}`;
  }

  switch (mode) {
    case "listen_type":
      return "Spell the word";
    case "build_word":
      return "Tap letters to build the word";
    case "missing_letter":
      return "Choose the missing letter";
    case "choose_correct":
      return "Pick the correct spelling";
    case "fix_mistake":
      return "Fix the word";
    case "scramble_word":
      return "Put the letters in the correct order";
    case "alphabetical_order":
      return "Put the words in alphabetical order";
    case "pattern_mode":
      return "Choose the word that matches the pattern";
    case "recall_test":
      return "Recall the word";
    case "boss_test":
      return "Final spelling challenge";
    default:
      return "Spelling";
  }
}

export function getSpellingModeInstruction(mode: SpellingDisplayMode, word?: string, missingCount?: number): string {
  if (isAlphabetWord(word)) {
    const letter = word!.trim().toUpperCase();
    if (mode === "listen_type" || mode === "recall_test" || mode === "boss_test") {
      return `Listen to the sound, then tap the letter ${letter}.`;
    }
    if (mode === "build_word" || mode === "choose_correct" || mode === "missing_letter") {
      return `Which letter makes this sound? Tap ${letter}.`;
    }
  }

  switch (mode) {
    case "listen_type":
      return "Listen carefully and spell the full word.";
    case "build_word":
      return "Tap the letters in the correct order to build the word.";
    case "missing_letter":
      return missingCount && missingCount > 1
        ? `Look at the word. ${missingCount} letters are missing. Tap the correct letters to complete it.`
        : "Look at the word. One letter is missing. Tap the correct letter to complete it.";
    case "choose_correct":
      return "Choose the correct spelling.";
    case "fix_mistake":
      return "Fix the spelling mistake.";
    case "scramble_word":
      return "Put the letters in the correct order.";
    case "alphabetical_order":
      return "Put the words in alphabetical order.";
    case "pattern_mode":
      return "Choose the word that matches the pattern.";
    case "recall_test":
      return "No hints this time. Try to remember the word.";
    case "boss_test":
      return "Listen to the word, then type the full word from memory. No hints this time.";
    default:
      return word ? `Spell ${word}.` : "Spell the word.";
  }
}

export function getSpellingModeVoiceInstruction(mode: SpellingDisplayMode, word?: string, missingCount?: number): string {
  const safeWord = cleanWord(word) || "word";
  if (isAlphabetWord(word)) {
    return getTutorLine({ subject: "alphabet", answer: word });
  }

  switch (mode) {
    case "listen_type":
      return getTutorLine({ subject: "spelling", answer: safeWord, includeEncouragement: true });
    case "missing_letter":
      return missingCount && missingCount > 1
        ? `Look at the word. ${missingCount} letters are missing. Tap the correct letters.`
        : "Look at the word. One letter is missing. Tap the correct letter.";
    case "build_word":
      return `Can you build the word ${safeWord}? Tap the letters in the right order.`;
    case "choose_correct":
      return `${getTutorLine({ subject: "spelling", mode: "choice" })} Which one spells ${safeWord}?`;
    case "fix_mistake":
      return "There is a spelling mistake in one of these words. Can you find it and fix it?";
    case "scramble_word":
      return `The letters are all mixed up! Put them in the right order to spell ${safeWord}.`;
    case "alphabetical_order":
      return "Put the words in alphabetical order — that means the order they would appear in a dictionary.";
    case "pattern_mode":
      return "Look at the spelling pattern. Choose the word that matches it.";
    case "recall_test":
      return "No hints this time. Try to remember the word.";
    case "boss_test":
      return "Let's try your final challenge. Listen carefully and type the word.";
    default:
      return safeWord ? getTutorLine({ subject: "spelling", answer: safeWord }) : "Spelling round. Spell the word.";
  }
}

export function getReadingTaskInstruction(readAloudStep?: string): string {
  if (readAloudStep) {
    return `Your task: tap Read to tutor, then ${readAloudStep}. After that, choose the best answer.`;
  }
  return getTutorLine({ subject: "reading" });
}

export function getSpellingHintMessage(input: {
  level: number;
  word?: string;
  categoryHint?: string;
  syllables?: string;
}): string {
  const level = Math.max(0, input.level);
  if (level <= 0) return "";
  if (level === 1) return `Hint: ${input.categoryHint ?? "Listen to the sounds in the word."}`;
  if (level === 2) {
    const source = cleanWord(input.word);
    const first = source[0]?.toUpperCase() ?? "";
    const masked = source ? "_ ".repeat(Math.max(0, source.length - 1)).trim() : "";
    return `Hint: ${first} ${masked}`.trim();
  }
  return `Hint: Syllables ${input.syllables ?? "1"}`;
}

export function getSpellingHintSpeech(hintMessage: string): string {
  const cleaned = hintMessage.replace(/^Hint:\s*/i, "").trim();
  if (!cleaned) return "No worries. Here is a little clue for you. Have another go!";
  return `No worries! Here is a little clue for you. ${cleaned}. Have another go!`;
}

export function getReadingHintMessage(level: number, excerpt?: string): string {
  if (level <= 0) return "";
  if (level === 1) {
    return "Hint: Look for the key nouns in the passage and match them to the question.";
  }
  if (level === 2) {
    return excerpt
      ? `Hint: Look carefully at this part: "${excerpt.trim()}"}`
      : "Hint: Look closely at the most important sentence in the passage.";
  }
  return "Support: Re-read the passage and think about what the question is really asking. The answer is somewhere in the passage.";
}

export function getReadingHintSpeech(level: number, excerpt?: string): string {
  if (level <= 1) {
    return "Here is a hint. Look for the key nouns in the passage and match them to the question.";
  }
  if (level === 2) {
    return excerpt
      ? `Here is another hint. Look carefully at this part of the passage: "${excerpt.trim()}"}`
      : "Here is another hint. Look closely at the most important sentence in the passage.";
  }
  return "Here is extra support. Re-read the passage and think about what the question is really asking. The answer is somewhere in the passage.";
}

export function getReadingClueMessage(input: { excerpt?: string; questionFocus?: string }): string {
  if (input.excerpt) {
    return `Here is a clue. Look at this part of the passage: "${input.excerpt.trim()}" - what does that tell you?`;
  }
  if (input.questionFocus) {
    return `Here is a clue. Re-read the passage and look for what it says about ${input.questionFocus}.`;
  }
  return "Here is a clue. Re-read the passage and look for the sentence that answers the question.";
}
