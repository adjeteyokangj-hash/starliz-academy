/**
 * engines/coaching-engine.ts
 *
 * Generates all tutor-facing messages: teach messages, assessment prompts,
 * support prompts, formula scaffolds, and coaching breakdowns.
 *
 * Architecture layer: Tutor Runtime Engine → Coaching Engine
 * Depends on: tutor-runtime/utils, starliz-question-formula
 * No React, no state, no side effects.
 */

import { type NormalizedLessonItem } from "@/lib/lesson-runtime-normalizer";
import {
  buildProgressiveSupportMessage,
} from "@/lib/starliz-question-formula";
import {
  decodeLessonText,
  describeTargetForTutor,
  getPrompt,
  isAlphabetLessonItem,
  phonicsExampleForLetter,
  soundForLetter,
} from "@/lib/tutor-runtime/utils";

type LessonItem = NormalizedLessonItem;

/** Spelling micro-stages for a single phonics / word item. */
export type LessonStage = "ASSESS_SPEECH" | "TEACH_RETRY" | "TAP_SELECT" | "COMPLETE";

// ---------------------------------------------------------------------------
// Spelling conversation titles
// ---------------------------------------------------------------------------

/**
 * Returns the heading label shown in the spelling conversation UI for each
 * stage of the spelling interaction cycle.
 */
export function getSpellingConversationTitle(item: LessonItem, step: LessonStage): string {
  const isAlphabet = isAlphabetLessonItem(item);
  const target = decodeLessonText(String(item.word ?? item.answer ?? "")).trim();
  const customAssessmentPrompt = decodeLessonText(String(item.assessmentPrompt ?? "")).trim();
  const customSupportPrompt = decodeLessonText(String(item.supportPrompt ?? "")).trim();
  const customTapPrompt = decodeLessonText(String(item.tapPrompt ?? "")).trim();

  if (step === "ASSESS_SPEECH" && customAssessmentPrompt) return customAssessmentPrompt;
  if (step === "ASSESS_SPEECH")
    return isAlphabet ? "What letter do you see on the screen?" : "What word do you see on the screen?";

  if (step === "TEACH_RETRY" && customSupportPrompt) return customSupportPrompt;
  if (step === "TEACH_RETRY") return "Good try. Look again.";

  if (step === "TAP_SELECT") {
    if (customTapPrompt) return customTapPrompt;
    if (isAlphabet) {
      const targetName =
        target && target === target.toLowerCase() ? `lowercase ${target}` : `capital ${target}`;
      return `Now tap ${targetName}.`;
    }
    return "Now type the word.";
  }

  return "Complete";
}

// ---------------------------------------------------------------------------
// Spelling teach messages
// ---------------------------------------------------------------------------

/**
 * Builds a phonics-level teach message for a spelling item after a wrong answer.
 * Escalates depth based on attempt number and review context.
 */
export function buildSpellingTeachMessage(
  expected: string,
  attempt: number,
  isAlphabet: boolean,
  inReviewRound: boolean,
): string {
  const clean = expected.trim().toLowerCase();
  if (!clean) return "Good try. Let us learn it together, then try again.";

  if (isAlphabet) {
    const letter = clean[0] ?? "a";
    const opener = attempt >= 2 || inReviewRound ? "Let us practise this carefully." : "Good try.";
    return `${opener}\n\nThis is lowercase ${letter}.\n${letter} says ${soundForLetter(letter)} like ${phonicsExampleForLetter(letter)}.\n\nTap ${letter} again.`;
  }

  const letters = clean.split("").join("-");
  const sounds = clean
    .split("")
    .map((letter) => `${letter} says ${soundForLetter(letter)}`)
    .join("\n");
  const opener =
    attempt >= 2 || inReviewRound
      ? "That one is tricky. Let us break it down together."
      : `Good try. The word is ${clean}.`;

  return `${opener}\n\nLet us learn it:\n${letters}\n${sounds}\n\nTogether: ${clean}\n\nNow type ${clean} again.`;
}

// ---------------------------------------------------------------------------
// Cross-subject teach message dispatcher
// ---------------------------------------------------------------------------

/**
 * Entry point for all teach messages regardless of subject.
 * Spelling → phonics breakdown. Math/Reading → progressive support scaffold.
 */
export function buildTeachMessage(input: {
  section: "spelling" | "math" | "reading";
  item: LessonItem;
  expected: string;
  attempt: number;
  inReviewRound: boolean;
}): string {
  if (input.section === "spelling") {
    return buildSpellingTeachMessage(
      input.expected,
      input.attempt,
      isAlphabetLessonItem(input.item),
      input.inReviewRound,
    );
  }

  return buildProgressiveSupportMessage({
    section: input.section,
    item: input.item,
    prompt: getPrompt(input.item, input.section),
    expected: input.expected,
    attempt: input.attempt,
    inReviewRound: input.inReviewRound,
  });
}

// ---------------------------------------------------------------------------
// Speech assessment prompts
// ---------------------------------------------------------------------------

/**
 * Returns the spoken assessment prompt for a spelling item.
 * Uses the item's custom assessmentPrompt field when set, otherwise derives
 * an appropriate prompt from whether the target is a letter or word.
 */
export function getAssessmentPrompt(item: LessonItem): string {
  const customPrompt = decodeLessonText(String(item.assessmentPrompt ?? "")).trim();
  if (customPrompt) return customPrompt;
  return isAlphabetLessonItem(item)
    ? "What letter do you see on the screen?"
    : "What word do you see on the screen?";
}

/**
 * Returns the support prompt spoken after a failed speech attempt.
 * Uses the item's custom supportPrompt field when set, otherwise derives
 * an instructional line from the target word or letter.
 */
export function getSupportPrompt(item: LessonItem): string {
  const customPrompt = decodeLessonText(String(item.supportPrompt ?? "")).trim();
  if (customPrompt) return customPrompt;
  const target = decodeLessonText(String(item.word ?? item.answer ?? "")).trim();
  const targetDescription = describeTargetForTutor(item);
  return isAlphabetLessonItem(item)
    ? `Good try. Look again. This is the letter ${targetDescription}. Say ${target}.`
    : `Good try. Look again. This is the word ${target}. Say ${target}.`;
}

// ---------------------------------------------------------------------------
// Re-exports from starliz-question-formula
// The coaching engine is the single import point for all message generation.
// ---------------------------------------------------------------------------

export {
  buildCoachSupportMessage,
  buildFinalRevealMessage,
  buildProgressiveSupportMessage,
  buildQuestionFormulaScaffold,
  buildRestoredLessonMessage,
  buildTutorPanelPrompt,
  buildWorkedSuccessMessage,
  classifyQuestionIntent,
  computeAttemptWeightedScore,
  scoreForResolvedQuestion,
  type LessonFlowSection,
  type QuestionAttemptSummary,
  type QuestionFormulaScaffold,
  type QuestionIntent,
  type QuestionVisualSupport,
} from "@/lib/starliz-question-formula";
