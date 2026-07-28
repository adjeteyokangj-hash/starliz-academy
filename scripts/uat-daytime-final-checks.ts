/**
 * Final daytime UAT checks (Guided Reading + regression).
 * Appends results to scripts/.uat-daytime-evidence.json under finalUatChecks.
 *
 * Usage: npx tsx scripts/uat-daytime-final-checks.ts
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
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
import {
  buildStoredQuestionHelpSteps,
  extractHelpFromQuestionItem,
} from "../src/lib/schools/question-help";
import { ageGroupForYearGroup, keyStageForYearGroup } from "../src/lib/curriculum";

const BASE = process.env.UAT_BASE_URL ?? "http://localhost:3000";
const prisma = new PrismaClient();
type CookieJar = Map<string, string>;

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

async function api(jar: CookieJar, method: string, path: string, body?: unknown, timeoutMs = 120_000) {
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
    return { status: res.status, ok: res.ok, json };
  } finally {
    clearTimeout(timer);
  }
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
  return existing;
}

async function resetAssignments(childId: string, stageIds: string[]) {
  if (!stageIds.length) return;
  await prisma.assignment.updateMany({
    where: { studentId: childId, contentId: { in: stageIds } },
    data: { status: "archived", completedAt: null },
  });
}

function bodyOf(res: { json: unknown }) {
  return (res.json ?? {}) as Record<string, any>;
}

async function main() {
  const evidencePath = resolve("scripts/.uat-daytime-evidence.json");
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as Record<string, any>;
  const picked = evidence.pickedPeriods?.["guided-reading"];
  if (!picked?.dayLessonId || !picked?.schoolId) {
    throw new Error("No guided-reading period in evidence.pickedPeriods");
  }

  const adminJar: CookieJar = new Map();
  const adminLogin = await api(adminJar, "POST", "/api/auth/login", {
    email: process.env.UAT_ADMIN_EMAIL || "platform-admin@starliz.dev",
    password: process.env.UAT_ADMIN_PASSWORD || "PlatformAdmin#2026",
  }, 30_000);
  if (!adminLogin.ok) throw new Error("Admin login failed");

  const period = await prisma.schoolDayLesson.findUnique({
    where: { id: picked.dayLessonId },
    select: {
      id: true,
      schoolId: true,
      classroomId: true,
      title: true,
      subject: true,
      startsAt: true,
      endsAt: true,
      lesson: { select: { id: true, reviewStatus: true, contentRefs: true } },
    },
  });
  if (!period?.classroomId || !period.lesson) throw new Error("Guided Reading period missing classroom/lesson");

  // Keep period "live" for UAT regardless of wall-clock (continue returns period_complete after endsAt).
  const originalTimes = { startsAt: period.startsAt, endsAt: period.endsAt };
  await prisma.schoolDayLesson.update({
    where: { id: period.id },
    data: { startsAt: "00:05", endsAt: "23:55" },
  });

  try {
    let reviewStatus = period.lesson.reviewStatus;
    let approveResult: unknown = null;
    if (reviewStatus !== "approved") {
      const approve = await api(adminJar, "POST", "/api/admin/schools", {
        action: "approveDaytimeLesson",
        payload: { schoolId: period.schoolId, dayLessonId: period.id },
      });
      approveResult = { status: approve.status, ok: approve.ok, body: approve.json };
      const refreshed = await prisma.schoolDayLesson.findUnique({
        where: { id: period.id },
        select: { lesson: { select: { reviewStatus: true, contentRefs: true } } },
      });
      reviewStatus = refreshed?.lesson?.reviewStatus ?? reviewStatus;
      if (reviewStatus !== "approved") {
        throw new Error(`Guided Reading not approvable (status=${reviewStatus}): ${JSON.stringify(approveResult)}`);
      }
    }

    const stageIds = String(period.lesson.contentRefs || "")
      .split(/[,\s]+/)
      .filter(Boolean);
    const classroom = await prisma.classroom.findUnique({
      where: { id: period.classroomId },
      select: { yearGroup: true, name: true },
    });
    const student = await syncStudent(period.schoolId, period.classroomId, classroom?.yearGroup ?? "Year 6");
    const childId = student.childId;

    const parentJar: CookieJar = new Map();
    const parentLogin = await api(parentJar, "POST", "/api/auth/login", {
      email: "uat.daytime.y6.parent@starliz.dev",
      password: process.env.UAT_STUDENT_PARENT_PASSWORD ?? "UatDaytimeParent#2026",
    }, 30_000);
    if (!parentLogin.ok) throw new Error("Parent login failed");
    if (student.child.parentId) {
      await prisma.user.update({
        where: { id: student.child.parentId },
        data: { activeChildId: childId },
      });
    }
    const startBody = { studentId: childId };
    const dayLessonId = period.id;

    // --- Pass A: fresh Stage 1 → 2 → 3 + help ---
    await resetAssignments(childId, stageIds);

    const start1 = await api(parentJar, "POST", `/api/student/daytime-period/${dayLessonId}/start`, startBody);
    const b1 = bodyOf(start1);
    const contentId1 = b1.contentId ?? null;
    const assignmentId1 = b1.assignmentId ?? null;

    const start1b = await api(parentJar, "POST", `/api/student/daytime-period/${dayLessonId}/start`, startBody);
    const b1b = bodyOf(start1b);

    const cont2 = await api(parentJar, "POST", `/api/student/daytime-period/${dayLessonId}/continue`, {
      ...startBody,
      completedContentId: contentId1,
    });
    const b2 = bodyOf(cont2);
    const contentId2 = b2.contentId ?? null;

    // Reopen after completing warm-up: start should resume Core, not Warm-up.
    const reopenAfterWarmup = await api(parentJar, "POST", `/api/student/daytime-period/${dayLessonId}/start`, startBody);
    const reopenBody = bodyOf(reopenAfterWarmup);

    const cont3 = await api(parentJar, "POST", `/api/student/daytime-period/${dayLessonId}/continue`, {
      ...startBody,
      completedContentId: contentId2,
    });
    const b3 = bodyOf(cont3);
    const contentId3 = b3.contentId ?? null;

    // Complete stretch, then verify practice / period_complete fallback (no stage replay).
    const afterAll = await api(parentJar, "POST", `/api/student/daytime-period/${dayLessonId}/continue`, {
      ...startBody,
      completedContentId: contentId3,
    });
    const afterAllBody = bodyOf(afterAll);

    const startAfterComplete = await api(parentJar, "POST", `/api/student/daytime-period/${dayLessonId}/start`, startBody);
    const startAfterBody = bodyOf(startAfterComplete);

    // Help on core stage (comprehension), not just warm-up.
    const helpContentId = contentId2 || contentId1;
    let iDontUnderstand: Record<string, unknown> | null = null;
    let iDontUnderstandLiveCoach: Record<string, unknown> | null = null;
    if (helpContentId) {
      const pack = await prisma.aIContentCache.findUnique({
        where: { id: helpContentId },
        select: { contentJson: true, topic: true },
      });
      if (pack) {
        const parsed = JSON.parse(pack.contentJson) as { questions?: any[]; items?: any[] };
        const questions = Array.isArray(parsed.questions)
          ? parsed.questions
          : Array.isArray(parsed.items)
            ? parsed.items
            : [];
        const q = questions.find((row) => String(row?.prompt ?? row?.question ?? "").trim()) ?? questions[0];
        if (q && typeof q === "object") {
          const answer = String(q.answer ?? q.correctAnswer ?? "");
          const help = buildStoredQuestionHelpSteps(extractHelpFromQuestionItem(q));
          iDontUnderstand = {
            contentId: helpContentId,
            topic: pack.topic,
            questionPreview: String(q.prompt ?? q.question ?? "").slice(0, 200),
            steps: help.map((s) => ({
              title: s.title,
              revealsAnswer: s.revealsAnswer,
              bodyPreview: s.body.slice(0, 240),
            })),
            firstRevealsAnswer: help[0]?.revealsAnswer ?? null,
            answerLeakedInFirstStep: Boolean(answer) && Boolean(help[0]?.body?.includes(answer)),
            simplifies: /simpler|clearer|key words|start here|break it into steps/i.test(
              help.map((s) => s.body).join("\n"),
            ),
          };
          const coach1 = await api(parentJar, "POST", "/api/coach", {
            studentId: childId,
            subject: "reading",
            intent: "i_dont_understand",
            question: String(q.prompt ?? q.question ?? ""),
            answer,
            yearGroup: Number(String(classroom?.yearGroup || "6").replace(/\D/g, "")) || 6,
            hintCount: 0,
          });
          const coach2 = await api(parentJar, "POST", "/api/coach", {
            studentId: childId,
            subject: "reading",
            intent: "i_dont_understand",
            question: String(q.prompt ?? q.question ?? ""),
            answer,
            yearGroup: Number(String(classroom?.yearGroup || "6").replace(/\D/g, "")) || 6,
            hintCount: 1,
          });
          const text1 = String((coach1.json as any)?.message ?? (coach1.json as any)?.reply ?? JSON.stringify(coach1.json)).slice(0, 400);
          const text2 = String((coach2.json as any)?.message ?? (coach2.json as any)?.reply ?? JSON.stringify(coach2.json)).slice(0, 400);
          iDontUnderstandLiveCoach = {
            first: { status: coach1.status, ok: coach1.ok, preview: text1 },
            second: { status: coach2.status, ok: coach2.ok, preview: text2 },
            progressed: text1.length > 0 && text2.length > 0 && text1 !== text2,
            firstRevealsAnswer: Boolean(answer) && text1.includes(answer),
          };
        }
      }
    }

    const assignmentCount = await prisma.assignment.count({
      where: {
        studentId: childId,
        contentId: { in: stageIds },
        status: { not: "archived" },
      },
    });

    const verdict = {
      guidedReadingApproved: reviewStatus === "approved",
      stage1to3: {
        labels: {
          stage1: b1.sessionPlan?.progressLabel ?? null,
          stage2: b2.sessionPlan?.progressLabel ?? null,
          stage3: b3.sessionPlan?.progressLabel ?? null,
        },
        contentIds: { stage1: contentId1, stage2: contentId2, stage3: contentId3 },
        distinctStages:
          Boolean(contentId1 && contentId2 && contentId3)
          && contentId1 !== contentId2
          && contentId2 !== contentId3,
        modesAssigned: [b1.mode, b2.mode, b3.mode],
        pass:
          b1.ok
          && b2.ok
          && b3.ok
          && b1.sessionPlan?.progressLabel === "Stage 1 of 3"
          && b2.sessionPlan?.progressLabel === "Stage 2 of 3"
          && b3.sessionPlan?.progressLabel === "Stage 3 of 3"
          && contentId1 !== contentId2
          && contentId2 !== contentId3,
      },
      noDuplicateAssignment: {
        sameAssignmentOnRepeatStart: b1b.assignmentId === assignmentId1,
        sameContentOnRepeatStart: b1b.contentId === contentId1,
        nonArchivedAssignmentRows: assignmentCount,
        pass: b1b.ok && b1b.assignmentId === assignmentId1 && b1b.contentId === contentId1,
      },
      reopenResumesCorrectStage: {
        afterWarmupCompleted: {
          mode: reopenBody.mode,
          contentId: reopenBody.contentId,
          progressLabel: reopenBody.sessionPlan?.progressLabel ?? null,
          expectedContentId: contentId2,
        },
        pass: reopenBody.ok && reopenBody.contentId === contentId2 && reopenBody.contentId !== contentId1,
      },
      completedStagesNotReplayed: {
        startAfterAllComplete: {
          mode: startAfterBody.mode,
          contentId: startAfterBody.contentId,
          progressLabel: startAfterBody.sessionPlan?.progressLabel ?? null,
        },
        continueAfterStretch: {
          mode: afterAllBody.mode,
          contentId: afterAllBody.contentId,
        },
        pass:
          startAfterBody.ok
          && startAfterBody.contentId !== contentId1
          && startAfterBody.contentId !== contentId2
          && startAfterBody.contentId !== contentId3
          && (startAfterBody.mode === "practice" || startAfterBody.mode === "period_complete"),
      },
      practiceFallbackAfterAllStages: {
        mode: startAfterBody.mode,
        href: startAfterBody.href ?? null,
        pass:
          startAfterBody.ok
          && (startAfterBody.mode === "practice" || startAfterBody.mode === "period_complete")
          && !stageIds.includes(String(startAfterBody.contentId ?? "")),
      },
      iDontUnderstand: {
        scaffolding: iDontUnderstand,
        liveCoach: iDontUnderstandLiveCoach,
        pass:
          Boolean(iDontUnderstand)
          && iDontUnderstand?.firstRevealsAnswer === false
          && iDontUnderstand?.answerLeakedInFirstStep === false
          && Boolean(iDontUnderstandLiveCoach)
          && (iDontUnderstandLiveCoach as any)?.firstRevealsAnswer === false
          && (iDontUnderstandLiveCoach as any)?.progressed === true,
      },
    };

    const allPass = Object.entries(verdict)
      .filter(([k]) => k !== "guidedReadingApproved")
      .every(([, v]) => typeof v === "object" && v && "pass" in v && (v as { pass: boolean }).pass)
      && verdict.guidedReadingApproved;

    const report = {
      completedAt: new Date().toISOString(),
      subject: "guided-reading",
      dayLessonId,
      title: period.title,
      classroom: classroom?.name ?? null,
      yearGroup: classroom?.yearGroup ?? null,
      childId,
      approveResult,
      reviewStatus,
      stageIds,
      periodTimes: { original: originalTimes, uatOverride: { startsAt: "00:05", endsAt: "23:55" } },
      allPass,
      verdict,
      raw: {
        stage1: { status: start1.status, body: b1 },
        stage1Repeat: { status: start1b.status, body: b1b },
        stage2: { status: cont2.status, body: b2 },
        reopenAfterWarmup: { status: reopenAfterWarmup.status, body: reopenBody },
        stage3: { status: cont3.status, body: b3 },
        afterAllStagesContinue: { status: afterAll.status, body: afterAllBody },
        startAfterComplete: { status: startAfterComplete.status, body: startAfterBody },
      },
    };

    evidence.finalUatChecks = report;
    writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({
      allPass: report.allPass,
      reviewStatus: report.reviewStatus,
      verdict: report.verdict,
    }, null, 2));
  } finally {
    await prisma.schoolDayLesson.update({
      where: { id: period.id },
      data: originalTimes,
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
