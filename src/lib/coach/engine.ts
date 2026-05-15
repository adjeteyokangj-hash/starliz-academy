// ─────────────────────────────────────────────────────────────────────────────
// Smart Coach engine — universal entry point
// Routes to subject-specific strategy, applies age-band delivery,
// implements mastery detection.  Pure function — no API calls.
// ─────────────────────────────────────────────────────────────────────────────

import { AgeBand, CoachContext, CoachResponse, CoachStrategy, LearningIntent, MasteryLevel, MasterySignal } from "./types";
import { buildMathsCoachResponse } from "./maths-steps";
import { buildReadingCoachResponse } from "./reading-hints";
import { buildSpellingCoachResponse } from "./spelling-hints";
import { buildScienceCoachResponse } from "./science-hints";
import { buildEnglishCoachResponse } from "./english-hints";

// ── Age-band resolver ─────────────────────────────────────────────────────────

/**
 * Resolve an AgeBand from whatever context fields are available.
 * Priority: yearGroup → explicit ageBand already set → mathDifficulty proxy.
 */
export function resolveAgeBand(params: {
  ageBand?: AgeBand;
  yearGroup?: number;
  mathDifficulty?: number;
  ageRange?: string; // e.g. "5-7" | "8-10" | "11-13" | "14+"
}): AgeBand {
  const { yearGroup, mathDifficulty, ageRange } = params;

  // 1. Explicit yearGroup is most precise
  if (yearGroup !== undefined) {
    if (yearGroup <= 2) return "foundation";
    if (yearGroup <= 6) return "primary";
    if (yearGroup <= 9) return "secondary";
    return "gcse";
  }

  // 2. ageRange string
  if (ageRange) {
    if (ageRange === "5-7") return "foundation";
    if (ageRange === "8-10") return "primary";
    if (ageRange === "11-13") return "secondary";
    if (ageRange === "14+") return "gcse";
  }

  // 3. mathDifficulty proxy (1-5)
  if (mathDifficulty !== undefined) {
    if (mathDifficulty <= 2) return "primary";  // difficulty 1-2 → primary (foundation too young for difficulty scoring)
    if (mathDifficulty === 3) return "primary";
    if (mathDifficulty === 4) return "secondary";
    return "gcse";
  }

  // Fallback
  return params.ageBand ?? "primary";
}

// ── Mastery detector ──────────────────────────────────────────────────────────

/**
 * Estimate mastery signal from how the student reached the correct answer.
 * Called after a correct answer to annotate the coaching memory.
 */
export function detectMasterySignal(params: {
  correct: boolean;
  hintsUsed: number;
  responseTimeMs: number;
  attemptCount: number;
  answerWasRevealed?: boolean;
  followUpCorrect?: boolean;
}): MasterySignal | null {
  const { correct, hintsUsed, responseTimeMs, attemptCount, answerWasRevealed, followUpCorrect } = params;

  if (!correct) return null; // only signal on correct answers

  if (answerWasRevealed) return "guessing";
  if (hintsUsed >= 3 || attemptCount >= 3) return "memorising";

  const fast = responseTimeMs < 8000;
  const medium = responseTimeMs < 20000;

  if (hintsUsed === 0 && attemptCount === 0 && fast) return "confident";
  if (hintsUsed <= 1 && medium && followUpCorrect !== false) return "understanding";
  return "memorising";
}

// ── Confidence delta ──────────────────────────────────────────────────────────

/** Adjust the confidence score in coaching memory after a coach interaction. */
export function computeConfidenceDelta(signal: MasterySignal | null, hintsUsed: number): number {
  if (signal === "confident") return 0.05;
  if (signal === "understanding") return 0.02;
  if (signal === "memorising") return -0.01;
  if (signal === "guessing") return -0.06;
  // No correct answer yet — hint was used
  return hintsUsed > 0 ? -0.02 : 0;
}

// ── Universal tutor strategy ────────────────────────────────────────────────

