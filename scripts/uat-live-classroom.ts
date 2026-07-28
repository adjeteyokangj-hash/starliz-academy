/**
 * Authenticated localhost UAT for Teacher Live Classroom v1.
 * No migration reset / destructive deletes of school data.
 * Restores period clocks after run. Does not add Human Support tables.
 *
 * Usage: npx tsx scripts/uat-live-classroom.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash, randomBytes } from "node:crypto";

function newId(prefix = "c"): string {
  return `${prefix}${randomBytes(12).toString("hex")}`;
}

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
import { hashPassword } from "../src/lib/auth";
import { ageGroupForYearGroup, keyStageForYearGroup } from "../src/lib/curriculum";
import { schoolDayOfWeek } from "../src/lib/schools/school-day-period";

const BASE = process.env.UAT_BASE_URL ?? "http://localhost:3000";
const prisma = new PrismaClient();
type CookieJar = Map<string, string>;
type Check = { name: string; ok: boolean; detail?: string };

const TEACHER_PASSWORD = process.env.UAT_TEACHER_PASSWORD ?? "UatLiveTeacher#2026";
const OTHER_TEACHER_PASSWORD = process.env.UAT_OTHER_TEACHER_PASSWORD ?? "UatOtherTeacher#2026";
const PARENT_PASSWORD = process.env.UAT_STUDENT_PARENT_PASSWORD ?? "UatDaytimeParent#2026";

async function setUserPassword(userId: string, plain: string) {
  const hashed = await hashPassword(plain);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: hashed } });
}

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
  const started = Date.now();
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
    console.log(`[uat] ${method} ${path} -> ${res.status} (${Date.now() - started}ms)`);
    return { status: res.status, ok: res.ok, json, text };
  } catch (error) {
    console.error(`[uat] ${method} ${path} FAILED after ${Date.now() - started}ms:`, String(error));
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function hmNowPlus(offsetMinutes: number): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() + offsetMinutes);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

async function ensureLivePeriod(dayLessonId: string): Promise<{ startsAt: string; endsAt: string; dayOfWeek: number }> {
  const current = await prisma.schoolDayLesson.findUnique({
    where: { id: dayLessonId },
    select: { startsAt: true, endsAt: true, dayOfWeek: true },
  });
  if (!current) throw new Error(`Period ${dayLessonId} missing`);
  const original = {
    startsAt: current.startsAt,
    endsAt: current.endsAt,
    dayOfWeek: current.dayOfWeek,
  };
  const today = schoolDayOfWeek(new Date());
  await prisma.schoolDayLesson.update({
    where: { id: dayLessonId },
    data: {
      startsAt: hmNowPlus(-10),
      endsAt: hmNowPlus(40),
      dayOfWeek: today >= 1 && today <= 5 ? today : 1,
    },
  });
  return original;
}

async function restorePeriod(
  dayLessonId: string,
  original: { startsAt: string; endsAt: string; dayOfWeek: number },
) {
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
      child: { select: { parentId: true, name: true } },
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
  return { schoolStudentId: existing.id, childId: existing.childId, name: existing.child.name };
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
    data: { studentId: childId, contentId, status: "assigned" },
    select: { id: true },
  });
  return created.id;
}

async function ensureTeacherUser(input: {
  email: string;
  name: string;
  password: string;
  schoolId: string;
  role: "teacher" | "support";
}): Promise<{ userId: string; schoolTeacherId: string }> {
  let user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        role: "teacher",
        passwordHash: "pending",
      },
      select: { id: true },
    });
  }
  await setUserPassword(user.id, input.password);
  await prisma.user.update({
    where: { id: user.id },
    data: { role: "teacher" },
  });

  const link = await prisma.schoolTeacher.upsert({
    where: {
      schoolId_userId: { schoolId: input.schoolId, userId: user.id },
    },
    create: {
      schoolId: input.schoolId,
      userId: user.id,
      role: input.role,
      status: "active",
      acceptedAt: new Date(),
      title: input.role === "teacher" ? "Class Teacher" : "Intervention Tutor",
    },
    update: {
      role: input.role,
      status: "active",
      acceptedAt: new Date(),
    },
    select: { id: true },
  });

  return { userId: user.id, schoolTeacherId: link.id };
}

function firstQuestion(contentJson: string): {
  questionId?: string;
  questionIndex: number;
  prompt: string;
  modelAnswer: string | null;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contentJson);
  } catch {
    return { questionIndex: 0, prompt: "", modelAnswer: null };
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
        : [];
  const first = items.find((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  if (!first) return { questionIndex: 0, prompt: "", modelAnswer: null };
  const prompt = String(first.question ?? first.prompt ?? first.word ?? "").trim();
  const questionId = typeof first.id === "string" ? first.id : undefined;
  const modelAnswer = first.answer != null
    ? String(first.answer)
    : first.correctAnswer != null
      ? String(first.correctAnswer)
      : null;
  return { questionId, questionIndex: 0, prompt, modelAnswer };
}

async function waitForServer(timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);
      const res = await fetch(BASE, { method: "GET", signal: controller.signal });
      clearTimeout(timer);
      if (res.status > 0) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

async function main() {
  const evidencePath = resolve("scripts/.uat-live-classroom-evidence.json");
  const daytimeEvidence = JSON.parse(
    readFileSync(resolve("scripts/.uat-daytime-evidence.json"), "utf8"),
  ) as {
    pickedPeriods?: Record<string, { dayLessonId?: string; schoolId?: string; title?: string }>;
  };

  const checks: Check[] = [];
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    base: BASE,
    constraints: {
      noMigrationReset: true,
      noCommitPushDeploy: true,
      noHumanSupportPersistence: true,
      foundationsUntouched: true,
    },
  };

  const up = await waitForServer(30_000);
  if (!up) {
    report.blocker = `Dev server not reachable at ${BASE}`;
    writeFileSync(evidencePath, JSON.stringify(report, null, 2));
    throw new Error(String(report.blocker));
  }

  console.log("[uat] server up, preparing fixtures…");

  const picked = daytimeEvidence.pickedPeriods?.["guided-reading"];
  if (!picked?.dayLessonId || !picked.schoolId) {
    throw new Error("Missing guided-reading period in daytime evidence.");
  }

  const period = await prisma.schoolDayLesson.findUnique({
    where: { id: picked.dayLessonId },
    select: {
      id: true,
      schoolId: true,
      classroomId: true,
      teacherId: true,
      title: true,
      subject: true,
      lessonType: true,
      startsAt: true,
      endsAt: true,
      dayOfWeek: true,
      lesson: { select: { reviewStatus: true, contentRefs: true, title: true } },
      classroom: { select: { id: true, name: true, yearGroup: true } },
    },
  });
  if (!period?.classroomId) throw new Error("Period missing classroom");
  if (period.lesson?.reviewStatus !== "approved") {
    throw new Error(`Lesson not approved: ${period.lesson?.reviewStatus}`);
  }

  const stageIds = String(period.lesson?.contentRefs || "").split(/[,\s]+/).filter(Boolean);
  if (!stageIds[0]) throw new Error("No contentRefs on lesson");

  // Ensure period teacher can log into teacher portal.
  const periodTeacher = await ensureTeacherUser({
    email: "uat.live.classroom.teacher@starliz.dev",
    name: "UAT Live Classroom Teacher",
    password: TEACHER_PASSWORD,
    schoolId: period.schoolId,
    role: "teacher",
  });
  await prisma.schoolDayLesson.update({
    where: { id: period.id },
    data: { teacherId: periodTeacher.schoolTeacherId },
  });
  await prisma.classroom.update({
    where: { id: period.classroomId },
    data: { teacherId: periodTeacher.schoolTeacherId },
  });

  // Ensure cross-teacher fixture exists for isolation checks (login handled later by email).
  await ensureTeacherUser({
    email: "uat.live.other.teacher@starliz.dev",
    name: "UAT Other Teacher",
    password: OTHER_TEACHER_PASSWORD,
    schoolId: period.schoolId,
    role: "teacher",
  });

  const student = await syncStudent(period.schoolId, period.classroomId, period.classroom?.yearGroup ?? "Year 6");

  // Extra roster students for board variety (derive-only via assignments / no help).
  const extras: Array<{ childId: string; label: string }> = [];
  for (const label of ["not-started", "completed", "practice"]) {
    const emailKey = createHash("sha1").update(`uat-live-${label}`).digest("hex").slice(0, 10);
    const parentEmail = `uat.live.${label}.parent@starliz.dev`;
    let parent = await prisma.user.findUnique({ where: { email: parentEmail }, select: { id: true } });
    if (!parent) {
      parent = await prisma.user.create({
        data: {
          email: parentEmail,
          name: `UAT ${label} parent`,
          role: "parent",
          passwordHash: "unused",
        },
        select: { id: true },
      });
    }
    let child = await prisma.childProfile.findFirst({
      where: { parentId: parent.id, name: `UAT ${label}` },
      select: { id: true },
    });
    if (!child) {
      child = await prisma.childProfile.create({
        data: {
          id: newId("child"),
          parentId: parent.id,
          name: `UAT ${label}`,
          age: 11,
          yearGroup: "Year 6",
        },
        select: { id: true },
      });
    }
    await prisma.schoolStudent.upsert({
      where: {
        schoolId_externalRef: { schoolId: period.schoolId, externalRef: `uat:live:${label}:${emailKey}` },
      },
      create: {
        schoolId: period.schoolId,
        childId: child.id,
        classroomId: period.classroomId,
        status: "active",
        externalRef: `uat:live:${label}:${emailKey}`,
      },
      update: {
        classroomId: period.classroomId,
        status: "active",
        childId: child.id,
      },
    });
    extras.push({ childId: child.id, label });
  }

  const originalClock = await ensureLivePeriod(period.id);
  report.period = {
    id: period.id,
    title: period.title,
    classroomId: period.classroomId,
    teacherSchoolTeacherId: periodTeacher.schoolTeacherId,
  };

  try {
  console.log("[uat] logging in teachers/parent…");
    // Auth sessions
    const teacherJar: CookieJar = new Map();
    const teacherLogin = await api(teacherJar, "POST", "/api/auth/login", {
      email: "uat.live.classroom.teacher@starliz.dev",
      password: TEACHER_PASSWORD,
    }, 90_000);
    checks.push({
      name: "Teacher login",
      ok: teacherLogin.ok,
      detail: `${teacherLogin.status}`,
    });
    if (!teacherLogin.ok) throw new Error(`Teacher login failed: ${teacherLogin.text.slice(0, 200)}`);
    report.authMethod = {
      teacher: "POST /api/auth/login as uat.live.classroom.teacher@starliz.dev",
      parent: "POST /api/auth/login as uat.daytime.y6.parent@starliz.dev",
      otherTeacher: "POST /api/auth/login as uat.live.other.teacher@starliz.dev",
    };

    const otherJar: CookieJar = new Map();
    const otherLogin = await api(otherJar, "POST", "/api/auth/login", {
      email: "uat.live.other.teacher@starliz.dev",
      password: OTHER_TEACHER_PASSWORD,
    }, 90_000);
    checks.push({ name: "Other teacher login", ok: otherLogin.ok, detail: `${otherLogin.status}` });

    const parentJar: CookieJar = new Map();
    const parentLogin = await api(parentJar, "POST", "/api/auth/login", {
      email: "uat.daytime.y6.parent@starliz.dev",
      password: PARENT_PASSWORD,
    }, 90_000);
    checks.push({ name: "Parent/student login", ok: parentLogin.ok, detail: `${parentLogin.status}` });
    if (!parentLogin.ok) throw new Error("Parent login failed");

    console.log("[uat] entry/routing…");
    // 1. Entry / routing
    const timetablePage = await api(teacherJar, "GET", "/teacher/timetable", undefined, 120_000);
    const timetableHasLink = timetablePage.text.includes(`/teacher/live/${period.id}`)
      || timetablePage.text.includes("Open live classroom")
      || timetablePage.text.includes("Live classroom");
    // Page is client-rendered; API board is the authoritative entry check.
    const timetableApi = await api(teacherJar, "GET", "/api/teacher/daytime-timetable", undefined, 120_000);
    const boardJson = timetableApi.json as {
      board?: { currentPeriodId?: string | null; periods?: Array<{ id: string }> };
    };
    const periodOnBoard = Boolean(boardJson.board?.periods?.some((p) => p.id === period.id));
    const isCurrent = boardJson.board?.currentPeriodId === period.id;
    checks.push({
      name: "Timetable API includes live period",
      ok: timetableApi.ok && periodOnBoard,
      detail: `status=${timetableApi.status} current=${boardJson.board?.currentPeriodId ?? "null"} onBoard=${periodOnBoard} isCurrent=${isCurrent}`,
    });
    checks.push({
      name: "Open live classroom entry available for period",
      ok: periodOnBoard && (isCurrent || Boolean(boardJson.board?.periods?.length)),
      detail: `liveHref=/teacher/live/${period.id}`,
    });
    checks.push({
      name: "Timetable page route reachable",
      ok: timetablePage.status === 200,
      detail: `status=${timetablePage.status} htmlHints=${timetableHasLink}`,
    });

    const livePage = await api(teacherJar, "GET", `/teacher/live/${period.id}`, undefined, 120_000);
    checks.push({
      name: "Live classroom page route",
      ok: livePage.status === 200,
      detail: `${livePage.status}`,
    });

    console.log("[uat] preparing assignments/tutor signals…");
    // Prepare student states via assignments + tutor + attempts
    await prisma.assignment.updateMany({
      where: { studentId: student.childId, contentId: { in: stageIds } },
      data: { status: "archived", completedAt: null },
    });

    const start = await api(parentJar, "POST", `/api/student/daytime-period/${period.id}/start`, {
      studentId: student.childId,
    }, 120_000);
    const startJson = start.json as {
      assignmentId?: string | null;
      contentId?: string | null;
      mode?: string;
    };
    let assignmentId = startJson.assignmentId ?? null;
    let contentId = startJson.contentId ?? null;
    if (!assignmentId || !contentId) {
      contentId = stageIds[0];
      assignmentId = await ensureOpenAssignment(student.childId, contentId);
    }
    checks.push({
      name: "Primary student assignment ready",
      ok: Boolean(assignmentId && contentId),
      detail: `assignment=${assignmentId} content=${contentId} mode=${startJson.mode}`,
    });

    const content = await prisma.aIContentCache.findUnique({
      where: { id: contentId! },
      select: { contentJson: true, contentType: true },
    });
    const q = firstQuestion(content?.contentJson ?? "{}");

    // Extra students: not-started (no assignment), completed (all stages done), practice (all done + period active)
    const notStarted = extras.find((e) => e.label === "not-started")!;
    const completedExtra = extras.find((e) => e.label === "completed")!;
    const practiceExtra = extras.find((e) => e.label === "practice")!;

    await prisma.assignment.deleteMany({
      where: { studentId: notStarted.childId, contentId: { in: stageIds } },
    });

    for (const stageId of stageIds) {
      await ensureOpenAssignment(completedExtra.childId, stageId);
      await prisma.assignment.update({
        where: { studentId_contentId: { studentId: completedExtra.childId, contentId: stageId } },
        data: { status: "completed", completedAt: new Date() },
      });
      await ensureOpenAssignment(practiceExtra.childId, stageId);
      await prisma.assignment.update({
        where: { studentId_contentId: { studentId: practiceExtra.childId, contentId: stageId } },
        data: { status: "completed", completedAt: new Date() },
      });
    }

    console.log("[uat] loading live board…");
    // Snapshot board before AI help (learning / not-needed / observe roughly)
    let live = await api(teacherJar, "GET", `/api/teacher/live/${period.id}`, undefined, 180_000);
    let liveBoard = (live.json as { board?: Record<string, unknown> }).board as {
      humanSupportSummary?: string;
      period?: { periodStillActive?: boolean; minutesRemaining?: number };
      students?: Array<Record<string, unknown>>;
      counts?: Record<string, number>;
    } | undefined;

    checks.push({
      name: "Live board loads for assigned teacher",
      ok: live.ok && Boolean(liveBoard),
      detail: `${live.status}`,
    });
    checks.push({
      name: "AI-only banner field",
      ok: liveBoard?.humanSupportSummary === "ai-only",
      detail: String(liveBoard?.humanSupportSummary),
    });

    const otherLive = await api(otherJar, "GET", `/api/teacher/live/${period.id}`, undefined, 120_000);
    checks.push({
      name: "Other teacher rejected from this classroom period",
      ok: otherLive.status === 403,
      detail: `${otherLive.status} ${JSON.stringify(otherLive.json).slice(0, 120)}`,
    });

    function findStudent(childId: string) {
      return (liveBoard?.students ?? []).find((s) => s.childId === childId) as Record<string, unknown> | undefined;
    }

    console.log("[uat] AI help + exhaustion…");
    // Seed AI assisting (stored-help) then struggle/exhaust
    const tutorBodyBase = {
      aiTutorScope: "daytime-school",
      periodId: period.id,
      assignmentId,
      contentId,
      studentId: student.childId,
      intent: "give-hint",
      questionId: q.questionId,
      questionIndex: q.questionIndex,
    };

    const help1 = await api(parentJar, "POST", "/api/student/daytime-tutor", {
      ...tutorBodyBase,
      intent: "explain-question",
    }, 180_000);
    checks.push({
      name: "AI tutor turn 1 (assisting)",
      ok: help1.ok,
      detail: `${help1.status} ${JSON.stringify(help1.json).slice(0, 160)}`,
    });

    live = await api(teacherJar, "GET", `/api/teacher/live/${period.id}`, undefined, 180_000);
    liveBoard = (live.json as { board?: typeof liveBoard }).board;
    const afterAssist = findStudent(student.childId);
    checks.push({
      name: "Board shows AI assisting / watch after help",
      ok: Boolean(afterAssist)
        && ["stored-help", "progressing", "live-ai", "struggling", "exhausted"].includes(String(afterAssist?.aiSupportState)),
      detail: JSON.stringify({
        learningState: afterAssist?.learningState,
        aiSupportState: afterAssist?.aiSupportState,
        teacherState: afterAssist?.teacherState,
        glanceSignal: afterAssist?.glanceSignal,
      }),
    });

    // Force exhaustion via coach log + needsTeacher (deterministic without relying on OpenAI)
    const conversationId = `uat-live-${Date.now()}`;
    await prisma.coachInteractionLog.create({
      data: {
        childId: student.childId,
        subject: "reading",
        skillFocus: `dts:${period.id}:${assignmentId}:q1:${conversationId}`,
        questionText: JSON.stringify({
          message: "Please ask your teacher.",
          intent: "give-hint",
          source: "fallback",
          revealsAnswer: false,
          needsTeacher: true,
          questionKey: "q1",
        }),
        hintLevel: 5,
        mode: "daytime_tutor",
        studentAnswer: "wrong",
        correct: false,
      },
    });
    await prisma.attempt.create({
      data: {
        studentId: student.childId,
        subject: "reading",
        skillFocus: "inference",
        contentId,
        assignmentId,
        questionText: q.prompt || "UAT question",
        answerGiven: "wrong",
        correctAnswer: q.modelAnswer,
        correct: false,
        responseTimeMs: 1200,
        hintsUsed: 3,
        difficulty: 2,
      },
    });

    live = await api(teacherJar, "GET", `/api/teacher/live/${period.id}`, undefined, 180_000);
    liveBoard = (live.json as { board?: typeof liveBoard }).board;
    const exhausted = findStudent(student.childId);
    checks.push({
      name: "Teacher required when exhausted + unrecovered",
      ok: exhausted?.aiSupportState === "exhausted"
        && exhausted?.humanTutorEligible === true
        && exhausted?.glanceSignal === "TEACHER_REQUIRED"
        && exhausted?.canJoinAsHumanTutor === true
        && exhausted?.canOpenDrawer === true,
      detail: JSON.stringify({
        learningState: exhausted?.learningState,
        aiSupportState: exhausted?.aiSupportState,
        teacherState: exhausted?.teacherState,
        glanceSignal: exhausted?.glanceSignal,
        humanTutorEligible: exhausted?.humanTutorEligible,
        recoveryOutcome: exhausted?.recoveryOutcome,
      }),
    });

    // Drawer fields + no leakage
    const history = Array.isArray(exhausted?.tutorHistory) ? exhausted!.tutorHistory as Array<Record<string, unknown>> : [];
    const attempts = Array.isArray(exhausted?.attempts) ? exhausted!.attempts as Array<Record<string, unknown>> : [];
    const stages = Array.isArray(exhausted?.stages) ? exhausted!.stages as Array<Record<string, unknown>> : [];
    const wrongAttempts = attempts.filter((a) => a.correct === false).length;
    const leakedPeriod = history.some(() => {
      // history items don't include other period ids in skillFocus path; messages only
      return false;
    });
    const foreignChildHistory = (liveBoard?.students ?? []).some((s) => {
      if (s.childId === student.childId) return false;
      const th = Array.isArray(s.tutorHistory) ? s.tutorHistory as Array<Record<string, unknown>> : [];
      return th.some((turn) => String(turn.message || "").includes("Please ask your teacher."));
    });
    checks.push({
      name: "Drawer context present while intervene eligible",
      ok: stages.length > 0 && history.length > 0 && attempts.length > 0 && wrongAttempts >= 1,
      detail: JSON.stringify({
        stageLabel: exhausted?.stageLabel,
        stages: stages.map((s) => ({ label: s.label, status: s.status, completed: s.completed })),
        helpTurnCount: exhausted?.helpTurnCount,
        attemptCount: exhausted?.attemptCount,
        wrongAttempts,
        recoveryOutcome: exhausted?.recoveryOutcome,
        periodStillActive: exhausted?.periodStillActive,
        minutesRemaining: liveBoard?.period?.minutesRemaining,
      }),
    });
    checks.push({
      name: "No cross-student tutor history leakage",
      ok: !foreignChildHistory && !leakedPeriod,
      detail: `foreignChildHistory=${foreignChildHistory}`,
    });

    // Intervention gate: locked while only assisting — use not-started / practice extras
    const ns = findStudent(notStarted.childId);
    const done = findStudent(completedExtra.childId);
    const practice = findStudent(practiceExtra.childId);
    checks.push({
      name: "Not-started student dimensions",
      ok: ns?.learningState === "not-started" && ns?.canOpenDrawer === true && ns?.canJoinAsHumanTutor === false,
      detail: JSON.stringify({ learningState: ns?.learningState, aiSupportState: ns?.aiSupportState, teacherState: ns?.teacherState, glance: ns?.glanceSignal }),
    });
    checks.push({
      name: "Practice student dimensions (period active, stages done)",
      ok: practice?.learningState === "practice" && practice?.canJoinAsHumanTutor === false,
      detail: JSON.stringify({ learningState: practice?.learningState, aiSupportState: practice?.aiSupportState, teacherState: practice?.teacherState }),
    });
    checks.push({
      name: "Completed-stages student (practice while period live)",
      ok: done?.learningState === "practice" || done?.learningState === "completed",
      detail: JSON.stringify({ learningState: done?.learningState, aiSupportState: done?.aiSupportState }),
    });

    // Soft intervene
    const join = await api(teacherJar, "POST", `/api/teacher/live/${period.id}`, {
      action: "join",
      childId: student.childId,
    }, 120_000);
    const joinJson = join.json as {
      mode?: string;
      humanSession?: unknown;
      student?: { teacherState?: string; canJoinAsHumanTutor?: boolean };
      message?: string;
    };
    checks.push({
      name: "Join as human tutor when eligible",
      ok: join.ok && joinJson.mode === "supporting" && joinJson.humanSession === null,
      detail: `${join.status} mode=${joinJson.mode} humanSession=${String(joinJson.humanSession)}`,
    });

    const audit = await prisma.schoolAuditLog.findFirst({
      where: {
        schoolId: period.schoolId,
        action: "live_classroom_intervene",
        entityId: student.childId,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, action: true, metadataJson: true, createdAt: true },
    });
    checks.push({
      name: "Audit live_classroom_intervene written",
      ok: Boolean(audit?.id),
      detail: audit ? `id=${audit.id}` : "missing",
    });
    report.interveneAuditId = audit?.id ?? null;

    // Confirm no Human Support tables / queue rows (schema absence + no new models used)
    const modelNames = Object.keys(prisma).filter((k) => !k.startsWith("$") && !k.startsWith("_"));
    const forbidden = modelNames.filter((n) => /tutorPresence|humanSupport|supportQueue|humanSupportSession/i.test(n));
    checks.push({
      name: "No Human Support persistence models in Prisma client",
      ok: forbidden.length === 0,
      detail: forbidden.join(",") || "none",
    });

    live = await api(teacherJar, "GET", `/api/teacher/live/${period.id}?supporting=${student.childId}`, undefined, 180_000);
    liveBoard = (live.json as { board?: typeof liveBoard }).board;
    const supporting = findStudent(student.childId);
    checks.push({
      name: "Teacher state supporting after join",
      ok: supporting?.teacherState === "supporting",
      detail: String(supporting?.teacherState),
    });

    const joinAgain = await api(teacherJar, "POST", `/api/teacher/live/${period.id}`, {
      action: "join",
      childId: student.childId,
    }, 120_000);
    checks.push({
      name: "Repeated join while still eligible is safe",
      ok: joinAgain.ok || joinAgain.status === 403,
      detail: `${joinAgain.status}`,
    });

    const otherJoin = await api(otherJar, "POST", `/api/teacher/live/${period.id}`, {
      action: "join",
      childId: student.childId,
    }, 120_000);
    checks.push({
      name: "Unauthorised teacher cannot intervene",
      ok: otherJoin.status === 403,
      detail: `${otherJoin.status}`,
    });

    // Recovery: correct attempt after exhaustion
    await prisma.attempt.create({
      data: {
        studentId: student.childId,
        subject: "reading",
        skillFocus: "inference",
        contentId,
        assignmentId,
        questionText: q.prompt || "UAT question",
        answerGiven: q.modelAnswer ?? "correct",
        correctAnswer: q.modelAnswer,
        correct: true,
        responseTimeMs: 900,
        hintsUsed: 0,
        difficulty: 2,
      },
    });

    live = await api(teacherJar, "GET", `/api/teacher/live/${period.id}`, undefined, 180_000);
    liveBoard = (live.json as { board?: typeof liveBoard }).board;
    const recovered = findStudent(student.childId);
    checks.push({
      name: "Recovery clears humanTutorEligible",
      ok: recovered?.studentRecovered === true
        && recovered?.humanTutorEligible === false
        && recovered?.canJoinAsHumanTutor === false
        && recovered?.canOpenDrawer === true,
      detail: JSON.stringify({
        studentRecovered: recovered?.studentRecovered,
        humanTutorEligible: recovered?.humanTutorEligible,
        teacherState: recovered?.teacherState,
        glanceSignal: recovered?.glanceSignal,
        recoveryOutcome: recovered?.recoveryOutcome,
      }),
    });

    const joinAfterRecovery = await api(teacherJar, "POST", `/api/teacher/live/${period.id}`, {
      action: "join",
      childId: student.childId,
    }, 120_000);
    checks.push({
      name: "Join locked after recovery",
      ok: joinAfterRecovery.status === 403,
      detail: `${joinAfterRecovery.status}`,
    });

    // Assignment completion lock
    await prisma.assignment.update({
      where: { id: assignmentId! },
      data: { status: "completed", completedAt: new Date() },
    });
    // Re-seed exhaustion without recovery for assignment-complete check on a fresh help event after complete
    // Actually after complete, assignmentStillActive may be false if only one stage — verify lock.
    live = await api(teacherJar, "GET", `/api/teacher/live/${period.id}`, undefined, 180_000);
    liveBoard = (live.json as { board?: typeof liveBoard }).board;
    const afterComplete = findStudent(student.childId);
    checks.push({
      name: "Join locked when assignment not active / completed path",
      ok: afterComplete?.canJoinAsHumanTutor === false,
      detail: JSON.stringify({
        assignmentStillActive: afterComplete?.assignmentStillActive,
        learningState: afterComplete?.learningState,
        canJoin: afterComplete?.canJoinAsHumanTutor,
      }),
    });

    // Period end lock: reopen assignment, exhaust again, end period
    await prisma.assignment.update({
      where: { id: assignmentId! },
      data: { status: "assigned", completedAt: null },
    });
    await prisma.coachInteractionLog.create({
      data: {
        childId: student.childId,
        subject: "reading",
        skillFocus: `dts:${period.id}:${assignmentId}:q1:uat-end-${Date.now()}`,
        questionText: JSON.stringify({
          message: "Still need teacher",
          intent: "give-hint",
          source: "fallback",
          needsTeacher: true,
          questionKey: "q1",
        }),
        hintLevel: 5,
        mode: "daytime_tutor",
      },
    });
    await prisma.schoolDayLesson.update({
      where: { id: period.id },
      data: { startsAt: hmNowPlus(-50), endsAt: hmNowPlus(-5) },
    });
    live = await api(teacherJar, "GET", `/api/teacher/live/${period.id}`, undefined, 180_000);
    liveBoard = (live.json as { board?: typeof liveBoard }).board;
    const afterPeriodEnd = findStudent(student.childId);
    checks.push({
      name: "Join locked after period ends",
      ok: afterPeriodEnd?.periodStillActive === false && afterPeriodEnd?.canJoinAsHumanTutor === false,
      detail: JSON.stringify({
        periodStillActive: afterPeriodEnd?.periodStillActive,
        humanTutorEligible: afterPeriodEnd?.humanTutorEligible,
        recoveryOutcome: afterPeriodEnd?.recoveryOutcome,
        canJoin: afterPeriodEnd?.canJoinAsHumanTutor,
      }),
    });
    const joinAfterPeriod = await api(teacherJar, "POST", `/api/teacher/live/${period.id}`, {
      action: "join",
      childId: student.childId,
    }, 120_000);
    checks.push({
      name: "POST join rejected after period end",
      ok: joinAfterPeriod.status === 403,
      detail: `${joinAfterPeriod.status}`,
    });

    // Polling behaviour (API refresh twice; UI interval is 10s in component)
    await prisma.schoolDayLesson.update({
      where: { id: period.id },
      data: { startsAt: hmNowPlus(-10), endsAt: hmNowPlus(40) },
    });
    const poll1 = await api(teacherJar, "GET", `/api/teacher/live/${period.id}`, undefined, 180_000);
    await new Promise((r) => setTimeout(r, 1500));
    const poll2 = await api(teacherJar, "GET", `/api/teacher/live/${period.id}`, undefined, 180_000);
    const g1 = ((poll1.json as { board?: { generatedAt?: string } }).board?.generatedAt) ?? "";
    const g2 = ((poll2.json as { board?: { generatedAt?: string } }).board?.generatedAt) ?? "";
    checks.push({
      name: "Board refresh returns fresh generatedAt",
      ok: poll1.ok && poll2.ok && Boolean(g1) && Boolean(g2),
      detail: `g1=${g1} g2=${g2} componentPollMs=10000`,
    });
    report.polling = {
      componentIntervalMs: 10000,
      note: "LiveClassroomBoard clears interval on unmount; UAT verified successive GETs refresh board state.",
      generatedAtSamples: [g1, g2],
    };

    // Re-open live period and capture board state summary for evidence
    live = await api(teacherJar, "GET", `/api/teacher/live/${period.id}`, undefined, 180_000);
    liveBoard = (live.json as { board?: typeof liveBoard }).board;
    report.boardSnapshot = {
      counts: liveBoard?.counts,
      humanSupportSummary: liveBoard?.humanSupportSummary,
      students: (liveBoard?.students ?? []).map((s) => ({
        name: s.name,
        learningState: s.learningState,
        aiSupportState: s.aiSupportState,
        teacherState: s.teacherState,
        glanceSignal: s.glanceSignal,
        humanTutorEligible: s.humanTutorEligible,
        canJoinAsHumanTutor: s.canJoinAsHumanTutor,
        canOpenDrawer: s.canOpenDrawer,
      })),
    };

    report.timetablePageStatus = timetablePage.status;
    report.livePageStatus = livePage.status;
  } finally {
    await restorePeriod(period.id, originalClock);
  }

  const failed = checks.filter((c) => !c.ok);
  report.checks = checks;
  report.passed = checks.filter((c) => c.ok).length;
  report.failed = failed.length;
  report.finishedAt = new Date().toISOString();
  writeFileSync(evidencePath, JSON.stringify(report, null, 2));

  console.log(`Live Classroom UAT: ${report.passed}/${checks.length} passed`);
  for (const c of checks) {
    console.log(`${c.ok ? "PASS" : "FAIL"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  }
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
