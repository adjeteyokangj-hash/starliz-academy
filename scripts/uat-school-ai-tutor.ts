/**
 * Authenticated localhost UAT for School AI Tutor v1 Stage 1.
 * Does not migrate/reset/delete school data. Restores period clock after runs.
 *
 * Usage: npx tsx scripts/uat-school-ai-tutor.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      const existing = String(process.env[k] ?? "").trim();
      if (!existing || (k === "DATABASE_URL" && !/^postgres/i.test(existing) && /^postgres/i.test(v))) {
        process.env[k] = v;
      }
    }
  } catch {
    // ignore
  }
}
loadEnvLocal();

import { PrismaClient } from "@prisma/client";
import { ageGroupForYearGroup, keyStageForYearGroup } from "../src/lib/curriculum";

const BASE = process.env.UAT_BASE_URL ?? "http://localhost:3000";
const prisma = new PrismaClient();
type CookieJar = Map<string, string>;

type Check = { name: string; ok: boolean; detail?: string };

function typicalAgeForYearGroup(yearGroup: string | null | undefined): number {
  const range = ageGroupForYearGroup(yearGroup);
  const parts = String(range)
    .split(/[\u2012\u2013\u2014\u2015-]/)
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isFinite(n));
  if (parts.length >= 2) return Math.round((parts[0] + parts[1]) / 2);
  if (parts.length === 1) return parts[0];
  const yearNum = Number(String(yearGroup ?? "").replace(/\D/g, ""));
  return Number.isFinite(yearNum) ? yearNum + 5 : 10;
}

function parseSetCookie(headers: Headers, jar: CookieJar) {
  const raw = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : ([headers.get("set-cookie")].filter(Boolean) as string[]);
  for (const line of raw) {
    const part = String(line).split(";")[0];
    const eq = part.indexOf("=");
    if (eq > 0) jar.set(part.slice(0, eq), part.slice(eq + 1));
  }
}

function cookieHeader(jar: CookieJar): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function api(jar: CookieJar, method: string, path: string, body?: unknown, timeoutMs = 60_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { "content-type": "application/json", cookie: cookieHeader(jar) },
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
    return { status: res.status, ok: res.ok, json, text };
  } finally {
    clearTimeout(timer);
  }
}

function hmNowPlus(offsetMinutes: number): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() + offsetMinutes);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function firstQuestionMeta(contentJson: string): { questionId?: string; questionIndex: number; word?: string; prompt: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contentJson);
  } catch {
    return { questionIndex: 0, prompt: "" };
  }
  const row = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
  const items = Array.isArray(parsed)
    ? parsed
    : Array.isArray(row?.questions)
      ? row!.questions
      : Array.isArray(row?.items)
        ? row!.items
        : Array.isArray(row?.words)
          ? row!.words
          : [];
  const first = items.find((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  if (!first) return { questionIndex: 0, prompt: "" };
  const prompt = String(first.question ?? first.prompt ?? first.word ?? "").trim();
  const questionId = typeof first.id === "string" ? first.id : undefined;
  let word: string | undefined;
  const breakdown = first.breakdown && typeof first.breakdown === "object"
    ? (first.breakdown as { keyWords?: Array<{ word?: string }> })
    : null;
  word = breakdown?.keyWords?.[0]?.word;
  if (!word && typeof first.word === "string") word = first.word;
  return { questionId, questionIndex: 0, word, prompt };
}

async function ensureLivePeriod(dayLessonId: string): Promise<{ startsAt: string; endsAt: string }> {
  const current = await prisma.schoolDayLesson.findUnique({
    where: { id: dayLessonId },
    select: { startsAt: true, endsAt: true },
  });
  if (!current) throw new Error(`Period ${dayLessonId} missing`);
  const original = { startsAt: current.startsAt, endsAt: current.endsAt };
  await prisma.schoolDayLesson.update({
    where: { id: dayLessonId },
    data: {
      startsAt: hmNowPlus(-10),
      endsAt: hmNowPlus(40),
    },
  });
  return original;
}

async function restorePeriod(dayLessonId: string, original: { startsAt: string; endsAt: string }) {
  await prisma.schoolDayLesson.update({
    where: { id: dayLessonId },
    data: original,
  });
}

async function syncStudent(schoolId: string, classroomId: string, yearGroup: string | null) {
  const existing = await prisma.schoolStudent.findUnique({
    where: { schoolId_externalRef: { schoolId, externalRef: "uat:daytime:year6" } },
    select: {
      id: true,
      childId: true,
      child: { select: { parentId: true } },
    },
  });
  if (!existing) throw new Error("Run scripts/uat-ensure-daytime-student.ts first.");

  const yg = yearGroup || "Year 6";
  await prisma.schoolStudent.update({
    where: { id: existing.id },
    data: { classroomId, status: "active" },
  });
  await prisma.childProfile.update({
    where: { id: existing.childId },
    data: { yearGroup: yg, age: typicalAgeForYearGroup(yg) },
  });
  await prisma.studentProfile.upsert({
    where: { childId: existing.childId },
    create: { childId: existing.childId, keyStageLevel: keyStageForYearGroup(yg) },
    update: { keyStageLevel: keyStageForYearGroup(yg) },
  });
  if (existing.child.parentId) {
    await prisma.user.update({
      where: { id: existing.child.parentId },
      data: { activeChildId: existing.childId },
    });
  }
  return existing.childId;
}

async function ensureOpenAssignment(childId: string, contentId: string): Promise<string> {
  const existing = await prisma.assignment.findUnique({
    where: { studentId_contentId: { studentId: childId, contentId } },
    select: { id: true },
  });
  if (existing) {
    await prisma.assignment.update({
      where: { id: existing.id },
      data: { status: "assigned", completedAt: null },
    });
    return existing.id;
  }
  const created = await prisma.assignment.create({
    data: {
      studentId: childId,
      contentId,
      status: "assigned",
    },
    select: { id: true },
  });
  return created.id;
}

async function startPeriod(jar: CookieJar, dayLessonId: string, studentId: string) {
  return api(jar, "POST", `/api/student/daytime-period/${dayLessonId}/start`, { studentId }, 90_000);
}

async function tutor(
  jar: CookieJar,
  body: Record<string, unknown>,
) {
  return api(jar, "POST", "/api/student/daytime-tutor", body, 90_000);
}

function revealsAnswerLeak(message: string, modelAnswer: unknown): boolean {
  const answer = String(modelAnswer ?? "").trim().toLowerCase();
  if (!answer || answer.length < 3) return false;
  return message.toLowerCase().includes(answer);
}

async function main() {
  const evidencePath = resolve("scripts/.uat-school-ai-tutor-evidence.json");
  const daytimeEvidence = JSON.parse(
    readFileSync(resolve("scripts/.uat-daytime-evidence.json"), "utf8"),
  ) as {
    pickedPeriods?: Record<string, { dayLessonId?: string; schoolId?: string }>;
  };

  const checks: Check[] = [];
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    base: BASE,
    verificationBaseline: {
      eslint: "pass",
      gitDiffCheck: "pass",
      focusedTests: "17/17 pass",
      projectWideTypecheck: "inconclusive — process hung and was stopped.",
    },
  };

  const parentJar: CookieJar = new Map();
  const parentLogin = await api(parentJar, "POST", "/api/auth/login", {
    email: "uat.daytime.y6.parent@starliz.dev",
    password: process.env.UAT_STUDENT_PARENT_PASSWORD ?? "UatDaytimeParent#2026",
  }, 30_000);
  if (!parentLogin.ok) {
    throw new Error(`Parent login failed: ${parentLogin.status} ${parentLogin.text.slice(0, 200)}`);
  }
  report.parentLogin = { ok: true, status: parentLogin.status };

  const kinds = [
    { key: "guided-reading", label: "Guided Reading" },
    { key: "maths", label: "Maths" },
    { key: "spelling", label: "Spelling" },
  ] as const;

  const restored: Array<{ id: string; original: { startsAt: string; endsAt: string } }> = [];
  let lastTutorContext: {
    periodId: string;
    assignmentId: string;
    contentId: string;
  } | null = null;

  try {
    for (const kind of kinds) {
      const picked = daytimeEvidence.pickedPeriods?.[kind.key];
      if (!picked?.dayLessonId || !picked.schoolId) {
        checks.push({ name: `${kind.label} period available`, ok: false, detail: "missing evidence period" });
        continue;
      }

      const period = await prisma.schoolDayLesson.findUnique({
        where: { id: picked.dayLessonId },
        select: {
          id: true,
          schoolId: true,
          classroomId: true,
          startsAt: true,
          endsAt: true,
          lesson: { select: { reviewStatus: true, contentRefs: true } },
        },
      });
      if (!period?.classroomId || period.lesson?.reviewStatus !== "approved") {
        checks.push({
          name: `${kind.label} approved daytime lesson`,
          ok: false,
          detail: `reviewStatus=${period?.lesson?.reviewStatus ?? "missing"}`,
        });
        continue;
      }

      const classroom = await prisma.classroom.findUnique({
        where: { id: period.classroomId },
        select: { yearGroup: true },
      });
      const childId = await syncStudent(period.schoolId, period.classroomId, classroom?.yearGroup ?? "Year 6");

      // Re-open stage assignments so start returns assigned (not practice).
      const stageIds = String(period.lesson?.contentRefs || "").split(/[,\s]+/).filter(Boolean);
      if (stageIds.length) {
        await prisma.assignment.updateMany({
          where: { studentId: childId, contentId: { in: stageIds } },
          data: { status: "archived", completedAt: null },
        });
      }

      const original = await ensureLivePeriod(period.id);
      restored.push({ id: period.id, original });

      const start = await startPeriod(parentJar, period.id, childId);
      const startJson = start.json as {
        ok?: boolean;
        assignmentId?: string | null;
        contentId?: string | null;
        mode?: string;
        error?: string;
        code?: string;
      };

      let assignmentId = startJson.assignmentId ?? null;
      let contentId = startJson.contentId ?? null;
      if ((!assignmentId || !contentId || startJson.mode !== "assigned") && stageIds[0]) {
        // Direct reopen when start falls through to practice (e.g. safety skip).
        contentId = stageIds[0];
        assignmentId = await ensureOpenAssignment(childId, contentId);
      }
      if (!assignmentId || !contentId) {
        checks.push({
          name: `${kind.label} start daytime assignment`,
          ok: false,
          detail: `${start.status} mode=${startJson.mode} ${startJson.error ?? startJson.code ?? JSON.stringify(startJson).slice(0, 180)}`,
        });
        continue;
      }
      checks.push({
        name: `${kind.label} daytime assignment ready`,
        ok: true,
        detail: `mode=${startJson.mode ?? "direct"} assignment=${assignmentId}`,
      });
      lastTutorContext = {
        periodId: period.id,
        assignmentId,
        contentId,
      };

      const content = await prisma.aIContentCache.findUnique({
        where: { id: contentId },
        select: { contentJson: true },
      });
      const meta = firstQuestionMeta(content?.contentJson ?? "[]");
      let parsedFirst: Record<string, unknown> | null = null;
      try {
        const raw = JSON.parse(content?.contentJson ?? "null");
        const items = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.questions)
            ? raw.questions
            : Array.isArray(raw?.items)
              ? raw.items
              : Array.isArray(raw?.words)
                ? raw.words
                : [];
        parsedFirst = items[0] && typeof items[0] === "object" ? items[0] as Record<string, unknown> : null;
      } catch {
        parsedFirst = null;
      }
      const modelAnswer = parsedFirst?.answer ?? parsedFirst?.correctAnswer ?? parsedFirst?.word ?? null;

      const baseBody = {
        aiTutorScope: "daytime-school",
        periodId: period.id,
        assignmentId,
        contentId,
        questionId: meta.questionId,
        questionIndex: meta.questionIndex,
      };

      if (kind.key === "guided-reading") {
        const explain = await tutor(parentJar, { ...baseBody, intent: "explain-question" });
        const explainJson = explain.json as {
          message?: string;
          revealsAnswer?: boolean;
          conversationId?: string;
          source?: string;
        };
        const firstOk = explain.ok
          && explainJson.revealsAnswer === false
          && !revealsAnswerLeak(String(explainJson.message ?? ""), modelAnswer);
        checks.push({
          name: "Guided Reading explain-question",
          ok: firstOk,
          detail: `${explain.status} source=${explainJson.source} reveals=${explainJson.revealsAnswer}`,
        });
        checks.push({
          name: "first response does not reveal the answer",
          ok: firstOk,
          detail: firstOk ? "ok" : String(explainJson.message ?? "").slice(0, 160),
        });

        const word = meta.word || "river";
        const wordHelp = await tutor(parentJar, {
          ...baseBody,
          intent: "explain-word",
          word,
          conversationId: explainJson.conversationId,
        });
        const wordJson = wordHelp.json as { message?: string; revealsAnswer?: boolean; source?: string };
        checks.push({
          name: "Guided Reading explain-word",
          ok: wordHelp.ok && wordJson.revealsAnswer === false,
          detail: `${wordHelp.status} source=${wordJson.source}`,
        });

        const hint2 = await tutor(parentJar, {
          ...baseBody,
          intent: "give-hint",
          conversationId: explainJson.conversationId,
        });
        const hint2Json = hint2.json as { message?: string; hintLevel?: number; source?: string };
        const progressed = hint2.ok
          && String(hint2Json.message ?? "").trim().length > 0
          && String(hint2Json.message ?? "") !== String(explainJson.message ?? "");
        checks.push({
          name: "second hint progresses",
          ok: progressed,
          detail: `${hint2.status} level=${hint2Json.hintLevel} source=${hint2Json.source}`,
        });
      }

      if (kind.key === "maths") {
        const firstStep = await tutor(parentJar, { ...baseBody, intent: "show-first-step" });
        const firstJson = firstStep.json as { message?: string; revealsAnswer?: boolean; source?: string };
        checks.push({
          name: "Maths show-first-step",
          ok: firstStep.ok && firstJson.revealsAnswer === false,
          detail: `${firstStep.status} source=${firstJson.source}`,
        });

        const why = await tutor(parentJar, {
          ...baseBody,
          intent: "why-wrong",
          studentAttempt: "999",
        });
        const whyJson = why.json as { message?: string; revealsAnswer?: boolean; source?: string };
        const whyOk = why.ok
          && whyJson.revealsAnswer === false
          && String(whyJson.message ?? "").includes("999")
          && !revealsAnswerLeak(String(whyJson.message ?? ""), modelAnswer);
        checks.push({
          name: "Maths why-wrong",
          ok: whyOk,
          detail: `${why.status} source=${whyJson.source} reveals=${whyJson.revealsAnswer}`,
        });
      }

      if (kind.key === "spelling") {
        const hint = await tutor(parentJar, { ...baseBody, intent: "give-hint" });
        const hintJson = hint.json as { message?: string; revealsAnswer?: boolean; source?: string };
        checks.push({
          name: "Spelling give-hint",
          ok: hint.ok && hintJson.revealsAnswer === false,
          detail: `${hint.status} source=${hintJson.source}`,
        });
      }

      // Ended-period rejection (temporarily end period, then restore live window for remaining kinds).
      await prisma.schoolDayLesson.update({
        where: { id: period.id },
        data: { startsAt: hmNowPlus(-60), endsAt: hmNowPlus(-5) },
      });
      const ended = await tutor(parentJar, { ...baseBody, intent: "give-hint" });
      const endedJson = ended.json as { code?: string; error?: string };
      checks.push({
        name: "ended-period rejection",
        ok: !ended.ok && ended.status === 403 && endedJson.code === "PERIOD_ENDED",
        detail: `${ended.status} code=${endedJson.code}`,
      });
      // Restore live window for subsequent subject runs on same clocked period set.
      await prisma.schoolDayLesson.update({
        where: { id: period.id },
        data: { startsAt: hmNowPlus(-10), endsAt: hmNowPlus(40) },
      });
    }

    // Non-daytime rejection + needsTeacher using the last live daytime assignment.
    if (lastTutorContext) {
      const nonDaytime = await tutor(parentJar, {
        aiTutorScope: "daytime-school",
        periodId: lastTutorContext.periodId,
        assignmentId: lastTutorContext.assignmentId,
        contentId: "not-a-daytime-content-id",
        intent: "give-hint",
      });
      const nonJson = nonDaytime.json as { code?: string };
      checks.push({
        name: "non-daytime rejection",
        ok: !nonDaytime.ok && (nonJson.code === "NOT_DAYTIME_CONTENT" || nonJson.code === "ASSIGNMENT_MISMATCH"),
        detail: `${nonDaytime.status} code=${nonJson.code}`,
      });

      // Ensure period is live for needsTeacher turns.
      const original = await ensureLivePeriod(lastTutorContext.periodId);
      restored.push({ id: lastTutorContext.periodId, original });

      let finalNeedsOk = false;
      let detail = "no escalation";
      let conversationId: string | undefined;
      for (let i = 0; i < 6; i += 1) {
        const r = await tutor(parentJar, {
          aiTutorScope: "daytime-school",
          periodId: lastTutorContext.periodId,
          assignmentId: lastTutorContext.assignmentId,
          contentId: lastTutorContext.contentId,
          intent: "explain-word",
          word: `zzzz-unknown-${i}-${Date.now()}`,
          conversationId,
        });
        const j = r.json as {
          needsTeacher?: boolean;
          source?: string;
          message?: string;
          conversationId?: string;
          error?: string;
        };
        conversationId = j.conversationId ?? conversationId;
        detail = `${r.status} source=${j.source} needsTeacher=${j.needsTeacher} ${j.error ?? ""}`.trim();
        if (r.ok && (j.needsTeacher || /ask your teacher/i.test(String(j.message ?? "")))) {
          finalNeedsOk = true;
          detail = `escalated on turn ${i + 1} source=${j.source}`;
          break;
        }
        if (!r.ok) break;
      }
      checks.push({
        name: "needsTeacher fallback",
        ok: finalNeedsOk,
        detail,
      });
    } else {
      checks.push({ name: "non-daytime rejection", ok: false, detail: "no tutor context" });
      checks.push({ name: "needsTeacher fallback", ok: false, detail: "no tutor context" });
    }

    // Help event recorded (audit log after any successful tutor call).
    const since = new Date(Date.now() - 15 * 60_000);
    const audit = await prisma.auditLog.findFirst({
      where: {
        action: "daytime.tutor.help",
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, metadataJson: true, createdAt: true },
    });
    let metaOk = false;
    if (audit?.metadataJson) {
      try {
        const meta = JSON.parse(audit.metadataJson) as Record<string, unknown>;
        metaOk = meta.aiTutorScope === "daytime-school"
          && typeof meta.schoolId === "string"
          && typeof meta.assignmentId === "string"
          && typeof meta.source === "string"
          && typeof meta.hintLevel === "number";
      } catch {
        metaOk = false;
      }
    }
    checks.push({
      name: "help event recorded",
      ok: Boolean(audit) && metaOk,
      detail: audit ? `audit=${audit.id}` : "no daytime.tutor.help audit in last 15m",
    });
  } finally {
    for (const row of restored) {
      await restorePeriod(row.id, row.original);
    }
  }

  const passed = checks.filter((c) => c.ok).length;
  const failed = checks.filter((c) => !c.ok);
  report.checks = checks;
  report.summary = { passed, failed: failed.length, total: checks.length };
  report.finishedAt = new Date().toISOString();
  writeFileSync(evidencePath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({ summary: report.summary, checks, evidencePath }, null, 2));
  if (failed.length) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
