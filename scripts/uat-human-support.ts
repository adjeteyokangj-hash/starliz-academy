/**
 * Authenticated live UAT for Human Support Availability & Scheduling v1.
 * No migration reset / destructive deletes. Restores period clocks.
 *
 * Usage: npx tsx scripts/uat-human-support.ts
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
      if (!(process.env[k] ?? "").trim()) process.env[k] = v;
    }
  } catch {
    // ignore
  }
}
loadEnvLocal();

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth";
import { schoolDayOfWeek } from "../src/lib/schools/school-day-period";
import { sweepStaleTutorPresence, getOrCreateSupportPolicy } from "../src/lib/schools/human-support-presence";
import { closeHumanSupportForPeriodEnd } from "../src/lib/schools/human-support-scheduler";

const BASE = process.env.UAT_BASE_URL ?? "http://localhost:3000";
const prisma = new PrismaClient();
type CookieJar = Map<string, string>;
type Check = { name: string; ok: boolean; detail?: string };

const TEACHER_PASSWORD = process.env.UAT_TEACHER_PASSWORD ?? "UatLiveTeacher#2026";
const OTHER_TEACHER_PASSWORD = process.env.UAT_OTHER_TEACHER_PASSWORD ?? "UatOtherTeacher#2026";

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

async function api(jar: CookieJar, method: string, path: string, body?: unknown, timeoutMs = 90_000) {
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
      json = { raw: text.slice(0, 400) };
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

async function waitForServer(timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      const res = await fetch(BASE, { signal: controller.signal });
      clearTimeout(timer);
      if (res.status > 0) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

async function ensureTeacher(input: {
  email: string;
  name: string;
  password: string;
  schoolId: string;
}) {
  let user = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        role: "teacher",
        passwordHash: await hashPassword(input.password),
      },
      select: { id: true },
    });
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.password), role: "teacher" },
    });
  }
  const link = await prisma.schoolTeacher.upsert({
    where: { schoolId_userId: { schoolId: input.schoolId, userId: user.id } },
    create: {
      schoolId: input.schoolId,
      userId: user.id,
      role: "teacher",
      status: "active",
      acceptedAt: new Date(),
    },
    update: { status: "active", role: "teacher", acceptedAt: new Date() },
    select: { id: true },
  });
  return { userId: user.id, schoolTeacherId: link.id };
}

async function forceEligibleHelp(input: {
  childId: string;
  periodId: string;
  assignmentId: string;
  subject?: string;
}) {
  const conversationId = `uat-hs-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  await prisma.coachInteractionLog.create({
    data: {
      childId: input.childId,
      subject: input.subject ?? "reading",
      skillFocus: `dts:${input.periodId}:${input.assignmentId}:q1:${conversationId}`,
      questionText: JSON.stringify({
        message: "Please ask your teacher.",
        intent: "give-hint",
        source: "fallback",
        needsTeacher: true,
        questionKey: "q1",
      }),
      hintLevel: 5,
      mode: "daytime_tutor",
    },
  });
}

async function main() {
  const evidencePath = resolve("scripts/.uat-human-support-evidence.json");
  const daytimeEvidence = JSON.parse(
    readFileSync(resolve("scripts/.uat-daytime-evidence.json"), "utf8"),
  ) as {
    pickedPeriods?: Record<string, { dayLessonId?: string; schoolId?: string }>;
  };

  const checks: Check[] = [];
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    base: BASE,
    constraints: {
      noMigrationReset: true,
      noCommitPushDeploy: true,
    },
  };

  if (!(await waitForServer())) {
    throw new Error(`Server not reachable at ${BASE}`);
  }

  const picked = daytimeEvidence.pickedPeriods?.["guided-reading"];
  if (!picked?.dayLessonId || !picked.schoolId) throw new Error("Missing guided-reading period");

  const period = await prisma.schoolDayLesson.findUnique({
    where: { id: picked.dayLessonId },
    select: {
      id: true,
      schoolId: true,
      classroomId: true,
      teacherId: true,
      startsAt: true,
      endsAt: true,
      dayOfWeek: true,
      lesson: { select: { contentRefs: true, reviewStatus: true } },
    },
  });
  if (!period?.classroomId) throw new Error("Period missing classroom");

  const stageIds = String(period.lesson?.contentRefs || "").split(/[,\s]+/).filter(Boolean);
  const student = await prisma.schoolStudent.findUnique({
    where: {
      schoolId_externalRef: { schoolId: period.schoolId, externalRef: "uat:daytime:year6" },
    },
    select: { id: true, childId: true, child: { select: { name: true } } },
  });
  if (!student) throw new Error("UAT daytime student missing — run uat-ensure-daytime-student");

  // Extra students for queue / multi-tutor
  const extras = await prisma.schoolStudent.findMany({
    where: {
      schoolId: period.schoolId,
      classroomId: period.classroomId,
      status: "active",
      externalRef: { startsWith: "uat:live:" },
    },
    select: { childId: true, externalRef: true, child: { select: { name: true } } },
    take: 3,
  });

  const teacherA = await ensureTeacher({
    email: "uat.live.classroom.teacher@starliz.dev",
    name: "UAT Live Classroom Teacher",
    password: TEACHER_PASSWORD,
    schoolId: period.schoolId,
  });
  const teacherB = await ensureTeacher({
    email: "uat.live.other.teacher@starliz.dev",
    name: "UAT Other Teacher",
    password: OTHER_TEACHER_PASSWORD,
    schoolId: period.schoolId,
  });

  await prisma.schoolDayLesson.update({
    where: { id: period.id },
    data: {
      teacherId: teacherA.schoolTeacherId,
      startsAt: hmNowPlus(-10),
      endsAt: hmNowPlus(40),
      dayOfWeek: (() => {
        const d = schoolDayOfWeek(new Date());
        return d >= 1 && d <= 5 ? d : 1;
      })(),
    },
  });
  await prisma.classroom.update({
    where: { id: period.classroomId },
    data: { teacherId: teacherA.schoolTeacherId },
  });

  const policy = await getOrCreateSupportPolicy(period.schoolId);
  report.policy = {
    id: policy.id,
    min: policy.minimumSessionMinutes,
    max: policy.maximumSessionMinutes,
    heartbeat: policy.heartbeatIntervalSec,
    stale: policy.staleAfterSec,
  };

  // Schema verification via Prisma models (not information_schema binding quirks)
  const policyRow = await prisma.schoolSupportPolicy.findUnique({ where: { schoolId: period.schoolId } });
  const canQueryPresence = await prisma.tutorPresence.count({ where: { schoolId: period.schoolId } });
  const canQueryQueue = await prisma.humanSupportQueueEntry.count({ where: { schoolId: period.schoolId } });
  const canQuerySession = await prisma.humanSupportSession.count({ where: { schoolId: period.schoolId } });
  checks.push({
    name: "Human Support tables exist",
    ok: Boolean(policyRow) && canQueryPresence >= 0 && canQueryQueue >= 0 && canQuerySession >= 0,
    detail: JSON.stringify({
      policyId: policyRow?.id,
      presenceCount: canQueryPresence,
      queueCount: canQueryQueue,
      sessionCount: canQuerySession,
    }),
  });

  const originalClock = {
    startsAt: period.startsAt,
    endsAt: period.endsAt,
    dayOfWeek: period.dayOfWeek,
  };

  // Clean presence/queue/session for this school period (scoped, not destructive reset)
  await prisma.humanSupportSession.deleteMany({
    where: { schoolId: period.schoolId, periodId: period.id },
  });
  await prisma.humanSupportQueueEntry.deleteMany({
    where: { schoolId: period.schoolId, periodId: period.id },
  });
  await prisma.tutorPresence.deleteMany({
    where: { schoolId: period.schoolId },
  });

  const jarA: CookieJar = new Map();
  const jarB: CookieJar = new Map();
  const loginA = await api(jarA, "POST", "/api/auth/login", {
    email: "uat.live.classroom.teacher@starliz.dev",
    password: TEACHER_PASSWORD,
  });
  const loginB = await api(jarB, "POST", "/api/auth/login", {
    email: "uat.live.other.teacher@starliz.dev",
    password: OTHER_TEACHER_PASSWORD,
  });
  checks.push({ name: "Teacher A login", ok: loginA.ok, detail: `${loginA.status}` });
  checks.push({ name: "Teacher B login", ok: loginB.ok, detail: `${loginB.status}` });
  if (!loginA.ok || !loginB.ok) throw new Error("Teacher login failed");

  report.authMethod = {
    teacherA: "POST /api/auth/login uat.live.classroom.teacher@starliz.dev",
    teacherB: "POST /api/auth/login uat.live.other.teacher@starliz.dev",
  };

  try {
    // 3. Presence lifecycle
    const open = await api(jarA, "GET", `/api/teacher/live/${period.id}`);
    checks.push({ name: "Open Live Classroom", ok: open.ok, detail: `${open.status}` });
    const presence1 = await prisma.tutorPresence.findUnique({
      where: { schoolTeacherId: teacherA.schoolTeacherId },
    });
    checks.push({
      name: "Presence available after open",
      ok: presence1?.status === "available",
      detail: JSON.stringify({ status: presence1?.status, hb: presence1?.lastHeartbeatAt }),
    });
    report.presenceAfterOpen = presence1;

    await new Promise((r) => setTimeout(r, 2000));
    await api(jarA, "POST", "/api/teacher/presence", { dayLessonId: period.id });
    const presence2 = await prisma.tutorPresence.findUnique({
      where: { schoolTeacherId: teacherA.schoolTeacherId },
    });
    checks.push({
      name: "Heartbeat updates lastHeartbeatAt",
      ok: Boolean(presence2 && presence1 && presence2.lastHeartbeatAt >= presence1.lastHeartbeatAt),
      detail: JSON.stringify({ before: presence1?.lastHeartbeatAt, after: presence2?.lastHeartbeatAt }),
    });

    await api(jarA, "POST", "/api/teacher/presence", { dayLessonId: period.id, offline: true });
    // Force stale path: set old heartbeat while online then sweep
    await prisma.tutorPresence.update({
      where: { schoolTeacherId: teacherA.schoolTeacherId },
      data: {
        status: "available",
        lastHeartbeatAt: new Date(Date.now() - 5 * 60_000),
      },
    });
    const sweep1 = await sweepStaleTutorPresence();
    const presence3 = await prisma.tutorPresence.findUnique({
      where: { schoolTeacherId: teacherA.schoolTeacherId },
    });
    checks.push({
      name: "Stale sweep marks offline",
      ok: presence3?.status === "offline",
      detail: JSON.stringify({ status: presence3?.status, sweep: sweep1 }),
    });

    await api(jarA, "GET", `/api/teacher/live/${period.id}`);
    const presence4 = await prisma.tutorPresence.findUnique({
      where: { schoolTeacherId: teacherA.schoolTeacherId },
    });
    checks.push({
      name: "Reopen returns available",
      ok: presence4?.status === "available",
      detail: String(presence4?.status),
    });

    await api(jarA, "POST", "/api/teacher/presence", { dayLessonId: period.id, pause: true });
    const paused = await prisma.tutorPresence.findUnique({
      where: { schoolTeacherId: teacherA.schoolTeacherId },
    });
    checks.push({
      name: "Manual pause status",
      ok: paused?.status === "paused" || paused?.status === "busy",
      detail: String(paused?.status),
    });
    // resume via heartbeat
    await api(jarA, "POST", "/api/teacher/presence", { dayLessonId: period.id });

    // Ensure assignment for primary student
    const contentId = stageIds[0];
    if (!contentId) throw new Error("No stage content");
    let assignment = await prisma.assignment.findUnique({
      where: { studentId_contentId: { studentId: student.childId, contentId } },
      select: { id: true },
    });
    if (!assignment) {
      assignment = await prisma.assignment.create({
        data: { studentId: student.childId, contentId, status: "assigned" },
        select: { id: true },
      });
    } else {
      await prisma.assignment.update({
        where: { id: assignment.id },
        data: { status: "assigned", completedAt: null },
      });
    }

    // 4. No-tutor AI-only
    await prisma.tutorPresence.updateMany({
      where: { schoolId: period.schoolId },
      data: { status: "offline", lastHeartbeatAt: new Date(Date.now() - 10 * 60_000) },
    });
    await forceEligibleHelp({
      childId: student.childId,
      periodId: period.id,
      assignmentId: assignment.id,
    });
    // Load board as teacher without becoming available: use Prisma sync path via live GET would heart beat —
    // so verify server-side syncEligible with offline counts using a direct call.
    const { syncEligibleStudentQueue } = await import("../src/lib/schools/human-support-scheduler");
    const offlineSync = await syncEligibleStudentQueue({
      schoolId: period.schoolId,
      periodId: period.id,
      classroomId: period.classroomId,
      minutesUntilPeriodEnd: 30,
      eligibleStudents: [{
        childId: student.childId,
        humanTutorEligible: true,
        assignmentId: assignment.id,
        questionKey: "q1",
      }],
    });
    const waitingOffline = await prisma.humanSupportQueueEntry.count({
      where: { periodId: period.id, childId: student.childId, status: "waiting" },
    });
    checks.push({
      name: "No queue when no tutors online (server-side)",
      ok: offlineSync.counts.onlineTutorCount === 0 && waitingOffline === 0 && offlineSync.enqueued === 0,
      detail: JSON.stringify({ counts: offlineSync.counts, waitingOffline, enqueued: offlineSync.enqueued }),
    });

    // Bring teacher online and load board
    await api(jarA, "POST", "/api/teacher/presence", { dayLessonId: period.id });
    const boardAi = await api(jarA, "GET", `/api/teacher/live/${period.id}`);
    const boardAiJson = boardAi.json as { board?: { humanSupportSummary?: string; humanSupportState?: string } };
    checks.push({
      name: "Board humanSupportSummary when tutor online",
      ok: Boolean(boardAiJson.board?.humanSupportSummary)
        && !/waiting for tutor/i.test(boardAiJson.board?.humanSupportSummary ?? ""),
      detail: `${boardAiJson.board?.humanSupportState} / ${boardAiJson.board?.humanSupportSummary}`,
    });

    // 5. Immediate assignment
    const join = await api(jarA, "POST", `/api/teacher/live/${period.id}`, {
      action: "join",
      childId: student.childId,
    });
    const joinJson = join.json as {
      humanSession?: { id?: string; budgetMinutes?: number; plannedEndsAt?: string };
      mode?: string;
    };
    checks.push({
      name: "Join starts human session",
      ok: join.ok && Boolean(joinJson.humanSession?.id),
      detail: JSON.stringify(joinJson.humanSession),
    });
    const sessionId = joinJson.humanSession?.id ?? "";
    const session1 = await prisma.humanSupportSession.findUnique({ where: { id: sessionId } });
    const presenceBusy = await prisma.tutorPresence.findUnique({
      where: { schoolTeacherId: teacherA.schoolTeacherId },
    });
    checks.push({
      name: "Tutor busy + session active + budget frozen fields",
      ok: presenceBusy?.status === "busy"
        && session1?.status === "active"
        && Boolean(session1?.budgetMinutes)
        && Boolean(session1?.plannedEndsAt)
        && session1?.schoolTeacherId === teacherA.schoolTeacherId
        && session1?.childId === student.childId
        && session1?.periodId === period.id,
      detail: JSON.stringify({
        presence: presenceBusy?.status,
        session: {
          id: session1?.id,
          status: session1?.status,
          budgetMinutes: session1?.budgetMinutes,
          plannedEndsAt: session1?.plannedEndsAt,
          queueEntryId: session1?.queueEntryId,
        },
      }),
    });
    report.session1 = session1;
    report.interveneJoin = joinJson;

    const frozenBudget = session1?.budgetMinutes ?? 0;
    const frozenEnd = session1?.plannedEndsAt?.toISOString() ?? null;

    // 6. Frozen budget — add more eligible students and re-sync
    for (const extra of extras.slice(0, 2)) {
      const extraContent = stageIds[0]!;
      let asg = await prisma.assignment.findUnique({
        where: { studentId_contentId: { studentId: extra.childId, contentId: extraContent } },
        select: { id: true },
      });
      if (!asg) {
        asg = await prisma.assignment.create({
          data: { studentId: extra.childId, contentId: extraContent, status: "assigned" },
          select: { id: true },
        });
      }
      await forceEligibleHelp({
        childId: extra.childId,
        periodId: period.id,
        assignmentId: asg.id,
      });
    }
    await syncEligibleStudentQueue({
      schoolId: period.schoolId,
      periodId: period.id,
      classroomId: period.classroomId,
      minutesUntilPeriodEnd: 25,
      eligibleStudents: [
        { childId: student.childId, humanTutorEligible: true, assignmentId: assignment.id, questionKey: "q1" },
        ...extras.slice(0, 2).map((e) => ({
          childId: e.childId,
          humanTutorEligible: true,
          assignmentId: assignment.id,
          questionKey: "q1",
        })),
      ],
    });
    const sessionAfter = await prisma.humanSupportSession.findUnique({ where: { id: sessionId } });
    checks.push({
      name: "Active session budget does not shrink",
      ok: sessionAfter?.budgetMinutes === frozenBudget
        && sessionAfter?.plannedEndsAt?.toISOString() === frozenEnd,
      detail: JSON.stringify({
        before: { budget: frozenBudget, end: frozenEnd },
        after: { budget: sessionAfter?.budgetMinutes, end: sessionAfter?.plannedEndsAt },
      }),
    });

    // 7. Busy tutor → queue
    const waiting = await prisma.humanSupportQueueEntry.findMany({
      where: { periodId: period.id, status: "waiting" },
    });
    checks.push({
      name: "Waiting queue while tutor busy",
      ok: waiting.length >= 1,
      detail: JSON.stringify(waiting.map((w) => ({
        id: w.id,
        childId: w.childId,
        estimatedWaitSec: w.estimatedWaitSec,
        budgetMinutes: w.budgetMinutes,
      }))),
    });
    if (waiting[0]) {
      checks.push({
        name: "Wait estimate within period bound",
        ok: (waiting[0].estimatedWaitSec ?? 0) <= 40 * 60,
        detail: `estimatedWaitSec=${waiting[0].estimatedWaitSec}`,
      });
    }

    // 8. Multiple tutors
    await api(jarB, "POST", "/api/teacher/presence", { dayLessonId: period.id });
    // Teacher B is not period teacher — live board may 403. Presence API still works.
    const presenceB = await prisma.tutorPresence.findUnique({
      where: { schoolTeacherId: teacherB.schoolTeacherId },
    });
    // Make B classroom-authorised by also assigning them as classroom teacher temporarily?
    // For multi-tutor: accept via API by making B a wide role or period teacher briefly.
    // Simpler: use acceptHumanSupportStudent directly for B with school membership.
    const { acceptHumanSupportStudent, endHumanSupportSession } = await import(
      "../src/lib/schools/human-support-scheduler"
    );
    const nextWaiting = await prisma.humanSupportQueueEntry.findFirst({
      where: { periodId: period.id, status: "waiting" },
      orderBy: { enqueuedAt: "asc" },
    });
    let sessionBId: string | null = null;
    if (nextWaiting && presenceB?.status === "available") {
      const acceptedB = await acceptHumanSupportStudent({
        schoolId: period.schoolId,
        schoolTeacherId: teacherB.schoolTeacherId,
        actorUserId: teacherB.userId,
        periodId: period.id,
        childId: nextWaiting.childId,
        classroomId: period.classroomId,
        assignmentId: nextWaiting.assignmentId,
        questionKey: nextWaiting.questionKey,
        minutesUntilPeriodEnd: 30,
        eligibleStudentCount: 2,
      });
      checks.push({
        name: "Second available tutor takes waiting student",
        ok: acceptedB.ok,
        detail: JSON.stringify(acceptedB),
      });
      if (acceptedB.ok) sessionBId = acceptedB.session.id;
    } else {
      checks.push({
        name: "Second available tutor takes waiting student",
        ok: false,
        detail: `waiting=${Boolean(nextWaiting)} presenceB=${presenceB?.status}`,
      });
    }

    const activeCountA = await prisma.humanSupportSession.count({
      where: { schoolTeacherId: teacherA.schoolTeacherId, status: "active" },
    });
    const activeCountB = await prisma.humanSupportSession.count({
      where: { schoolTeacherId: teacherB.schoolTeacherId, status: "active" },
    });
    checks.push({
      name: "No tutor has two simultaneous active sessions",
      ok: activeCountA <= 1 && activeCountB <= 1,
      detail: `A=${activeCountA} B=${activeCountB}`,
    });

    // both busy → new eligible queues
    const third = extras[2] ?? extras[0];
    if (third) {
      let asg3 = await prisma.assignment.findUnique({
        where: { studentId_contentId: { studentId: third.childId, contentId } },
        select: { id: true },
      });
      if (!asg3) {
        asg3 = await prisma.assignment.create({
          data: { studentId: third.childId, contentId, status: "assigned" },
          select: { id: true },
        });
      }
      await forceEligibleHelp({
        childId: third.childId,
        periodId: period.id,
        assignmentId: asg3.id,
      });
      await syncEligibleStudentQueue({
        schoolId: period.schoolId,
        periodId: period.id,
        classroomId: period.classroomId,
        minutesUntilPeriodEnd: 25,
        eligibleStudents: [{
          childId: third.childId,
          humanTutorEligible: true,
          assignmentId: asg3.id,
          questionKey: "q1",
        }],
      });
      const queuedThird = await prisma.humanSupportQueueEntry.findFirst({
        where: { periodId: period.id, childId: third.childId, status: "waiting" },
      });
      checks.push({
        name: "Both busy → new eligible student queues",
        ok: Boolean(queuedThird),
        detail: queuedThird?.id ?? "none",
      });
    }

    // 9. Resolve session A
    const endResolved = await endHumanSupportSession({
      schoolId: period.schoolId,
      schoolTeacherId: teacherA.schoolTeacherId,
      actorUserId: teacherA.userId,
      sessionId,
      outcome: "resolved",
      outcomeNotes: "UAT resolved",
    });
    const sessionResolved = await prisma.humanSupportSession.findUnique({ where: { id: sessionId } });
    const presenceAfterResolve = await prisma.tutorPresence.findUnique({
      where: { schoolTeacherId: teacherA.schoolTeacherId },
    });
    checks.push({
      name: "Resolved session completes + tutor available",
      ok: endResolved.ok
        && sessionResolved?.status === "completed"
        && sessionResolved.outcome === "resolved"
        && Boolean(sessionResolved.endedAt)
        && (presenceAfterResolve?.status === "available" || presenceAfterResolve?.status === "busy"),
      detail: JSON.stringify({
        end: endResolved,
        outcome: sessionResolved?.outcome,
        presence: presenceAfterResolve?.status,
        median: presenceAfterResolve?.rollingMedianMinutes,
      }),
    });
    report.resolved = { sessionId, endResolved, median: presenceAfterResolve?.rollingMedianMinutes };

    // 10. Unresolved mandatory report on session B if present, else create short session
    let unresolvedSessionId = sessionBId;
    if (!unresolvedSessionId) {
      // ensure A available and start new
      await api(jarA, "POST", "/api/teacher/presence", { dayLessonId: period.id });
      const extraChild = extras[0]?.childId ?? student.childId;
      const created = await acceptHumanSupportStudent({
        schoolId: period.schoolId,
        schoolTeacherId: teacherA.schoolTeacherId,
        actorUserId: teacherA.userId,
        periodId: period.id,
        childId: extraChild,
        classroomId: period.classroomId,
        assignmentId: assignment.id,
        questionKey: "q1",
        minutesUntilPeriodEnd: 20,
        eligibleStudentCount: 1,
      });
      if (created.ok) unresolvedSessionId = created.session.id;
    }
    if (unresolvedSessionId) {
      const sess = await prisma.humanSupportSession.findUnique({ where: { id: unresolvedSessionId } });
      const tutorId = sess?.schoolTeacherId ?? teacherA.schoolTeacherId;
      const userId = tutorId === teacherB.schoolTeacherId ? teacherB.userId : teacherA.userId;
      const reject = await endHumanSupportSession({
        schoolId: period.schoolId,
        schoolTeacherId: tutorId,
        actorUserId: userId,
        sessionId: unresolvedSessionId,
        outcome: "unresolved",
      });
      checks.push({
        name: "Unresolved without report rejected",
        ok: !reject.ok && reject.status === 400,
        detail: JSON.stringify(reject),
      });
      const okEnd = await endHumanSupportSession({
        schoolId: period.schoolId,
        schoolTeacherId: tutorId,
        actorUserId: userId,
        sessionId: unresolvedSessionId,
        outcome: "unresolved",
        unresolvedReportJson: JSON.stringify({
          reason: "UAT cannot resolve",
          nextStep: "follow up next lesson",
        }),
      });
      const unresolvedRow = await prisma.humanSupportSession.findUnique({
        where: { id: unresolvedSessionId },
      });
      const unresolvedAudit = await prisma.schoolAuditLog.findFirst({
        where: { schoolId: period.schoolId, action: "human_support_unresolved" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      checks.push({
        name: "Unresolved with report saved + warning audit",
        ok: okEnd.ok
          && unresolvedRow?.outcome === "unresolved"
          && Boolean(unresolvedRow.unresolvedReportJson)
          && Boolean(unresolvedAudit?.id),
        detail: JSON.stringify({
          outcome: unresolvedRow?.outcome,
          auditId: unresolvedAudit?.id,
          report: unresolvedRow?.unresolvedReportJson,
        }),
      });
      report.unresolvedAuditId = unresolvedAudit?.id ?? null;
    }

    // 11. Stale while busy — use/create an active session for tutor A, then expire heartbeat.
    let staleSession = await prisma.humanSupportSession.findFirst({
      where: { schoolTeacherId: teacherA.schoolTeacherId, status: "active" },
    });
    if (!staleSession) {
      await api(jarA, "POST", "/api/teacher/presence", { dayLessonId: period.id });
      // Ensure A is available (end any leftover busy without next-assign by marking offline first? )
      await prisma.tutorPresence.update({
        where: { schoolTeacherId: teacherA.schoolTeacherId },
        data: { status: "available", activeSessionId: null, busySince: null, lastHeartbeatAt: new Date() },
      });
      const childForStale = extras[1]?.childId ?? extras[0]?.childId ?? student.childId;
      // Close any active sessions for this child in period
      await prisma.humanSupportSession.updateMany({
        where: { periodId: period.id, childId: childForStale, status: "active" },
        data: { status: "completed", outcome: "resolved", endedAt: new Date() },
      });
      const createdStale = await acceptHumanSupportStudent({
        schoolId: period.schoolId,
        schoolTeacherId: teacherA.schoolTeacherId,
        actorUserId: teacherA.userId,
        periodId: period.id,
        childId: childForStale,
        classroomId: period.classroomId,
        assignmentId: assignment.id,
        questionKey: "q1",
        minutesUntilPeriodEnd: 20,
        eligibleStudentCount: 1,
      });
      if (createdStale.ok) {
        staleSession = await prisma.humanSupportSession.findUnique({ where: { id: createdStale.session.id } });
      }
    }

    if (staleSession) {
      // Ensure there is at least one waiting entry to pause
      await prisma.humanSupportQueueEntry.create({
        data: {
          schoolId: period.schoolId,
          childId: student.childId,
          classroomId: period.classroomId,
          periodId: period.id,
          status: "waiting",
          assignmentId: assignment.id,
        },
      });
      await prisma.tutorPresence.update({
        where: { schoolTeacherId: teacherA.schoolTeacherId },
        data: {
          status: "busy",
          activeSessionId: staleSession.id,
          lastHeartbeatAt: new Date(Date.now() - 10 * 60_000),
        },
      });
      await prisma.tutorPresence.updateMany({
        where: { schoolTeacherId: teacherB.schoolTeacherId },
        data: { status: "offline", lastHeartbeatAt: new Date(Date.now() - 10 * 60_000) },
      });
      const sweepBusy = await sweepStaleTutorPresence();
      const staleSessionAfter = await prisma.humanSupportSession.findUnique({ where: { id: staleSession.id } });
      const paused = await prisma.humanSupportQueueEntry.count({
        where: { periodId: period.id, status: "paused_ai_only" },
      });
      const pauseAudit = await prisma.schoolAuditLog.findFirst({
        where: { schoolId: period.schoolId, action: "human_support_queue_paused" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      checks.push({
        name: "Stale busy tutor abandons session + pauses queue",
        ok: staleSessionAfter?.status === "abandoned"
          && staleSessionAfter.outcome === "disconnected"
          && paused >= 1
          && Boolean(pauseAudit?.id),
        detail: JSON.stringify({
          sweepBusy,
          session: staleSessionAfter?.status,
          outcome: staleSessionAfter?.outcome,
          paused,
          pauseAuditId: pauseAudit?.id,
        }),
      });
      report.staleBusy = {
        sessionId: staleSession.id,
        pauseAuditId: pauseAudit?.id ?? null,
      };
    } else {
      checks.push({
        name: "Stale busy tutor abandons session + pauses queue",
        ok: false,
        detail: "could not start stale session",
      });
    }

    // 12. Period end
    await prisma.schoolDayLesson.update({
      where: { id: period.id },
      data: { startsAt: hmNowPlus(-60), endsAt: hmNowPlus(-5) },
    });
    // recreate a waiting entry then closeout
    await prisma.humanSupportQueueEntry.create({
      data: {
        schoolId: period.schoolId,
        childId: student.childId,
        classroomId: period.classroomId,
        periodId: period.id,
        status: "waiting",
      },
    });
    const closeout = await closeHumanSupportForPeriodEnd({
      schoolId: period.schoolId,
      periodId: period.id,
    });
    const waitingAfter = await prisma.humanSupportQueueEntry.count({
      where: { periodId: period.id, status: "waiting" },
    });
    checks.push({
      name: "Period end expires waiting / closes sessions",
      ok: waitingAfter === 0 && closeout.expiredWaiting >= 1,
      detail: JSON.stringify(closeout),
    });

    // Restore live clock briefly to confirm join rejected after period end
    const joinAfterEnd = await api(jarA, "POST", `/api/teacher/live/${period.id}`, {
      action: "join",
      childId: student.childId,
    });
    checks.push({
      name: "No new join after period ended",
      ok: joinAfterEnd.status === 403 || joinAfterEnd.status === 409 || !joinAfterEnd.ok,
      detail: `${joinAfterEnd.status} ${JSON.stringify(joinAfterEnd.json).slice(0, 160)}`,
    });

    // 13. Audits
    const auditActions = [
      "tutor_online",
      "tutor_available",
      "tutor_busy",
      "tutor_offline_stale",
      "human_support_eligible",
      "human_support_enqueued",
      "human_support_assigned",
      "human_support_session_started",
      "human_support_session_ended",
      "human_support_queue_paused",
      "human_support_unresolved",
    ] as const;
    const auditIds: Record<string, string | null> = {};
    for (const action of auditActions) {
      const row = await prisma.schoolAuditLog.findFirst({
        where: { schoolId: period.schoolId, action },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      auditIds[action] = row?.id ?? null;
    }
    report.auditIds = auditIds;
    checks.push({
      name: "Principal audits present",
      ok: Boolean(auditIds.tutor_online || auditIds.tutor_available)
        && Boolean(auditIds.human_support_session_started)
        && Boolean(auditIds.human_support_session_ended),
      detail: JSON.stringify(auditIds),
    });

    const boardFinal = await api(jarA, "GET", `/api/teacher/live/${period.id}`);
    report.finalBoardSummary = (boardFinal.json as { board?: { humanSupportSummary?: string } })?.board?.humanSupportSummary;
  } finally {
    await prisma.schoolDayLesson.update({
      where: { id: period.id },
      data: originalClock,
    });
  }

  const failed = checks.filter((c) => !c.ok);
  report.checks = checks;
  report.passed = checks.filter((c) => c.ok).length;
  report.failed = failed.length;
  report.finishedAt = new Date().toISOString();
  writeFileSync(evidencePath, JSON.stringify(report, null, 2));

  console.log(`Human Support UAT: ${report.passed}/${checks.length} passed`);
  for (const c of checks) {
    console.log(`${c.ok ? "PASS" : "FAIL"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  }
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