function computeResponseSpeed(responseTimeMs?: number): "fast" | "steady" | "slow" {
  if (!responseTimeMs || responseTimeMs <= 6000) return "fast";
  if (responseTimeMs <= 30000) return "steady";
  return "slow";
}

function inferLearningIntent(ctx: CoachContext, responseSpeed: "fast" | "steady" | "slow"): LearningIntent {
  const hasAttempt = typeof ctx.studentAnswer === "string" && ctx.studentAnswer.length > 0;
  if (!hasAttempt) return "seeking_guidance";
  if (ctx.attemptCount >= 3) return "misconception_risk";
  if (responseSpeed === "fast" && ctx.attemptCount >= 1) return "guessing_risk";
  if (ctx.hintCount >= 3) return "developing_understanding";
  if (ctx.hintCount <= 1 && ctx.attemptCount <= 1 && ctx.confidenceScore >= 0.7) return "independent_reasoning";
  return "building_understanding";
}

function inferTeachingStyle(ctx: CoachContext): CoachStrategy["teachingStyle"] {
  if (ctx.ageBand === "foundation") return "visual_scaffold";
  if (ctx.ageBand === "gcse") return "exam_technique";
  if (ctx.subject === "spelling") return "pattern_practice";
  if (ctx.subject === "reading" || ctx.subject === "english") return "interactive_questioning";
  return "guided_reasoning";
}

function inferMasteryLevel(ctx: CoachContext, responseSpeed: "fast" | "steady" | "slow"): MasteryLevel {
  if (ctx.hintCount === 0 && ctx.attemptCount === 0 && ctx.confidenceScore >= 0.8 && responseSpeed === "fast") {
    return "mastered";
  }
  if (ctx.hintCount <= 1 && ctx.attemptCount <= 1 && ctx.confidenceScore >= 0.65) return "confident";
  if (ctx.hintCount >= 3 || ctx.attemptCount >= 3) return "practising";
  if (ctx.hintCount >= 2 || responseSpeed === "slow") return "developing";
  return "new";
}

/** Build explicit per-turn tutoring strategy used across all subjects. */
export function buildCoachStrategy(ctx: CoachContext): CoachStrategy {
  const hintLevel = Math.min(ctx.hintCount + 1, 4);
  const responseSpeed = computeResponseSpeed(ctx.responseTimeMs);
  const struggleRaw =
    (ctx.hintCount / 4) * 0.35 +
    Math.min(ctx.attemptCount / 4, 1) * 0.35 +
    (1 - Math.min(Math.max(ctx.confidenceScore, 0), 1)) * 0.2 +
    Math.min((ctx.weakSkills?.length ?? 0) / 5, 1) * 0.1;
  const struggleScore = Math.min(Math.max(struggleRaw, 0), 1);
  const learningIntent = inferLearningIntent(ctx, responseSpeed);
  const masteryLevel = inferMasteryLevel(ctx, responseSpeed);
  const teachingStyle = inferTeachingStyle(ctx);

  const adaptationSummary =
    learningIntent === "misconception_risk"
      ? "Repeated errors detected: switch to mistake-recovery coaching with gentle correction."
      : learningIntent === "guessing_risk"
      ? "Fast incorrect attempts detected: enforce wait-and-think prompts and short follow-ups."
      : hintLevel >= 4
      ? "Full walkthrough enabled after progressive hints; mastery check should follow."
      : ctx.ageBand === "foundation"
      ? "Use short language, concrete examples, and visual scaffolds."
      : ctx.ageBand === "gcse"
      ? "Use exam-focused method language and explicit mark-winning structure."
      : "Use one-step hints, interactive questions, and confidence-building prompts.";

  return {
    subject: ctx.subject,
    ageBand: ctx.ageBand,
    yearGroup: ctx.yearGroup,
    hintLevel,
    confidenceLevel: Math.min(Math.max(ctx.confidenceScore, 0), 1),
    weaknessHistory: ctx.weakSkills ?? [],
    hintUsage: ctx.hintCount,
    retryCount: ctx.attemptCount,
    responseSpeed,
    struggleScore,
    learningIntent,
    masteryLevel,
    teachingStyle,
    adaptationSummary,
  };
}

