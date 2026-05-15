// ─────────────────────────────────────────────────────────────────────────────
// Smart Coach engine — universal entry point
// Routes to subject-specific strategy, applies age-band delivery,
// implements mastery detection.  Pure function — no API calls.
// ─────────────────────────────────────────────────────────────────────────────

import { AgeBand, CoachContext, CoachResponse, MasterySignal } from "./types";
import { buildMathsCoachResponse } from "./maths-steps";
import { buildReadingCoachResponse } from "./reading-hints";
import { buildSpellingCoachResponse } from "./spelling-hints";

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

// ── Science fallback ──────────────────────────────────────────────────────────

function buildScienceCoachResponse(ctx: CoachContext): CoachResponse {
  const hintLevel = Math.min(ctx.hintCount + 1, 4);
  const shouldReveal = hintLevel >= 4;
  const { ageBand } = ctx;

  const messages: Record<number, string> = {
    1: "Think about cause and effect — what makes this happen?",
    2: "Identify the key scientific concept being tested. What variable is being changed or measured?",
    3: "Consider the explanation step by step: input → process → output.",
    4: `The answer is "${ctx.correctAnswer}". Read the explanation to understand the mechanism.`,
  };

  return {
    mode: hintLevel === 1 ? "hint" : hintLevel <= 3 ? "guided_steps" : "reveal",
    ageBand,
    message: messages[hintLevel] ?? messages[4]!,
    steps:
      hintLevel >= 3
        ? [
            { expression: "Identify the variable", explanation: "What is being tested or changed?" },
            { expression: "State the relationship", explanation: "As X increases, Y…?" },
            { expression: "Link to the concept", explanation: "Name the scientific principle that explains this." },
          ]
        : [],
    followUp:
      hintLevel === 2
        ? {
            question: "Is this question asking you to describe, explain, or evaluate?",
            options: ["Explain — I need to say why or how", "Describe — I just list facts", "Evaluate — I weigh up evidence", "I'm not sure"],
            correctIndex: 0,
            onCorrect: "Correct — 'explain' means you must give a reason using scientific language.",
            onWrong: "Look at the command word: 'explain' = give reasons; 'describe' = state facts; 'evaluate' = judge with evidence.",
          }
        : null,
    hintLevel,
    shouldReveal,
    reinforcementNote:
      ageBand === "gcse"
        ? "Use specific scientific terminology — vague language loses marks. State the mechanism, not just the outcome."
        : "Think about what you know from class: what causes this? What is the effect?",
    tryAgainPrompt: shouldReveal ? "Can you now explain this in your own words without looking?" : null,
    masterySignal: null,
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

  switch (safeCtx.subject) {
    case "maths":
      return buildMathsCoachResponse(safeCtx);
    case "reading":
    case "english":
      return buildReadingCoachResponse(safeCtx);
    case "spelling":
      return buildSpellingCoachResponse(safeCtx);
    case "science":
      return buildScienceCoachResponse(safeCtx);
    default:
      return buildMathsCoachResponse(safeCtx); // safe fallback
  }
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
