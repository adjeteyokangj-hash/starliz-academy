import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { getModeRotation, getPattern, getSessionPhase, inferLevelFromWord } from "@/lib/spellingEngine";
import { SPELLING_WORD_BANK } from "@/lib/spelling_words";

type SessionMode = ReturnType<typeof getModeRotation>[number] | "recall_test" | "boss_test";

function buildExpandedWordPool(requestedLevel: number): string[] {
  const safeLevel = Number.isFinite(requestedLevel) && requestedLevel > 0 ? requestedLevel : 1;
  const maxBankLevel = Math.min(5, Math.max(1, safeLevel + 1));
  const minBankLevel = Math.max(1, Math.min(maxBankLevel, safeLevel - 1));

  return SPELLING_WORD_BANK
    .filter((entry) => entry.level >= minBankLevel && entry.level <= maxBankLevel)
    .map((entry) => entry.word.toLowerCase())
    .filter((word, index, source) => source.indexOf(word) === index);
}

function takeDistinct(source: string[], used: Set<string>, limit: number): string[] {
  const picked: string[] = [];
  for (const word of source) {
    if (used.has(word)) continue;
    picked.push(word);
    used.add(word);
    if (picked.length >= limit) break;
  }
  return picked;
}

function makePhase(word: string, phase: ReturnType<typeof getSessionPhase>, mode: SessionMode, noHints = false) {
  return { word, phase, mode, noHints };
}