// ── Main engine ───────────────────────────────────────────────────────────────

/**
 * Build a structured coaching response.
 * Deterministic — zero API calls. Used as the reliable fallback and as
 * the primary engine for foundation/primary students.
 */
export function buildCoachResponse(ctx: CoachContext): CoachResponse {
  // Clamp hintCount defensively
  const safeCtx: CoachContext = { ...ctx, hintCount: Math.max(0, ctx.hintCount) };
  const strategy = buildCoachStrategy(safeCtx);

  let base: CoachResponse;

  switch (safeCtx.subject) {
    case "maths":
      base = buildMathsCoachResponse(safeCtx);
      break;
    case "reading":
      base = buildReadingCoachResponse(safeCtx);
      break;
    case "english":
      base = buildEnglishCoachResponse(safeCtx);
      break;
    case "spelling":
      base = buildSpellingCoachResponse(safeCtx);
      break;
    case "science":
      base = buildScienceCoachResponse(safeCtx); // from science-hints.ts
      break;
    default:
      base = buildMathsCoachResponse(safeCtx); // safe fallback
      break;
  }

  return {
    ...base,
    strategy,
    masteryLevel: strategy.masteryLevel,
    learningIntent: strategy.learningIntent,
    adaptationSummary: strategy.adaptationSummary,
  };
}

// ── Emotional tone helper ─────────────────────────────────────────────────────

/**
 * Returns a short empathetic opening line calibrated to the student's
 * current state. Called by the engine on every response.
 */
export function buildEmotionalTone(ctx: CoachContext): string {
  const { hintCount, attemptCount, studentAnswer, correctAnswer, confidenceScore } = ctx;

  // Very close to correct answer
  if (studentAnswer && correctAnswer) {
    const sNum = Number(studentAnswer);
    const cNum = Number(correctAnswer);
    if (Number.isFinite(sNum) && Number.isFinite(cNum)) {
      if (sNum === cNum) return "That is correct — well done!";
      if (Math.abs(sNum - cNum) <= 2) return "You are very close — just one small step away.";
    }
  }

  if (hintCount >= 3) return "You have been working hard on this — let's look at it from the beginning together.";
  if (attemptCount >= 3) return "Persistence is a real skill. Let's find where the thinking is going differently.";
  if (hintCount >= 2) return "Let's go a bit deeper — you are getting closer.";
  if (confidenceScore < 0.35) return "Take your time — let's work through this one step at a time.";
  if (hintCount === 0 && attemptCount === 0) return "Let's think about this together.";
  return "Good effort — here is a clue to help you think it through.";
}

// ── Similar question generator ────────────────────────────────────────────────

/** Generate a mastery-check question after full reveal. Subject-aware. */
export function buildSimilarQuestion(ctx: CoachContext): { prompt: string; answer?: string } | undefined {
  // Reveal is reached when the next hint level would be 4 (hintCount starts at 0).
  if (ctx.hintCount < 3) return undefined;

  if (ctx.subject === "maths") {
    return generateSimilarMathQuestion(ctx.question, ctx.correctAnswer);
  }
  if (ctx.subject === "spelling") {
    return { prompt: `Now try: cover the word "${ctx.correctAnswer}" and write it from memory. Then check.` };
  }
  if (ctx.subject === "reading" || ctx.subject === "english") {
    return { prompt: `Find another sentence in the passage that uses the same ${ctx.skillFocus ?? "skill"} and explain its effect.` };
  }
  if (ctx.subject === "science") {
    return { prompt: `Explain in your own words, without looking: ${ctx.question}` };
  }
  return { prompt: "Try a similar question on your own to confirm you understand." };
}

