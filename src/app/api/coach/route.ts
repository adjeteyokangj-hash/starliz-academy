// ─────────────────────────────────────────────────────────────────────────────
// POST /api/coach
// Smart Coach API — deterministic engine + optional AI enhancement
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireSession, checkRateLimit, getRequestIp } from "@/lib/api_guard";
import { buildCoachResponse, buildAISystemPrompt, resolveAgeBand } from "@/lib/coach/engine";
import { getOpenAiApiKey } from "@/lib/api-key-config";
import { validateProgressiveHelp } from "@/lib/coach/progressive-help-gating";
import { shouldEnforceMasteryCheck, buildMasteryCheckPrompt, attachMasteryCheckToResponse } from "@/lib/coach/mastery-check-enforcement";
import { recordCoachInteraction, getSkillMastery } from "@/lib/coach/db-helpers";
import type { CoachContext, CoachResponse, AgeBand } from "@/lib/coach/types";

const VALID_SUBJECTS = ["maths", "reading", "spelling", "science", "english"] as const;
const VALID_AGE_BANDS = ["foundation", "primary", "secondary", "gcse"] as const;

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function normalizeSubject(value: unknown): CoachContext["subject"] {
  if (value === "math") return "maths";
  if (VALID_SUBJECTS.includes(value as (typeof VALID_SUBJECTS)[number])) {
    return value as CoachContext["subject"];
  }
  return "maths";
}

function normalizeYearGroup(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(11, Math.max(1, Math.floor(value)));
  }
  if (typeof value === "string") {
    const parsed = Number(value.match(/\d+/)?.[0] ?? "");
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(11, Math.max(1, Math.floor(parsed)));
    }
  }
  return undefined;
}

function logValidationFailure(raw: unknown, issues: string[]): void {
  if (!issues.length) return;
  const keys = raw && typeof raw === "object"
    ? Object.keys(raw as Record<string, unknown>).slice(0, 30)
    : [];
  console.warn("[coach.validation] payload normalized", {
    issues,
    keys,
  });
}

