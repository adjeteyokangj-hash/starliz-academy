/**
 * Complete stage progression + help on an already-approved daytime lesson.
 * Does not regenerate. Updates scripts/.uat-daytime-evidence.json studentFlow section.
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
  const parts = String(range).split(/[\u2012\u2013\u2014\u2015-]/).map((p) => Number(p.trim())).filter((n) => Number.isFinite(n));
  if (parts.length >= 2) return Math.round((parts[0] + parts[1]) / 2);
  if (parts.length === 1) return parts[0];
  const yearNum = Number(String(yearGroup ?? "").replace(/\D/g, ""));
  return Number.isFinite(yearNum) ? yearNum + 5 : 10;
}

async function syncUatStudentToClassroom(input: {
  schoolId: string;
  classroomId: string;
  yearGroup: string | null;
}) {
  const existing = await prisma.schoolStudent.findUnique({
    where: { schoolId_externalRef: { schoolId: input.schoolId, externalRef: "uat:daytime:year6" } },
    select: {
      id: true,
      childId: true,
      classroomId: true,
      child: { select: { id: true, parentId: true, yearGroup: true, age: true } },
    },
  });
  if (!existing) throw new Error("Run scripts/uat-ensure-daytime-student.ts first.");

  const yearGroup = input.yearGroup || "Year 6";
  const keyStage = keyStageForYearGroup(yearGroup);
  const age = typicalAgeForYearGroup(yearGroup);

  await prisma.schoolStudent.update({
    where: { id: existing.id },
    data: { classroomId: input.classroomId, status: "active" },
  });
  await prisma.childProfile.update({
    where: { id: existing.childId },
    data: { yearGroup, age },
  });
  await prisma.studentProfile.upsert({
    where: { childId: existing.childId },
    create: {
      childId: existing.childId,
      keyStageLevel: keyStage,
    },
    update: {
      keyStageLevel: keyStage,
    },
  });

  return existing;
}

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
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 500) }; }
    return { status: res.status, ok: res.ok, json };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const evidencePath = resolve("scripts/.uat-daytime-evidence.json");
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as Record<string, any>;

  const jar: CookieJar = new Map();
  const login = await api(jar, "POST", "/api/auth/login", {
    email: process.env.UAT_ADMIN_EMAIL || "platform-admin@starliz.dev",
    password: process.env.UAT_ADMIN_PASSWORD || "PlatformAdmin#2026",
  }, 30_000);
  if (!login.ok) throw new Error("Admin login failed");

  // Prefer approved maths / spelling / pe.
  const candidates = ["maths", "spelling", "pe"] as const;
  let playKind: string | null = null;
  let dayLessonId: string | null = null;
  let schoolId: string | null = null;
  let classroomId: string | null = null;

  for (const kind of candidates) {
    const picked = evidence.pickedPeriods?.[kind];
    if (!picked?.dayLessonId) continue;
    const lesson = await prisma.schoolDayLesson.findUnique({
      where: { id: picked.dayLessonId },
      select: {
        id: true,
        schoolId: true,
        classroomId: true,
        lesson: { select: { reviewStatus: true } },
      },
    });
    if (lesson?.lesson?.reviewStatus === "approved") {
      playKind = kind;
      dayLessonId = lesson.id;
      schoolId = lesson.schoolId;
      classroomId = lesson.classroomId;
      break;
    }
  }
  if (!dayLessonId || !classroomId || !schoolId || !playKind) {
    throw new Error("No approved playable daytime lesson found.");
  }

  // Ensure UAT student is in this classroom with matching year/key stage/age.
  const classroom = await prisma.classroom.findUnique({
    where: { id: classroomId },
    select: { id: true, yearGroup: true, name: true },
  });
  if (!classroom) throw new Error(`Classroom ${classroomId} missing`);

  const existing = await syncUatStudentToClassroom({
    schoolId,
    classroomId,
    yearGroup: classroom.yearGroup,
  });
  const childId = existing.childId;

  // Clear prior daytime stage completions for this period so Stage 1→2→3 is measurable.
  const lesson = await prisma.schoolDayLesson.findUnique({
    where: { id: dayLessonId },
    select: { lesson: { select: { contentRefs: true } } },
  });
  const stageIds = String(lesson?.lesson?.contentRefs || "").split(/[,\s]+/).filter(Boolean);
  if (stageIds.length) {
    await prisma.assignment.updateMany({
      where: { studentId: childId, contentId: { in: stageIds } },
      data: { status: "archived", completedAt: null },
    });
  }

  // Prefer normal parent login for the UAT student; fall back to admin preview.
  const parentJar: CookieJar = new Map();
  const parentPassword = process.env.UAT_STUDENT_PARENT_PASSWORD ?? "UatDaytimeParent#2026";
  const parentLogin = await api(parentJar, "POST", "/api/auth/login", {
    email: "uat.daytime.y6.parent@starliz.dev",
    password: parentPassword,
  }, 30_000);
  let playJar = jar;
  let playAs: "parent" | "admin_preview" = "admin_preview";
  let startBody: Record<string, string> = { studentId: childId };
  if (parentLogin.ok) {
    // Bind active child on the parent user for the normal student session path.
    if (existing.child.parentId) {
      await prisma.user.update({
        where: { id: existing.child.parentId },
        data: { activeChildId: childId },
      });
    }
    playJar = parentJar;
    playAs = "parent";
    startBody = { studentId: childId };
  }

  const studentFlow: Record<string, unknown> = {
    playKind,
    dayLessonId,
    classroomId,
    classroomYearGroup: classroom.yearGroup,
    enrolmentFound: true,
    childId,
    method: playAs === "parent"
      ? "parent login + POST start/continue"
      : "admin session + POST start/continue with studentId",
    parentLoginOk: parentLogin.ok,
  };

  const start1 = await api(playJar, "POST", `/api/student/daytime-period/${dayLessonId}/start`, startBody);
  studentFlow.stage1 = { status: start1.status, ok: start1.ok, body: start1.json };
  const contentId1 = (start1.json as any)?.contentId ?? null;
  const assignmentId1 = (start1.json as any)?.assignmentId ?? null;

  const start1b = await api(playJar, "POST", `/api/student/daytime-period/${dayLessonId}/start`, startBody);
  studentFlow.stage1_repeat_no_duplicate = {
    status: start1b.status,
    ok: start1b.ok,
    sameAssignmentAsFirst: ((start1b.json as any)?.assignmentId ?? null) === assignmentId1,
    sameContentAsFirst: ((start1b.json as any)?.contentId ?? null) === contentId1,
  };

  const cont2 = await api(playJar, "POST", `/api/student/daytime-period/${dayLessonId}/continue`, {
    ...startBody,
    completedContentId: contentId1,
  });
  studentFlow.stage2 = { status: cont2.status, ok: cont2.ok, body: cont2.json };
  const contentId2 = (cont2.json as any)?.contentId ?? null;

  const cont3 = await api(playJar, "POST", `/api/student/daytime-period/${dayLessonId}/continue`, {
    ...startBody,
    completedContentId: contentId2,
  });
  studentFlow.stage3 = { status: cont3.status, ok: cont3.ok, body: cont3.json };
  const contentId3 = (cont3.json as any)?.contentId ?? null;

  studentFlow.stageProgression = {
    playKind,
    stage1ContentId: contentId1,
    stage2ContentId: contentId2,
    stage3ContentId: contentId3,
    stage2DifferentFrom1: contentId2 && contentId1 ? contentId2 !== contentId1 : null,
    stage3DifferentFrom2: contentId3 && contentId2 ? contentId3 !== contentId2 : null,
    progressLabels: {
      stage1: (start1.json as any)?.sessionPlan?.progressLabel ?? null,
      stage2: (cont2.json as any)?.sessionPlan?.progressLabel ?? null,
      stage3: (cont3.json as any)?.sessionPlan?.progressLabel ?? null,
    },
  };

  if (contentId1) {
    const pack = await prisma.aIContentCache.findUnique({
      where: { id: contentId1 },
      select: { contentJson: true },
    });
    if (pack) {
      const parsed = JSON.parse(pack.contentJson) as { questions?: any[]; items?: any[] };
      const questions = Array.isArray(parsed.questions) ? parsed.questions : Array.isArray(parsed.items) ? parsed.items : [];
      const q = questions[0];
      if (q && typeof q === "object") {
        const help = buildStoredQuestionHelpSteps(extractHelpFromQuestionItem(q));
        studentFlow.iDontUnderstand = {
          source: "live stage-1 QuestionHelp scaffolding",
          questionPreview: String(q.prompt ?? q.question ?? "").slice(0, 160),
          steps: help.map((s) => ({
            title: s.title,
            revealsAnswer: s.revealsAnswer,
            bodyPreview: s.body.slice(0, 220),
          })),
          firstRevealsAnswer: help[0]?.revealsAnswer ?? null,
          answerLeakedInFirstStep: help[0]?.body?.includes(String(q.answer ?? q.correctAnswer ?? "")) ?? null,
        };
        const coachSubject = playKind === "maths" ? "maths" : playKind === "spelling" ? "spelling" : "reading";
        const coach1 = await api(playJar, "POST", "/api/coach", {
          studentId: childId,
          subject: coachSubject,
          intent: "i_dont_understand",
          question: String(q.prompt ?? q.question ?? ""),
          answer: String(q.answer ?? q.correctAnswer ?? ""),
          yearGroup: Number(String(classroom.yearGroup || "6").replace(/\D/g, "")) || 6,
          hintCount: 0,
        });
        const coach2 = await api(playJar, "POST", "/api/coach", {
          studentId: childId,
          subject: coachSubject,
          intent: "i_dont_understand",
          question: String(q.prompt ?? q.question ?? ""),
          answer: String(q.answer ?? q.correctAnswer ?? ""),
          yearGroup: Number(String(classroom.yearGroup || "6").replace(/\D/g, "")) || 6,
          hintCount: 1,
        });
        const text1 = String((coach1.json as any)?.message ?? (coach1.json as any)?.reply ?? JSON.stringify(coach1.json)).slice(0, 400);
        const text2 = String((coach2.json as any)?.message ?? (coach2.json as any)?.reply ?? JSON.stringify(coach2.json)).slice(0, 400);
        studentFlow.iDontUnderstandLiveCoach = {
          first: { status: coach1.status, ok: coach1.ok, preview: text1 },
          second: { status: coach2.status, ok: coach2.ok, preview: text2 },
          progressed: text1.length > 0 && text2.length > 0 && text1 !== text2,
          firstRevealsAnswer: text1.includes(String(q.answer ?? q.correctAnswer ?? "")),
        };
      }
    }
  }

  evidence.studentFlow = studentFlow;
  evidence.studentFlowCompletedAt = new Date().toISOString();
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(studentFlow, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
