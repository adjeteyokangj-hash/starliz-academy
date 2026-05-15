// ─────────────────────────────────────────────────────────────────────────────
// Session Memory — client-side only, resets on page reload
// Tracks coaching interactions within a single learning session to enable
// continuity messages ("Earlier you solved a similar equation...") and
// emotional trend detection.
// ─────────────────────────────────────────────────────────────────────────────

export type SessionEntry = {
  questionText: string;
  subject: string;
  skillFocus?: string;
  hintsUsed: number;
  correct: boolean;
  responseTimeMs: number;
  timestamp: number;
};

export type EmotionalState =
  | "neutral"      // default, nothing unusual
  | "struggling"   // multiple wrong answers + many hints
  | "hesitant"     // slow responses, uncertain
  | "guessing"     // very fast wrong answers, answer-changing
  | "progressing"  // improving trend (fewer hints over time)
  | "confident";   // fast, correct, no hints

export type SessionSummary = {
  totalHints: number;
  totalCorrect: number;
  totalAttempted: number;
  emotionalState: EmotionalState;
  /** A short continuity note for the coach, or null if no relevant history. */
  continuityNote: string | null;
  /** Whether this question's skill has been seen before in this session. */
  seenSkillBefore: boolean;
};

// ── Module-level store (browser-tab lifetime) ─────────────────────────────────

const entries: SessionEntry[] = [];

export function recordCoachInteraction(entry: SessionEntry): void {
  entries.push({ ...entry });
  if (entries.length > 30) entries.shift(); // keep last 30
}

export function clearSessionMemory(): void {
  entries.length = 0;
}

// ── Emotional state derivation ────────────────────────────────────────────────

function deriveEmotionalState(recentEntries: SessionEntry[]): EmotionalState {
  if (recentEntries.length < 2) return "neutral";

  const last5 = recentEntries.slice(-5);
  const totalHints = last5.reduce((sum, e) => sum + e.hintsUsed, 0);
  const correctCount = last5.filter((e) => e.correct).length;
  const avgTime = last5.reduce((sum, e) => sum + e.responseTimeMs, 0) / last5.length;

  // Guessing: very fast answers but mostly wrong
  const avgTimeIsVeryFast = avgTime < 4000;
  if (avgTimeIsVeryFast && correctCount <= 1) return "guessing";

  // Struggling: many hints and mostly wrong
  if (totalHints >= 8 && correctCount <= 1) return "struggling";

  // Hesitant: slow responses, moderate hints
  if (avgTime > 35000 && totalHints >= 3) return "hesitant";

  // Progressing: more correct answers in the last 2-3 than in the earlier ones
  if (recentEntries.length >= 4) {
    const first = recentEntries.slice(0, Math.floor(recentEntries.length / 2));
    const second = recentEntries.slice(Math.floor(recentEntries.length / 2));
    const firstCorrectRate = first.filter((e) => e.correct).length / first.length;
    const secondCorrectRate = second.filter((e) => e.correct).length / second.length;
    if (secondCorrectRate > firstCorrectRate + 0.25) return "progressing";
  }

  // Confident: mostly correct, few hints, reasonable speed
  if (correctCount >= 4 && totalHints <= 2 && avgTime < 20000) return "confident";

  return "neutral";
}

// ── Continuity note generator ─────────────────────────────────────────────────

const CONTINUITY_TEMPLATES: Record<EmotionalState, (subject: string, skill?: string) => string | null> = {
  neutral: () => null,
  confident: (subject, skill) =>
    skill
      ? `You've been doing well with ${skill} today — keep applying the same method.`
      : `You've been on a good run in ${subject} — trust your approach.`,
  progressing: (subject) =>
    `You're improving as the session goes on in ${subject} — that's real learning happening.`,
  struggling: (subject, skill) =>
    skill
      ? `${skill} is challenging today — let's slow right down and focus on one step at a time.`
      : `This part of ${subject} is tough — but working through it carefully is exactly the right approach.`,
  hesitant: () =>
    "Take your time — there's no rush. A slower, careful approach leads to better understanding.",
  guessing: () =>
    "Let's pause before answering. Think it through — a careful attempt beats a quick guess every time.",
};

function getSkillContinuityNote(currentSkill?: string, currentSubject?: string): string | null {
  if (!currentSkill || entries.length < 2) return null;

  const previousWithSkill = entries.filter(
    (e) => e.skillFocus === currentSkill || e.subject === currentSubject,
  );
  if (previousWithSkill.length === 0) return null;

  const lastCorrectWithSkill = previousWithSkill.findLast((e) => e.correct && e.hintsUsed === 0);
  if (lastCorrectWithSkill) {
    return `Earlier you solved a ${currentSkill} question independently — use the same reasoning now.`;
  }

  const lastWithSkill = previousWithSkill[previousWithSkill.length - 1];
  if (lastWithSkill && lastWithSkill.hintsUsed > 0) {
    return `This is similar to a ${currentSkill} question earlier. Remember the method the coach showed.`;
  }

  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function getSessionSummary(currentSubject: string, currentSkill?: string): SessionSummary {
  const recentEntries = entries.filter((e) => e.subject === currentSubject);
  const emotionalState = deriveEmotionalState(recentEntries);

  // Continuity note: prefer skill-specific, fall back to emotional state
  const skillNote = getSkillContinuityNote(currentSkill, currentSubject);
  const emotionalNote = CONTINUITY_TEMPLATES[emotionalState]?.(currentSubject, currentSkill) ?? null;
  const continuityNote = skillNote ?? (emotionalState !== "neutral" ? emotionalNote : null);

  return {
    totalHints: recentEntries.reduce((sum, e) => sum + e.hintsUsed, 0),
    totalCorrect: recentEntries.filter((e) => e.correct).length,
    totalAttempted: recentEntries.length,
    emotionalState,
    continuityNote,
    seenSkillBefore: entries.some((e) => e.skillFocus === currentSkill),
  };
}

/**
 * Derive emotional tone message for the coach panel.
 * These are the opening empathy lines shown to the student.
 */
export function getEmotionalToneMessage(
  emotionalState: EmotionalState,
  hintCount: number,
  attemptCount: number,
  studentAnswer?: string,
  correctAnswer?: string,
): string {
  // Very close to correct answer
  if (studentAnswer && correctAnswer) {
    const sNum = Number(studentAnswer);
    const cNum = Number(correctAnswer);
    if (Number.isFinite(sNum) && Number.isFinite(cNum) && Math.abs(sNum - cNum) <= 2) {
      return "You are very close — just one small step away.";
    }
  }

  if (hintCount === 0 && attemptCount === 0) return "Let's think about this together.";
  if (hintCount >= 3) return "You've been working hard on this — let's look at it from the beginning.";
  if (attemptCount >= 3) return "Persistence is a real skill. Let's find where the thinking is going differently.";

  const toneMessages: Record<EmotionalState, string> = {
    neutral: "Here is a clue to help you think it through.",
    confident: "Great session so far — apply the same careful thinking here.",
    progressing: "You are improving as you go — keep that up.",
    struggling: "Take your time. Let's slow down and work through this together.",
    hesitant: "There's no rush at all. Think it through — you've got this.",
    guessing: "Before reading the hint — try one more careful attempt first.",
  };

  return toneMessages[emotionalState] ?? toneMessages.neutral;
}