function parseBody(raw: unknown): { ctx: CoachContext; issues: string[] } {
  const issues: string[] = [];
  const b = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const subject = normalizeSubject(b["subject"]);
  const question = firstNonEmptyString(b["question"], b["prompt"]);
  const correctAnswer = firstNonEmptyString(b["correctAnswer"], b["answer"], b["expectedAnswer"]);
  const studentAnswer = firstNonEmptyString(b["studentAnswer"], b["currentInput"], b["answerGiven"]);

  if (!question) {
    issues.push("missing_question_or_prompt");
  }
  if (!correctAnswer) {
    issues.push("missing_correct_answer");
  }

  const hintCountRaw = Number(b["hintCount"] ?? b["hintLevel"] ?? 0);
  const attemptCountRaw = Number(b["attemptCount"] ?? b["wrongAttempts"] ?? (studentAnswer ? 1 : 0));
  const hintCount = Number.isFinite(hintCountRaw) ? Math.min(Math.max(0, hintCountRaw), 10) : 0;
  const attemptCount = Number.isFinite(attemptCountRaw) ? Math.min(Math.max(0, attemptCountRaw), 20) : 0;

  if (!Number.isFinite(hintCountRaw)) issues.push("invalid_hint_count");
  if (!Number.isFinite(attemptCountRaw)) issues.push("invalid_attempt_count");

  const yearGroup = normalizeYearGroup(b["yearGroup"]);

  const ageBand: AgeBand = resolveAgeBand({
    ageBand: VALID_AGE_BANDS.includes(b["ageBand"] as AgeBand)
      ? (b["ageBand"] as AgeBand)
      : undefined,
    yearGroup,
    mathDifficulty: typeof b["mathDifficulty"] === "number" ? b["mathDifficulty"] : undefined,
    ageRange: typeof b["ageRange"] === "string" ? b["ageRange"] : undefined,
  });

  const confidenceScore =
    typeof b["confidenceScore"] === "number"
      ? Math.min(1, Math.max(0, b["confidenceScore"]))
      : 0.5;

  return {
    ctx: {
      subject,
      question: question ?? "Let's solve this step by step.",
      correctAnswer: correctAnswer ?? "Let's work through it together.",
      studentAnswer,
      passageText: typeof b["passageText"] === "string" ? b["passageText"].slice(0, 4000) : undefined,
      hintCount,
      attemptCount,
      ageBand,
      yearGroup,
      skillFocus: firstNonEmptyString(b["skillFocus"], b["topic"])?.slice(0, 100),
      confidenceScore,
      weakSkills: Array.isArray(b["weakSkills"])
        ? (b["weakSkills"] as unknown[]).filter((s): s is string => typeof s === "string").slice(0, 10)
        : undefined,
      responseTimeMs:
        typeof b["responseTimeMs"] === "number" && Number.isFinite(b["responseTimeMs"])
          ? Math.min(Math.max(0, b["responseTimeMs"]), 300_000)
          : undefined,
    },
    issues,
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth
  const { session, response: authError } = await requireSession();
  if (!session) return authError!;

  // Rate-limit per user: 30 coach requests per minute
  const ip = getRequestIp(req);
  const rl = checkRateLimit({ key: `coach:${session.userId}:${ip}`, limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", retryAfterSeconds: rl.retryAfterSeconds },
      { status: 429 },
    );
  }

  // Parse + validate body
  let rawBody: unknown = {};
  try {
    rawBody = await req.json();
  } catch {
    logValidationFailure(null, ["invalid_json"]);
  }

  const { ctx, issues } = parseBody(rawBody);
  logValidationFailure(rawBody, issues);

  // Deterministic engine — always runs (fast fallback)
  const deterministicResponse = buildCoachResponse(ctx);

  // ─ Progressive-help gating: enforce level sequencing ─────────────────────
  const gatingValidation = validateProgressiveHelp(ctx, ctx.hintCount > 0 ? ctx.hintCount : undefined);
  if (!gatingValidation.allowed) {
    const safeHintLevel = Math.min(Math.max(gatingValidation.suggestedHintLevel ?? 1, 1), 4);
    const gatedResponse: CoachResponse = {
      ...deterministicResponse,
      mode: "hint",
      message: gatingValidation.reason || "Try one attempt first, then I can coach more precisely.",
      steps: [],
      followUp: null,
      hintLevel: safeHintLevel,
      shouldReveal: false,
      reinforcementNote: "Submit an attempt when you are ready for more targeted hints.",
      tryAgainPrompt: null,
      masterySignal: null,
      waitPrompt: "Have a go first, then ask for the next hint.",
    };
    return NextResponse.json(gatedResponse, { status: 200 });
  }

  // ─ Record interaction to database (async, non-blocking) ──────────────────
  recordCoachInteraction(
    session.userId,
    ctx.subject,
    ctx.skillFocus,
    ctx.question,
    deterministicResponse.hintLevel,
    deterministicResponse.mode,
    ctx.studentAnswer,
    ctx.studentAnswer ? true : undefined, // marked as correct if they already answered
    ctx.responseTimeMs,
  ).catch((err) => console.error("[coach db] Failed to record:", err));

  // ─ Attach mastery check if appropriate ─────────────────────────────────
  let finalResponse = deterministicResponse;
  if (shouldEnforceMasteryCheck(ctx)) {
    const skill = await getSkillMastery(session.userId, ctx.subject, ctx.skillFocus || "general").catch(() => null);
    if (skill && skill.masteryLevel !== "mastered") {
      const checkPrompt = buildMasteryCheckPrompt(ctx, deterministicResponse.similarQuestion);
      finalResponse = attachMasteryCheckToResponse(deterministicResponse, true, checkPrompt);
    }
  }

  // AI enhancement — only for secondary/GCSE, only when key is present
  const shouldUseAI = ctx.ageBand === "secondary" || ctx.ageBand === "gcse";
  if (shouldUseAI) {
    const apiKey = await getOpenAiApiKey().catch(() => null);
    if (apiKey) {
      const systemPrompt = buildAISystemPrompt(ctx);
      if (systemPrompt) {
        try {
          const aiResponse = await callOpenAI(apiKey, systemPrompt, ctx, finalResponse);
          if (aiResponse) {
            return NextResponse.json(aiResponse);
          }
        } catch (err) {
          // AI failed — fall through to deterministic response
          if (process.env.NODE_ENV !== "production") {
            console.warn("[SmartCoach] OpenAI call failed, using deterministic fallback:", err);
          }
        }
      }
    }
  }

  return NextResponse.json(finalResponse);
}

// ── OpenAI call ───────────────────────────────────────────────────────────────

async function callOpenAI(
  apiKey: string,
  systemPrompt: string,
  ctx: CoachContext,
  fallback: CoachResponse,
): Promise<CoachResponse | null> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 600,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Provide hint level ${ctx.hintCount + 1} coaching for this student.`,
        },
      ],
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(8000), // 8s timeout — don't block the user
  });

  if (!res.ok) return null;

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }

  // Merge AI message/steps with deterministic structure for safety
  const enhanced: CoachResponse = {
    ...fallback,
    message:
      typeof parsed["message"] === "string" && parsed["message"].length > 0
        ? parsed["message"]
        : fallback.message,
    reinforcementNote:
      typeof parsed["reinforcementNote"] === "string" && parsed["reinforcementNote"].length > 0
        ? parsed["reinforcementNote"]
        : fallback.reinforcementNote,
  };

  // Only adopt AI steps if they look valid
  if (Array.isArray(parsed["steps"]) && (parsed["steps"] as unknown[]).length > 0) {
    const steps = (parsed["steps"] as unknown[])
      .filter(
        (s): s is { expression: string; explanation: string } =>
          typeof (s as Record<string, unknown>)["expression"] === "string" &&
          typeof (s as Record<string, unknown>)["explanation"] === "string",
      )
      .slice(0, 8);
    if (steps.length > 0) enhanced.steps = steps;
  }

  // Only adopt AI followUp if structure is valid
  if (
    parsed["followUp"] &&
    typeof parsed["followUp"] === "object" &&
    typeof (parsed["followUp"] as Record<string, unknown>)["question"] === "string" &&
    Array.isArray((parsed["followUp"] as Record<string, unknown>)["options"])
  ) {
    const fu = parsed["followUp"] as Record<string, unknown>;
    const options = (fu["options"] as unknown[]).filter((o): o is string => typeof o === "string").slice(0, 4);
    if (options.length >= 2) {
      enhanced.followUp = {
        question: fu["question"] as string,
        options,
        correctIndex:
          typeof fu["correctIndex"] === "number"
            ? Math.min(fu["correctIndex"], options.length - 1)
            : fallback.followUp?.correctIndex ?? 0,
        onCorrect:
          typeof fu["onCorrect"] === "string"
            ? fu["onCorrect"]
            : fallback.followUp?.onCorrect ?? "Correct!",
        onWrong:
          typeof fu["onWrong"] === "string"
            ? fu["onWrong"]
            : fallback.followUp?.onWrong ?? "Not quite — think again.",
      };
    }
  }

  return enhanced;
}
