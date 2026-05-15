// ─────────────────────────────────────────────────────────────────────────────
// POST /api/coach
// Smart Coach API — deterministic engine + optional AI enhancement
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireSession, checkRateLimit, getRequestIp } from "@/lib/api_guard";
import { buildCoachResponse, buildAISystemPrompt, resolveAgeBand } from "@/lib/coach/engine";
import { getOpenAiApiKey } from "@/lib/api-key-config";
import type { CoachContext, CoachResponse, AgeBand } from "@/lib/coach/types";

const VALID_SUBJECTS = ["maths", "reading", "spelling", "science", "english"] as const;
const VALID_AGE_BANDS = ["foundation", "primary", "secondary", "gcse"] as const;

function parseBody(raw: unknown): CoachContext | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;

  const subject = b["subject"];
  if (!VALID_SUBJECTS.includes(subject as (typeof VALID_SUBJECTS)[number])) return null;

  const question = typeof b["question"] === "string" ? b["question"].trim() : null;
  const correctAnswer = typeof b["correctAnswer"] === "string" ? b["correctAnswer"].trim() : null;
  if (!question || !correctAnswer) return null;

  const hintCount = Number(b["hintCount"]);
  const attemptCount = Number(b["attemptCount"]);
  if (!Number.isFinite(hintCount) || !Number.isFinite(attemptCount)) return null;

  // Resolve age band
  const ageBand: AgeBand = resolveAgeBand({
    ageBand: VALID_AGE_BANDS.includes(b["ageBand"] as AgeBand)
      ? (b["ageBand"] as AgeBand)
      : undefined,
    yearGroup: typeof b["yearGroup"] === "number" ? b["yearGroup"] : undefined,
    mathDifficulty: typeof b["mathDifficulty"] === "number" ? b["mathDifficulty"] : undefined,
    ageRange: typeof b["ageRange"] === "string" ? b["ageRange"] : undefined,
  });

  const confidenceScore =
    typeof b["confidenceScore"] === "number"
      ? Math.min(1, Math.max(0, b["confidenceScore"]))
      : 0.5;

  return {
    subject: subject as CoachContext["subject"],
    question,
    correctAnswer,
    studentAnswer: typeof b["studentAnswer"] === "string" ? b["studentAnswer"].trim() : undefined,
    passageText: typeof b["passageText"] === "string" ? b["passageText"].slice(0, 4000) : undefined,
    hintCount: Math.min(Math.max(0, hintCount), 10),
    attemptCount: Math.min(Math.max(0, attemptCount), 20),
    ageBand,
    yearGroup: typeof b["yearGroup"] === "number" ? b["yearGroup"] : undefined,
    skillFocus: typeof b["skillFocus"] === "string" ? b["skillFocus"].slice(0, 100) : undefined,
    confidenceScore,
    weakSkills: Array.isArray(b["weakSkills"])
      ? (b["weakSkills"] as unknown[]).filter((s): s is string => typeof s === "string").slice(0, 10)
      : undefined,
    responseTimeMs:
      typeof b["responseTimeMs"] === "number" && Number.isFinite(b["responseTimeMs"])
        ? Math.min(Math.max(0, b["responseTimeMs"]), 300_000)
        : undefined,
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
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ctx = parseBody(rawBody);
  if (!ctx) {
    return NextResponse.json({ error: "Invalid or incomplete request body" }, { status: 400 });
  }

  // Deterministic engine — always runs (fast fallback)
  const deterministicResponse = buildCoachResponse(ctx);

  // AI enhancement — only for secondary/GCSE, only when key is present
  const shouldUseAI = ctx.ageBand === "secondary" || ctx.ageBand === "gcse";
  if (shouldUseAI) {
    const apiKey = await getOpenAiApiKey().catch(() => null);
    if (apiKey) {
      const systemPrompt = buildAISystemPrompt(ctx);
      if (systemPrompt) {
        try {
          const aiResponse = await callOpenAI(apiKey, systemPrompt, ctx, deterministicResponse);
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

  return NextResponse.json(deterministicResponse);
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