function generateSimilarMathQuestion(question: string, correctAnswer: string): { prompt: string; answer: string } | undefined {
  // Linear: ax + b = c → ax + (b+2) = c+2 (same solution)
  const linearMatch = question.match(/^(\d+)?\s*x\s*([+\-])\s*(\d+)\s*=\s*(\d+)$/i);
  if (linearMatch) {
    const a = linearMatch[1] ? Number(linearMatch[1]) : 1;
    const sign = linearMatch[2]!;
    const b = Number(linearMatch[3]);
    const c = Number(linearMatch[4]);
    const newB = b + 2;
    const newC = c + 2;
    return { prompt: `Now try: ${a === 1 ? "" : a}x ${sign} ${newB} = ${newC}`, answer: correctAnswer };
  }
  // Arithmetic: left OP right → (left+1) OP (right+1)
  const arithMatch = question.match(/(-?\d+(?:\.\d+)?)\s*([+\-×x\*÷\/])\s*(-?\d+(?:\.\d+)?)/);
  if (arithMatch) {
    const left = Number(arithMatch[1]) + 1;
    const op = arithMatch[2]!;
    const right = Number(arithMatch[3]) + 1;
    const displayOp: Record<string, string> = { "+": "+", "-": "−", "×": "×", "x": "×", "*": "×", "÷": "÷", "/": "÷" };
    let newAnswer: number;
    if (op === "+" ) newAnswer = left + right;
    else if (op === "-") newAnswer = left - right;
    else if (op === "×" || op === "x" || op === "*") newAnswer = left * right;
    else newAnswer = left / right;
    return { prompt: `Now try: ${left} ${displayOp[op] ?? op} ${right}`, answer: String(newAnswer) };
  }
  return { prompt: "Try a similar equation on your own.", answer: "" };
}

// ── OpenAI system prompt builder ──────────────────────────────────────────────

/**
 * Build the strict system prompt for OpenAI GPT-4o-mini.
 * Used only for secondary/GCSE students when an API key is present.
 * Returns null if the deterministic engine is sufficient.
 */
export function buildAISystemPrompt(ctx: CoachContext): string | null {
  if (ctx.ageBand !== "secondary" && ctx.ageBand !== "gcse") return null;
  if (ctx.hintCount === 0 && ctx.subject === "maths") return null; // level 1 hint is always deterministic

  const strategy = buildCoachStrategy(ctx);

  return `You are a precise UK-curriculum ${ctx.subject} tutor for StarLiz Academy, supporting Year ${ctx.yearGroup ?? (ctx.ageBand === "gcse" ? "10-11" : "7-9")} students.

RULES:
1. Never reveal the full answer before hint level 4.
2. Every response must reference the EXACT question text and the student's specific mistake.
3. Never give generic advice — be specific to this question and this error.
4. Use age-appropriate UK curriculum language for ${ctx.ageBand} band.
5. For maths: show algebraic notation with step-by-step working.
6. For reading: use terminology (connotation, inference, retrieval, technique, effect).
7. Hint level is ${ctx.hintCount + 1} of 4 — calibrate depth accordingly.
8. Keep messages under 60 words. Steps under 20 words each.
9. Return ONLY valid JSON — no markdown, no extra text.

CONTEXT:
Subject: ${ctx.subject}
Question: ${ctx.question}
Correct answer: ${ctx.correctAnswer}
Student's answer: ${ctx.studentAnswer ?? "(not yet answered)"}
Skill focus: ${ctx.skillFocus ?? "general"}
Hint count: ${ctx.hintCount}
Confidence score: ${ctx.confidenceScore.toFixed(2)} (0=struggling, 1=confident)
Learning intent: ${strategy.learningIntent}
Mastery stage: ${strategy.masteryLevel}
Teaching style: ${strategy.teachingStyle}
Struggle score: ${strategy.struggleScore.toFixed(2)}

OUTPUT SCHEMA (JSON only):
{
  "message": "string — main coaching message, max 60 words",
  "steps": [{"expression": "string", "explanation": "string"}],
  "followUp": {
    "question": "string",
    "options": ["string", "string", "string"],
    "correctIndex": 0,
    "onCorrect": "string",
    "onWrong": "string"
  } | null,
  "reinforcementNote": "string — exam tip, max 20 words"
}`;
}
