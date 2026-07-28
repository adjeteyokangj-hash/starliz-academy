/**
 * Live daytime UAT against localhost — authenticated admin + student flows.
 * Does not print secrets. Writes evidence JSON to scripts/.uat-daytime-evidence.json
 *
 * Usage:
 *   npx tsx scripts/uat-daytime-live.ts
 *
 * Auth (first match wins):
 *   UAT_ADMIN_EMAIL + UAT_ADMIN_PASSWORD
 *   E2E_OPS_ADMIN_EMAIL + E2E_OPS_ADMIN_PASSWORD (defaults: platform-admin@starliz.dev / PlatformAdmin#2026)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env) || !String(process.env[key] ?? "").trim()) {
        process.env[key] = val;
      }
    }
  } catch {
    // ignore
  }
}

loadEnvLocal();

import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "node:fs";
import {
  buildStoredQuestionHelpSteps,
  extractHelpFromQuestionItem,
} from "../src/lib/schools/question-help";
import { classifyDaytimeSubjectMode } from "../src/lib/schools/daytime-subject-mode";
import {
  normalizeDaytimeStagePack,
  validateDaytimeStagePack,
} from "../src/lib/schools/daytime-stage-validators";
import { studentFacingTextLeaksInternalIds } from "../src/lib/schools/daytime-lesson-health";

const BASE = process.env.UAT_BASE_URL ?? "http://localhost:3000";
const prisma = new PrismaClient();

type CookieJar = Map<string, string>;

function parseSetCookie(headers: Headers, jar: CookieJar) {
  const raw = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : [headers.get("set-cookie")].filter(Boolean) as string[];
  for (const line of raw) {
    const part = String(line).split(";")[0];
    const eq = part.indexOf("=");
    if (eq > 0) jar.set(part.slice(0, eq), part.slice(eq + 1));
  }
}

function cookieHeader(jar: CookieJar): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function api(
  jar: CookieJar,
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = 120_000,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        cookie: cookieHeader(jar),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    parseSetCookie(res.headers, jar);
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 500) };
    }
    return { status: res.status, ok: res.ok, json, text: text.slice(0, 800) };
  } finally {
    clearTimeout(timer);
  }
}

function subjectNeedles(kind: string): RegExp {
  switch (kind) {
    case "guided-reading":
      return /guided\s*reading|reading inference|english.*reading/i;
    case "spelling":
      return /spell|phonic/i;
    case "maths":
      return /math|number fluency|place value/i;
    case "science":
      return /science|enquiry|inquiry/i;
    case "pe":
      return /\bpe\b|invasion|physical|sport/i;
    default:
      return /./;
  }
}

function summarizePack(contentJson: string, metadataJson: string | null, subject: string, skillFocus: string | null) {
  const mode = classifyDaytimeSubjectMode(subject, skillFocus);
  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(metadataJson ?? "{}") as Record<string, unknown>;
  } catch {
    meta = {};
  }
  const pack = normalizeDaytimeStagePack(JSON.parse(contentJson), mode);
  const stageRaw = (meta.daytimeSession as { stage?: string } | undefined)?.stage;
  const stage = stageRaw === "warmup" || stageRaw === "stretch" || stageRaw === "core" ? stageRaw : "core";
  const targetMinutes = Number(
    (meta.daytimeSession as { estimatedMinutes?: number } | undefined)?.estimatedMinutes
      ?? pack?.estimatedMinutes
      ?? 8,
  );
  const issues = pack
    ? validateDaytimeStagePack({
        pack,
        mode,
        stage,
        targetMinutes,
        lessonTitle: subject,
      })
    : [{ code: "parse", message: "Could not normalize pack" }];

  const path =
    meta.generationSource === "openai" || meta.openAiSucceeded === true
      ? "OpenAI"
      : meta.generationSource === "failed"
        ? "failed"
        : meta.generationSource === "fallback" || meta.usedFallback === true
          ? "fallback"
          : typeof meta.model === "string" && String(meta.model).includes("daytime-curriculum")
            ? "template"
            : meta.openAiAttempted === true
              ? "OpenAI-attempted"
              : "unknown";

  return {
    mode,
    path,
    model: meta.model ?? null,
    openAiAttempted: meta.openAiAttempted ?? null,
    openAiSucceeded: meta.openAiSucceeded ?? null,
    generationSource: meta.generationSource ?? null,
    validationIssues: (meta.validationIssues as string[] | undefined) ?? [],
    stage,
    targetMinutes,
    passageTitle: pack?.passage?.title ?? null,
    passageWordCount: pack?.passage?.wordCount ?? 0,
    passagePreview: pack?.passage?.text?.slice(0, 180) ?? null,
    vocabularyCount: pack?.vocabulary?.length ?? 0,
    activityKinds: (pack?.activities ?? []).map((a) => a.kind),
    activityMinutes: (pack?.activities ?? []).reduce((s, a) => s + (a.estimatedMinutes || 0), 0),
    questionCount: pack?.questions?.length ?? 0,
    hasExplanation: Boolean(pack?.explanation?.trim()),
    workedExampleCount: pack?.workedExamples?.length ?? 0,
    spellingFocus: pack?.spellingFocus ?? null,
    targetWords: pack?.targetWords ?? [],
    scenario: pack?.scenarioOrObservation?.slice(0, 120) ?? null,
    sampleQuestions: (pack?.questions ?? []).slice(0, 4).map((q) => q.prompt),
    leak: studentFacingTextLeaksInternalIds(contentJson),
    issueCodes: issues.map((i) => i.code),
    firstHelp: (() => {
      const q = pack?.questions?.[0];
      if (!q) return null;
      const steps = buildStoredQuestionHelpSteps(
        extractHelpFromQuestionItem({
          hints: q.hints,
          explanation: q.explanation,
          breakdown: q.breakdown,
          answer: q.answer,
        }),
      );
      return {
        count: steps.length,
        firstRevealsAnswer: steps[0]?.revealsAnswer ?? null,
        firstBodyPreview: steps[0]?.body?.slice(0, 160) ?? null,
        answerLeakedInFirst: steps[0]?.body?.includes(String(q.answer)) ?? null,
      };
    })(),
  };
}

async function main() {
  const evidence: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    base: BASE,
    openaiEnv: {
      OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY?.trim()),
      OPENAI_TEXT_MODEL: process.env.OPENAI_TEXT_MODEL ?? "(unset; runtime may use .env.local via Next)",
    },
  };

  // Next loads .env.local; this script may not. Probe via API key config table without values.
  let dbKeyConfigured = false;
  try {
    const row = await prisma.apiKeyConfig.findFirst({
      where: { provider: "openai" },
      select: { id: true, encryptedValue: true, status: true },
    });
    dbKeyConfigured = Boolean(row?.encryptedValue);
  } catch {
    dbKeyConfigured = false;
  }
  evidence.openaiDbKeyConfigured = dbKeyConfigured;
  evidence.openaiConfigured = Boolean(process.env.OPENAI_API_KEY?.trim()) || dbKeyConfigured;

  // Confirm .env.local has a key line without reading the value into evidence.
  try {
    const fs = await import("node:fs");
    const envLocal = fs.readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    const match = envLocal.match(/^\s*OPENAI_API_KEY\s*=\s*(.+)$/m);
    const val = match?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
    evidence.openaiEnvLocalNonempty = val.length > 8;
    if (val && !process.env.OPENAI_API_KEY) {
      process.env.OPENAI_API_KEY = val;
    }
    evidence.openaiConfigured = Boolean(process.env.OPENAI_API_KEY?.trim()) || dbKeyConfigured;
  } catch {
    evidence.openaiEnvLocalNonempty = false;
  }

  const adminEmail = (
    process.env.UAT_ADMIN_EMAIL
    || process.env.E2E_OPS_ADMIN_EMAIL
    || "platform-admin@starliz.dev"
  ).trim().toLowerCase();
  const adminPassword = (
    process.env.UAT_ADMIN_PASSWORD
    || process.env.E2E_OPS_ADMIN_PASSWORD
    || "PlatformAdmin#2026"
  );

  evidence.authAttempt = {
    method: "POST /api/auth/login (admin role)",
    email: adminEmail,
    passwordProvided: Boolean(adminPassword),
  };

  const jar: CookieJar = new Map();
  const login = await api(jar, "POST", "/api/auth/login", {
    email: adminEmail,
    password: adminPassword,
  }, 30_000);

  evidence.authResult = {
    status: login.status,
    ok: login.ok,
    error: !login.ok
      ? (typeof (login.json as { error?: string })?.error === "string"
        ? (login.json as { error: string }).error
        : login.text)
      : null,
    cookiesReceived: [...jar.keys()],
  };

  if (!login.ok) {
    evidence.blocker = "Admin login failed — cannot continue live UAT.";
    writeEvidence(evidence);
    console.log(JSON.stringify(evidence, null, 2));
    process.exit(1);
  }

  // Prefer a school that already has daytime periods covering required subjects.
  const periods = await prisma.schoolDayLesson.findMany({
    where: { status: { not: "cancelled" } },
    select: {
      id: true,
      schoolId: true,
      classroomId: true,
      title: true,
      subject: true,
      skillFocus: true,
      lessonType: true,
      dayOfWeek: true,
      startsAt: true,
      endsAt: true,
      lessonId: true,
      lesson: { select: { id: true, contentRefs: true, reviewStatus: true } },
    },
    orderBy: [{ dayOfWeek: "asc" }, { periodIndex: "asc" }],
    take: 400,
  });

  const kinds = ["guided-reading", "spelling", "maths", "science", "pe"] as const;
  const picked: Record<string, (typeof periods)[number] | null> = {
    "guided-reading": null,
    spelling: null,
    maths: null,
    science: null,
    pe: null,
  };

  for (const kind of kinds) {
    const re = subjectNeedles(kind);
    picked[kind] = periods.find((row) => re.test(`${row.subject} ${row.title} ${row.skillFocus ?? ""}`)) ?? null;
  }

  evidence.pickedPeriods = Object.fromEntries(
    Object.entries(picked).map(([k, row]) => [
      k,
      row
        ? {
            dayLessonId: row.id,
            schoolId: row.schoolId,
            classroomId: row.classroomId,
            title: row.title,
            subject: row.subject,
            skillFocus: row.skillFocus,
            lessonId: row.lessonId,
          }
        : null,
    ]),
  );

  const lessonResults: Record<string, unknown> = {};

  for (const kind of kinds) {
    const period = picked[kind];
    if (!period) {
      lessonResults[kind] = { ok: false, error: "No matching timetable period found in DB." };
      continue;
    }

    const regen = await api(
      jar,
      "POST",
      "/api/admin/schools",
      {
        action: "regenerateDaytimeLesson",
        payload: {
          schoolId: period.schoolId,
          dayLessonId: period.id,
          regenerateReason: "Live UAT regenerate",
        },
      },
      420_000,
    );

    if (!regen.ok) {
      lessonResults[kind] = {
        ok: false,
        regenerateStatus: regen.status,
        error: (regen.json as { error?: string })?.error ?? regen.text,
      };
      continue;
    }

    const lesson = await prisma.lesson.findUnique({
      where: { id: period.lessonId ?? "" },
      select: { id: true, contentRefs: true, reviewStatus: true, machineHealthJson: true },
    });
    const ids = (lesson?.contentRefs ?? "").split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    const packs = await prisma.aIContentCache.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        topic: true,
        contentType: true,
        model: true,
        contentJson: true,
        metadataJson: true,
        prompt: true,
      },
    });
    const byId = new Map(packs.map((p) => [p.id, p]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as typeof packs;

    lessonResults[kind] = {
      ok: true,
      regenerateStatus: regen.status,
      reviewStatus: lesson?.reviewStatus ?? null,
      contentIds: ids,
      stages: ordered.map((pack) => ({
        id: pack.id,
        topic: pack.topic,
        contentType: pack.contentType,
        model: pack.model,
        promptPrefix: pack.prompt?.slice(0, 80) ?? null,
        summary: summarizePack(pack.contentJson, pack.metadataJson, period.subject, period.skillFocus),
      })),
    };
  }

  evidence.lessons = lessonResults;

  // Approve lessons that reached awaiting_review (or attempt GR/Maths gates for evidence).
  const approveTargets = ["guided-reading", "spelling", "maths", "science", "pe"] as const;
  const approvals: Record<string, unknown> = {};
  for (const kind of approveTargets) {
    const period = picked[kind];
    const result = lessonResults[kind] as { ok?: boolean; reviewStatus?: string } | undefined;
    if (!period || !result?.ok) {
      approvals[kind] = { skipped: true, reason: "regenerate failed or missing period" };
      continue;
    }

    // If machine_failed, still attempt approve to capture real gate behaviour.
    const approve = await api(jar, "POST", "/api/admin/schools", {
      action: "approveDaytimeLesson",
      payload: { schoolId: period.schoolId, dayLessonId: period.id },
    }, 60_000);
    approvals[kind] = {
      status: approve.status,
      ok: approve.ok,
      body: approve.json,
      priorReviewStatus: result.reviewStatus,
    };
  }
  evidence.approvals = approvals;

  // Student playback via admin preview (supported by start/continue routes).
  // Prefer an approved lesson; fall back to Guided Reading for evidence capture.
  const playKind = (["maths", "spelling", "pe", "guided-reading", "science"] as const).find((kind) => {
    const approval = approvals[kind] as { ok?: boolean } | undefined;
    return Boolean(approval?.ok);
  }) ?? "guided-reading";
  const playPeriod = picked[playKind] ?? picked["guided-reading"];
  const studentFlow: Record<string, unknown> = { playKind };

  if (playPeriod?.classroomId) {
    const enrolment = await prisma.schoolStudent.findFirst({
      where: { classroomId: playPeriod.classroomId, status: "active" },
      select: { childId: true, schoolId: true, classroomId: true },
    });
    studentFlow.enrolmentFound = Boolean(enrolment);
    studentFlow.childId = enrolment?.childId ?? null;
    studentFlow.method = "admin session + POST start/continue with studentId (admin preview path)";

    if (enrolment?.childId) {
      const approvePlay = approvals[playKind] as { ok?: boolean } | undefined;
      if (!approvePlay?.ok) {
        const forceApprove = await api(jar, "POST", "/api/admin/schools", {
          action: "approveDaytimeLesson",
          payload: { schoolId: playPeriod.schoolId, dayLessonId: playPeriod.id },
        }, 60_000);
        studentFlow.approveBeforePlay = {
          status: forceApprove.status,
          ok: forceApprove.ok,
          body: forceApprove.json,
        };
      }

      const start1 = await api(jar, "POST", `/api/student/daytime-period/${playPeriod.id}/start`, {
        studentId: enrolment.childId,
      }, 90_000);
      studentFlow.stage1 = { status: start1.status, ok: start1.ok, body: start1.json };

      const contentId1 = (start1.json as { contentId?: string })?.contentId ?? null;
      const assignmentId1 = (start1.json as { assignmentId?: string })?.assignmentId ?? null;

      const start1b = await api(jar, "POST", `/api/student/daytime-period/${playPeriod.id}/start`, {
        studentId: enrolment.childId,
      }, 90_000);
      studentFlow.stage1_repeat_no_duplicate = {
        status: start1b.status,
        ok: start1b.ok,
        assignmentId: (start1b.json as { assignmentId?: string })?.assignmentId ?? null,
        contentId: (start1b.json as { contentId?: string })?.contentId ?? null,
        sameAssignmentAsFirst:
          ((start1b.json as { assignmentId?: string })?.assignmentId ?? null) === assignmentId1,
        sameContentAsFirst:
          ((start1b.json as { contentId?: string })?.contentId ?? null) === contentId1,
      };

      const cont2 = await api(jar, "POST", `/api/student/daytime-period/${playPeriod.id}/continue`, {
        studentId: enrolment.childId,
        completedContentId: contentId1,
      }, 90_000);
      studentFlow.stage2 = { status: cont2.status, ok: cont2.ok, body: cont2.json };
      const contentId2 = (cont2.json as { contentId?: string })?.contentId ?? null;
      const differentFromStage1 = contentId2 && contentId1 ? contentId2 !== contentId1 : null;

      const cont3 = await api(jar, "POST", `/api/student/daytime-period/${playPeriod.id}/continue`, {
        studentId: enrolment.childId,
        completedContentId: contentId2,
      }, 90_000);
      studentFlow.stage3 = { status: cont3.status, ok: cont3.ok, body: cont3.json };
      const contentId3 = (cont3.json as { contentId?: string })?.contentId ?? null;

      studentFlow.stageProgression = {
        playKind,
        stage1ContentId: contentId1,
        stage2ContentId: contentId2,
        stage3ContentId: contentId3,
        stage2DifferentFrom1: differentFromStage1,
        stage3DifferentFrom2: contentId3 && contentId2 ? contentId3 !== contentId2 : null,
        sessionPlan1: (start1.json as { sessionPlan?: unknown })?.sessionPlan ?? null,
        sessionPlan2: (cont2.json as { sessionPlan?: unknown })?.sessionPlan ?? null,
        sessionPlan3: (cont3.json as { sessionPlan?: unknown })?.sessionPlan ?? null,
      };

      if (contentId1) {
        const pack = await prisma.aIContentCache.findUnique({
          where: { id: contentId1 },
          select: { contentJson: true },
        });
        if (pack) {
          let questions: unknown[] = [];
          try {
            const parsed = JSON.parse(pack.contentJson) as { questions?: unknown[]; items?: unknown[] };
            questions = Array.isArray(parsed.questions)
              ? parsed.questions
              : Array.isArray(parsed.items)
                ? parsed.items
                : Array.isArray(JSON.parse(pack.contentJson))
                  ? JSON.parse(pack.contentJson) as unknown[]
                  : [];
          } catch {
            questions = [];
          }
          const q = questions[0];
          if (q && typeof q === "object") {
            const row = q as Record<string, unknown>;
            const help = buildStoredQuestionHelpSteps(extractHelpFromQuestionItem(row));
            studentFlow.iDontUnderstand = {
              source: "live stage-1 content via QuestionHelp stored scaffolding",
              questionPreview: String(row.prompt ?? row.question ?? "").slice(0, 160),
              steps: help.map((s) => ({
                title: s.title,
                revealsAnswer: s.revealsAnswer,
                bodyPreview: s.body.slice(0, 220),
              })),
              firstRevealsAnswer: help[0]?.revealsAnswer ?? null,
              answerLeakedInFirstStep: help[0]?.body?.includes(String(row.answer ?? row.correctAnswer ?? "")) ?? null,
            };

            const coachSubject = playKind === "maths" ? "maths" : playKind === "spelling" ? "spelling" : "reading";
            const coach1 = await api(jar, "POST", "/api/coach", {
              studentId: enrolment.childId,
              subject: coachSubject,
              intent: "i_dont_understand",
              question: String(row.prompt ?? row.question ?? ""),
              answer: String(row.answer ?? row.correctAnswer ?? ""),
              yearGroup: 6,
              hintCount: 0,
              passage: typeof row.passage === "string" ? row.passage : undefined,
            }, 90_000);
            const coach2 = await api(jar, "POST", "/api/coach", {
              studentId: enrolment.childId,
              subject: coachSubject,
              intent: "i_dont_understand",
              question: String(row.prompt ?? row.question ?? ""),
              answer: String(row.answer ?? row.correctAnswer ?? ""),
              yearGroup: 6,
              hintCount: 1,
              passage: typeof row.passage === "string" ? row.passage : undefined,
            }, 90_000);
            const coachBody1 = coach1.json as { message?: string; reply?: string; error?: string };
            const coachBody2 = coach2.json as { message?: string; reply?: string; error?: string };
            const text1 = String(coachBody1.message ?? coachBody1.reply ?? JSON.stringify(coachBody1)).slice(0, 400);
            const text2 = String(coachBody2.message ?? coachBody2.reply ?? JSON.stringify(coachBody2)).slice(0, 400);
            studentFlow.iDontUnderstandLiveCoach = {
              first: { status: coach1.status, ok: coach1.ok, preview: text1 },
              second: { status: coach2.status, ok: coach2.ok, preview: text2 },
              progressed: text1.length > 0 && text2.length > 0 && text1 !== text2,
              firstRevealsAnswer: text1.includes(String(row.answer ?? row.correctAnswer ?? "")),
            };
          }
        }
      }
    }
  } else {
    studentFlow.error = "No playable period/classroom for student flow.";
  }

  evidence.studentFlow = studentFlow;
  evidence.finishedAt = new Date().toISOString();
  writeEvidence(evidence);
  console.log(JSON.stringify(evidence, null, 2));
}

function writeEvidence(evidence: Record<string, unknown>) {
  const out = resolve(process.cwd(), "scripts/.uat-daytime-evidence.json");
  writeFileSync(out, JSON.stringify(evidence, null, 2), "utf8");
  evidence.evidenceFile = out;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
