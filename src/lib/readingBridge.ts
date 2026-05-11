/**
 * readingBridge.ts
 *
 * Spelling → Reading literacy loop.
 *
 * When a child masters a word in spelling (status = "mastered" in WordProgress),
 * the next lesson surfaces a simple reading passage that contains that word.
 * Example: child masters "cat" → passage: "The cat is big. It can run."
 */

import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// Sentence templates
// Each template uses {word} as a placeholder. Templates are designed to work
// for any 2–6 letter word a child at KS1 level might learn.
// ---------------------------------------------------------------------------

type PassageTemplate = {
  passage: string;
  question: string;
  answer: string;
  choices: [string, string, string];
};

const ANIMATE_WORDS = new Set([
  "cat", "dog", "hen", "pig", "fox", "bug", "ant", "bee", "cow", "ram",
  "bat", "rat", "cub", "pup", "kit", "kid", "frog", "bird", "fish", "duck",
  "bear", "deer", "lion", "wolf", "worm", "crab", "swan", "wren", "hare",
]);

const ACTION_WORDS = new Set([
  "run", "hop", "sit", "dig", "nap", "tap", "hit", "cut", "get", "win",
  "skip", "clap", "stop", "spin", "jump", "step", "wave", "swim", "fly",
]);

const OBJECT_WORDS = new Set([
  "cap", "bag", "cup", "pen", "pot", "box", "map", "net", "mat", "jug",
  "mug", "tin", "bin", "log", "peg", "cot", "rod", "nut", "bun", "jam",
  "cake", "book", "ball", "kite", "bell", "boat", "drum", "flag", "glue",
]);

function classifyWord(word: string): "animate" | "action" | "object" | "general" {
  const w = word.toLowerCase();
  if (ANIMATE_WORDS.has(w)) return "animate";
  if (ACTION_WORDS.has(w)) return "action";
  if (OBJECT_WORDS.has(w)) return "object";
  return "general";
}

/** Build a WH-distractor that is NOT the target word and NOT the correct answer. */
function pickDistractor(word: string, answer: string): string {
  const pool = ["big", "fast", "red", "it", "here", "sat", "hot", "wet", "fun", "blue", "small", "slow"];
  return pool.find((d) => d !== word.toLowerCase() && d !== answer.toLowerCase()) ?? "far away";
}

function buildTemplate(word: string): PassageTemplate {
  const kind = classifyWord(word);
  const w = word.toLowerCase();

  if (kind === "animate") {
    return {
      passage: `The ${w} is small. It can run fast. I like the ${w}.`,
      question: `What can the ${w} do?`,
      answer: "run fast",
      choices: ["run fast", "fly high", "swim deep"],
    };
  }

  if (kind === "action") {
    return {
      passage: `I can ${w}. I like to ${w} a lot. Can you ${w} too?`,
      question: `What does the story ask you to do?`,
      answer: w,
      choices: [w, "read", "sleep"],
    };
  }

  if (kind === "object") {
    return {
      passage: `I have a ${w}. My ${w} is red. I use it every day.`,
      question: `What colour is the ${w}?`,
      answer: "red",
      choices: ["red", "blue", "green"],
    };
  }

  // general fallback — works for any word
  return {
    passage: `I can see a ${w}. The ${w} is big. I like it a lot.`,
    question: `What does the story say about the ${w}?`,
    answer: "It is big",
    choices: ["It is big", pickDistractor(w, "It is big"), "It is gone"],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type LiteracyBridgeItem = {
  id: string;
  type: "reading";
  passage: string;
  question: string;
  answer: string;
  /** options is the lesson-item convention used by the lesson renderer */
  options: [string, string, string];
  skillFocus: string;
  difficulty: number;
  /** The spelling word this passage was built from — used for UI highlight */
  bridgeWord: string;
  /** Bridge mode for UI copy and analytics */
  bridgeMode: "mastered" | "weak_recovery";
};

/**
 * Returns the single most recently mastered spelling word for a student,
 * or null if none exist yet.
 */
export async function getLatestMasteredWord(studentId: string): Promise<string | null> {
  const row = await prisma.wordProgress.findFirst({
    where: { studentId, status: "mastered" },
    orderBy: { lastSeen: "desc" },
    select: { word: true },
  });
  return row?.word ?? null;
}

/**
 * Returns the single most recent weak spelling word for a student,
 * or null if none exist yet.
 */
export async function getLatestWeakWord(studentId: string): Promise<string | null> {
  const row = await prisma.wordProgress.findFirst({
    where: { studentId, status: "weak" },
    orderBy: [{ lastSeen: "desc" }, { attempts: "desc" }],
    select: { word: true },
  });
  return row?.word ?? null;
}

/**
 * Returns up to `limit` recently mastered words ordered newest-first.
 */
export async function getRecentMasteredWords(studentId: string, limit = 5): Promise<string[]> {
  const rows = await prisma.wordProgress.findMany({
    where: { studentId, status: "mastered" },
    orderBy: { lastSeen: "desc" },
    take: limit,
    select: { word: true },
  });
  return rows.map((r) => r.word);
}

/**
 * Builds a single literacy-bridge reading item from a mastered spelling word.
 * Returns null if the student has no mastered words yet.
 */
export async function buildLiteracyBridgeItem(
  studentId: string,
  difficulty = 1,
): Promise<LiteracyBridgeItem | null> {
  const word = await getLatestMasteredWord(studentId);
  if (!word) return null;

  const template = buildTemplate(word);

  return {
    id: `literacy-bridge-${word}-${Date.now()}`,
    type: "reading",
    passage: template.passage,
    question: template.question,
    answer: template.answer,
    options: template.choices,
    skillFocus: `Reading: word "${word}"`,
    difficulty: Math.max(1, Math.min(2, difficulty)), // bridge items stay easy
    bridgeWord: word,
    bridgeMode: "mastered",
  };
}

function buildWeakRecoveryTemplate(word: string): PassageTemplate {
  const w = word.toLowerCase();
  return {
    passage: `The ${w} is on the floor. The cat sat on the ${w}.`,
    question: "Where is the cat?",
    answer: `on the ${w}`,
    choices: [`on the ${w}`, "under the bed", "in the box"],
  };
}

/**
 * Builds a weak-word recovery reading item so hard words reappear in context.
 * Returns null if no weak words exist.
 */
export async function buildWeakWordRecoveryBridgeItem(
  studentId: string,
  difficulty = 1,
): Promise<LiteracyBridgeItem | null> {
  const word = await getLatestWeakWord(studentId);
  if (!word) return null;

  const template = buildWeakRecoveryTemplate(word);
  return {
    id: `weak-bridge-${word}-${Date.now()}`,
    type: "reading",
    passage: template.passage,
    question: template.question,
    answer: template.answer,
    options: template.choices,
    skillFocus: `Reading recovery: word "${word}"`,
    difficulty: Math.max(1, Math.min(2, difficulty)),
    bridgeWord: word,
    bridgeMode: "weak_recovery",
  };
}