function ensureMinimumPhases(phases: Array<{ word: string; phase: ReturnType<typeof getSessionPhase> | "practice" | "pattern" | "recall" | "mini_test" | "boss_test"; mode: SessionMode; noHints?: boolean }>, levelWords: string[], minCount: number) {
  if (phases.length >= minCount || !levelWords.length) return phases;

  const fallbackModes: SessionMode[] = ["listen_type", "build_word", "choose_correct", "missing_letter", "pattern_mode", "recall_test"];
  const filled = [...phases];
  let i = 0;

  while (filled.length < minCount) {
    const word = levelWords[i % levelWords.length];
    const mode = fallbackModes[i % fallbackModes.length];
    const phase = mode === "recall_test" ? "recall" : "practice";
    filled.push(makePhase(word, phase as ReturnType<typeof getSessionPhase>, mode, mode === "recall_test"));
    i += 1;
  }

  return filled;
}

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("studentId")?.trim();
  const requestedLevel = Number(searchParams.get("level") ?? "0");

  if (!studentId) {
    return NextResponse.json({ error: "studentId is required." }, { status: 400 });
  }

  const child = await prisma.childProfile.findFirst({
    where: {
      id: studentId,
      parentId: parentScope.parentId,
      archived: false,
    },
    select: { id: true },
  });

  if (!child) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const progress = await prisma.wordProgress.findMany({
    where: { studentId },
    orderBy: [{ lastSeen: "desc" }, { createdAt: "desc" }],
  });

  const levelWords = buildExpandedWordPool(requestedLevel || 1).filter((word) => {
    if (!requestedLevel || Number.isNaN(requestedLevel)) return true;
    return inferLevelFromWord(word) <= Math.max(1, requestedLevel + 1);
  });

  const weakWords = progress.filter((entry) => entry.status === "weak");
  const seenWords = progress.filter((entry) => entry.status === "seen");
  const masteredWords = progress.filter((entry) => entry.status === "mastered");
  const olderSeenWords = [...seenWords]
    .sort((left, right) => left.lastSeen.getTime() - right.lastSeen.getTime())
    .slice(0, 3);

  const freshWords = levelWords.filter((word) => !progress.some((entry) => entry.word === word));
  const weakWordList = weakWords.map((entry) => entry.word);
  const seenWordList = seenWords.map((entry) => entry.word);
  const masteredWordList = masteredWords.map((entry) => entry.word);
  const olderSeenWordList = olderSeenWords.map((entry) => entry.word);
  const used = new Set<string>();

  // Single-letter words are alphabet/phonics warm-ups — cap at 2 and keep them at the front only.
  const isSingleLetter = (w: string) => w.trim().length === 1;
  const multiLetterLevelWords = levelWords.filter((w) => !isSingleLetter(w));
  const singleLetterLevelWords = levelWords.filter(isSingleLetter);

  // Alphabet warm-up: max 2 items, only at the start (learn phase)
  const alphabetWarmupWords = takeDistinct(singleLetterLevelWords, new Set(), 2);

  const learnWords = takeDistinct([...freshWords.filter((w) => !isSingleLetter(w)), ...seenWordList.filter((w) => !isSingleLetter(w)), ...multiLetterLevelWords], used, 3);
  const practiceWords = takeDistinct([...weakWordList.filter((w) => !isSingleLetter(w)), ...freshWords.filter((w) => !isSingleLetter(w)), ...seenWordList.filter((w) => !isSingleLetter(w)), ...multiLetterLevelWords], used, 6);
  const alphabeticalWords = takeDistinct([...multiLetterLevelWords, ...freshWords.filter((w) => !isSingleLetter(w)), ...seenWordList.filter((w) => !isSingleLetter(w))], used, 2);
  const patternWords = takeDistinct(
    multiLetterLevelWords.filter((word) => {
      const pattern = getPattern(word);
      return multiLetterLevelWords.filter((candidate) => getPattern(candidate) === pattern).length > 1;
    }),
    used,
    2,
  );

  const sessionStudyWords = [...alphabetWarmupWords, ...learnWords, ...practiceWords, ...alphabeticalWords, ...patternWords]
    .filter((word, index, source) => source.indexOf(word) === index);

  const recallWords = takeDistinct([...olderSeenWordList.filter((w) => !isSingleLetter(w)), ...seenWordList.filter((w) => !isSingleLetter(w)), ...sessionStudyWords.filter((w) => !isSingleLetter(w))], new Set(), 3);
  const miniTestWords = takeDistinct([...weakWordList.filter((w) => !isSingleLetter(w)), ...sessionStudyWords.filter((w) => !isSingleLetter(w)), ...multiLetterLevelWords], new Set(), 4);
  const bossWords = takeDistinct([...weakWordList.filter((w) => !isSingleLetter(w)), ...masteredWordList.filter((w) => !isSingleLetter(w)), ...patternWords, ...sessionStudyWords.filter((w) => !isSingleLetter(w)), ...multiLetterLevelWords], new Set(), 4);

  let phases = ensureMinimumPhases([
    // Alphabet warm-up first (max 2 items, listen_type mode for letter sound practice)
    ...alphabetWarmupWords.map((word) => makePhase(word, getSessionPhase(1), "listen_type")),
    ...learnWords.map((word, index) => makePhase(word, getSessionPhase(index + 1), index === 0 ? "listen_type" : "build_word")),
    ...practiceWords.map((word, index) => makePhase(word, "practice", getModeRotation()[index + 2] ?? "choose_correct")),
    ...alphabeticalWords.map((word) => makePhase(word, "practice", "alphabetical_order")),
    ...patternWords.map((word) => makePhase(word, "pattern", "pattern_mode")),
    ...recallWords.map((word) => makePhase(word, "recall", "recall_test", true)),
    ...miniTestWords.map((word, index) => makePhase(word, "mini_test", index % 2 === 0 ? "choose_correct" : "build_word")),
    ...bossWords.map((word) => makePhase(word, "boss_test", "boss_test", true)),
  ], multiLetterLevelWords, 18);

  const safeRequestedLevel = Number.isFinite(requestedLevel) && requestedLevel > 0 ? requestedLevel : 1;
  const hasEasier = phases.some((entry) => !isSingleLetter(entry.word) && inferLevelFromWord(entry.word) < safeRequestedLevel);
  const hasChallenge = phases.some((entry) => !isSingleLetter(entry.word) && inferLevelFromWord(entry.word) > safeRequestedLevel);
  const easierWord = multiLetterLevelWords.find((word) => inferLevelFromWord(word) < safeRequestedLevel);
  const challengeWord = multiLetterLevelWords.find((word) => inferLevelFromWord(word) > safeRequestedLevel);

  if (!hasEasier && easierWord) {
    phases = [makePhase(easierWord, "practice", "listen_type"), ...phases];
  }
  if (!hasChallenge && challengeWord) {
    // Only add challenge boss word if it isn't already a boss phase
    const alreadyBoss = phases.some((entry) => entry.mode === "boss_test" && entry.word === challengeWord);
    if (!alreadyBoss) {
      phases = [...phases, makePhase(challengeWord, "boss_test", "boss_test", true)];
    }
  }

  const hasBossPhase = phases.some((entry) => entry.mode === "boss_test");
  if (!hasBossPhase) {
    const fallbackBossWord = challengeWord ?? bossWords[0] ?? levelWords[0];
    if (fallbackBossWord) {
      phases = [...phases, makePhase(fallbackBossWord, "boss_test", "boss_test", true)];
    }
  } else if (phases[phases.length - 1]?.mode !== "boss_test") {
    // Move all existing boss phases to the end rather than duplicating one
    const nonBoss = phases.filter((entry) => entry.mode !== "boss_test");
    const bossPhases = phases.filter((entry) => entry.mode === "boss_test");
    phases = [...nonBoss, ...bossPhases];
  }

  // Deduplicate boss_test phases — same word appearing multiple times serves no purpose
  const seenBossWords = new Set<string>();
  phases = phases.filter((entry) => {
    if (entry.mode !== "boss_test") return true;
    if (seenBossWords.has(entry.word)) return false;
    seenBossWords.add(entry.word);
    return true;
  });

  const fallbackWords = phases.length ? phases.map((entry) => entry.word) : multiLetterLevelWords.slice(0, 10);

  const patternGroups = fallbackWords.reduce<Record<string, string[]>>((groups, word) => {
    const pattern = getPattern(word);
    groups[pattern] = [...(groups[pattern] ?? []), word];
    return groups;
  }, {});

  return NextResponse.json({
    words: fallbackWords,
    seenWords: seenWordList,
    weakWords: weakWordList,
    masteredWords: masteredWordList,
    patternGroups,
    phases,
  });
}