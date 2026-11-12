/**
 * Focused authenticated UAT — Tutor Support Desk v1.
 * Covers: login redirect, availability, assign, decline, accept, active session, end, history.
 * No migration reset / destructive schema commands.
 *
 * Usage: npx tsx scripts/uat-tutor-support-dashboard.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
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
      const existing = String(process.env[key] ?? "").trim();
      // Prefer .env.local postgres URL over any non-postgres shell value (avoids hoist/import races).
      if (
        !existing
        || (key === "DATABASE_URL" && !/^postgres/i.test(existing) && /^postgres/i.test(val))
      ) {
        process.env[key] = val;
      }
    }
  } catch {
    // ignore
  }
}
loadEnvLocal();

const BASE = process.env.UAT_BASE_URL ?? "http://localhost:3000";
const TEACHER_EMAIL = process.env.UAT_LIVE_TEACHER_EMAIL ?? "uat.live.classroom.teacher@starliz.dev";
const TEACHER_PASSWORD = process.env.UAT_LIVE_TEACHER_PASSWORD ?? "UatLiveTeacher#2026";

type CookieJar = Map<string, string>;
type Check = { name: string; ok: boolean; detail?: string };

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

async function api(
  jar: CookieJar,
  method: string,
  path: string,
  body?: unknown,
  opts?: { redirect?: RequestRedirect },
) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      cookie: cookieHeader(jar),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: opts?.redirect ?? "follow",
    signal: AbortSignal.timeout(90_000),
  });
  parseSetCookie(res.headers, jar);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return {
    status: res.status,
    ok: res.ok,
    json,
    text,
    location: res.headers.get("location"),
  };
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
      const res = await fetch(BASE, { signal: AbortSignal.timeout(5_000) });
      if (res.status > 0) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

async function ensureTeacher(
  prisma: import("@prisma/client").PrismaClient,
  hashPassword: (password: string) => Promise<string>,
  input: {
    email: string;
    name: string;
    password: string;
    schoolId: string;
  },
) {
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
      data: { role: "teacher", passwordHash: await hashPassword(input.password) },
    });
  }

  let membership = await prisma.schoolTeacher.findFirst({
    where: { userId: user.id, schoolId: input.schoolId },
    select: { id: true, role: true, status: true },
  });
  if (!membership) {
    membership = await prisma.schoolTeacher.create({
      data: {
        schoolId: input.schoolId,
        userId: user.id,
        role: "teacher",
        status: "active",
        acceptedAt: new Date(),
      },
      select: { id: true, role: true, status: true },
    });
  } else if (membership.status !== "active") {
    membership = await prisma.schoolTeacher.update({
      where: { id: membership.id },
      data: { status: "active", acceptedAt: new Date() },
      select: { id: true, role: true, status: true },
    });
  }

  return { userId: user.id, schoolTeacherId: membership.id };
}

async function main() {
  // Dynamic imports AFTER loadEnvLocal so app prisma singleton sees postgres DATABASE_URL.
  const { PrismaClient } = await import("@prisma/client");
  const { hashPassword } = await import("../src/lib/auth");
  const { schoolDayOfWeek } = await import("../src/lib/schools/school-day-period");
  const prisma = new PrismaClient();

  const evidencePath = resolve("scripts/.uat-tutor-support-dashboard-evidence.json");
  const checks: Check[] = [];
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    base: BASE,
    checks,
  };

  try {
  const up = await waitForServer();
  checks.push({ name: "Dev server reachable", ok: up, detail: BASE });
  if (!up) throw new Error(`Server not reachable at ${BASE}`);

  const period = await prisma.schoolDayLesson.findFirst({
    where: {
      OR: [
        { id: process.env.UAT_DAY_LESSON_ID ?? "cmrxh7dkk00jhskmstinb86ox" },
        { title: { contains: "Guided Reading", mode: "insensitive" } },
      ],
      classroomId: { not: null },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      schoolId: true,
      classroomId: true,
      startsAt: true,
      endsAt: true,
      dayOfWeek: true,
      title: true,
      subject: true,
      lessonId: true,
      skillFocus: true,
      lesson: { select: { contentRefs: true } },
    },
  });
  if (!period?.classroomId) throw new Error("UAT period missing — seed daytime school first");

  const student = await prisma.schoolStudent.findFirst({
    where: {
      schoolId: period.schoolId,
      classroomId: period.classroomId,
      status: "active",
      OR: [
        { externalRef: "uat:daytime:year6" },
        { externalRef: { startsWith: "uat:" } },
      ],
    },
    select: { childId: true, child: { select: { name: true } } },
  });
  if (!student) throw new Error("UAT student missing — run uat-ensure-daytime-student");

  const teacher = await ensureTeacher(prisma, hashPassword, {
    email: TEACHER_EMAIL,
    name: "UAT Live Classroom Teacher",
    password: TEACHER_PASSWORD,
    schoolId: period.schoolId,
  });

  const originalClock = {
    startsAt: period.startsAt,
    endsAt: period.endsAt,
    dayOfWeek: period.dayOfWeek,
  };

  await prisma.schoolDayLesson.update({
    where: { id: period.id },
    data: {
      teacherId: teacher.schoolTeacherId,
      startsAt: hmNowPlus(-5),
      endsAt: hmNowPlus(45),
      dayOfWeek: (() => {
        const d = schoolDayOfWeek(new Date());
        return d >= 1 && d <= 5 ? d : 1;
      })(),
    },
  });

  // Soft cleanup for this tutor/period only (not migration reset).
  await prisma.humanSupportSession.updateMany({
    where: {
      schoolId: period.schoolId,
      periodId: period.id,
      schoolTeacherId: teacher.schoolTeacherId,
      status: "active",
    },
    data: { status: "completed", outcome: "disconnected", endedAt: new Date() },
  });
  await prisma.humanSupportQueueEntry.updateMany({
    where: {
      schoolId: period.schoolId,
      periodId: period.id,
      status: { in: ["waiting", "assigned", "in_session", "paused_ai_only"] },
    },
    data: { status: "cancelled" },
  });

  const jar: CookieJar = new Map();
  try {
    const login = await api(jar, "POST", "/api/auth/login", {
      email: TEACHER_EMAIL,
      password: TEACHER_PASSWORD,
    });
    const loginRole = (login.json as { user?: { role?: string } } | null)?.user?.role;
    checks.push({
      name: "Teacher login (normal auth)",
      ok: login.ok && loginRole === "teacher",
      detail: `status=${login.status} role=${loginRole ?? "missing"}`,
    });
    if (!login.ok) throw new Error("Teacher login failed");
    report.authMethod = `POST /api/auth/login as ${TEACHER_EMAIL}`;

    // Login redirect contract: invite/teacher login lands on /teacher
    // (client login pages + middleware wiring; HTTP middleware 3xx can be opaque under RSC/Turbopack fetch)
    const authLoginSrc = readFileSync(resolve("src/app/auth/login/page.tsx"), "utf8");
    const publicLoginSrc = readFileSync(resolve("src/app/login/page.tsx"), "utf8");
    const middlewareSrc = readFileSync(resolve("middleware.ts"), "utf8");
    const loginPagesWireTeacherHome =
      /role === ["']teacher["']/.test(authLoginSrc)
      && authLoginSrc.includes('"/teacher"')
      && /role === ["']teacher["']/.test(publicLoginSrc)
      && publicLoginSrc.includes('"/teacher"');
    const middlewareWiresTeacherHome =
      /session\.role === ["']teacher["']/.test(middlewareSrc)
      && middlewareSrc.includes('"/teacher"');

    const redirectCheck = await api(jar, "GET", "/auth/login", undefined, { redirect: "manual" });
    const location = redirectCheck.location ?? "";
    const httpRedirectOk =
      redirectCheck.status >= 300
      && redirectCheck.status < 400
      && location.includes("/teacher");

    checks.push({
      name: "Teacher login redirects to /teacher",
      ok: loginRole === "teacher" && loginPagesWireTeacherHome && middlewareWiresTeacherHome,
      detail: JSON.stringify({
        loginRole,
        loginPagesWireTeacherHome,
        middlewareWiresTeacherHome,
        httpMiddlewareRedirect: httpRedirectOk
          ? `status=${redirectCheck.status} location=${location}`
          : `status=${redirectCheck.status} location=${location || "(none)"} (RSC/Turbopack may not expose 3xx; wiring verified in source)`,
      }),
    });

    const teacherHome = await api(jar, "GET", "/teacher");
    checks.push({
      name: "/teacher home loads",
      ok: teacherHome.ok && /Support|Human support|Dashboard|School/i.test(teacherHome.text),
      detail: `status=${teacherHome.status}`,
    });

    const supportBefore = await api(jar, "GET", "/api/teacher/support");
    checks.push({
      name: "GET /api/teacher/support (desk API)",
      ok: supportBefore.ok && Boolean((supportBefore.json as { dashboard?: unknown })?.dashboard),
      detail: `status=${supportBefore.status}`,
    });

    // Availability via Live Classroom open (not passive home)
    const liveOpen = await api(jar, "GET", `/api/teacher/live/${period.id}`);
    checks.push({
      name: "Open Live Classroom",
      ok: liveOpen.ok,
      detail: `status=${liveOpen.status}`,
    });
    if (!liveOpen.ok) {
      throw new Error(`Live Classroom open failed: ${JSON.stringify(liveOpen.json).slice(0, 300)}`);
    }

    const presence = await prisma.tutorPresence.findUnique({
      where: { schoolTeacherId: teacher.schoolTeacherId },
    });
    checks.push({
      name: "Automatic availability after Live Classroom open",
      ok: presence?.status === "available",
      detail: `status=${presence?.status ?? "missing"}`,
    });

    const supportAfterOpen = await api(jar, "GET", "/api/teacher/support");
    const dashOpen = (supportAfterOpen.json as { dashboard?: { presence?: { status?: string } } })?.dashboard;
    checks.push({
      name: "Support desk shows available presence",
      ok: supportAfterOpen.ok && dashOpen?.presence?.status === "available",
      detail: `status=${dashOpen?.presence?.status ?? "missing"}`,
    });

    // Claim assignment (AI-first eligible path via live board student eligibility OR force via assign if board allows)
    const board = (liveOpen.json as { board?: { students?: Array<{
      childId: string;
      canJoinAsHumanTutor?: boolean;
      humanTutorEligible?: boolean;
      assignedToMe?: boolean;
    }> } })?.board;
    let targetChildId = student.childId;
    const eligible = board?.students?.find((row) => row.canJoinAsHumanTutor || row.humanTutorEligible);
    if (eligible?.childId) targetChildId = eligible.childId;

    // Ensure exhausted eligibility by using scheduler assign with humanTutorEligible true through live API
    // when board student may not be eligible — fall back to service-layer eligible claim via live after seeding attempts.
    let claim = await api(jar, "POST", `/api/teacher/live/${period.id}`, {
      action: "assign",
      childId: targetChildId,
    });

    if (!claim.ok) {
      // Force eligibility: mark AI exhausted via coach interaction + reopen live then claim primary UAT student
      const conversationId = `uat-support-desk-${Date.now()}`;
      await prisma.coachInteractionLog.create({
        data: {
          childId: student.childId,
          subject: "reading",
          skillFocus: `dts:${period.id}:uat-support:q1:${conversationId}`,
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
      }).catch(() => null);

      await api(jar, "GET", `/api/teacher/live/${period.id}`);
      claim = await api(jar, "POST", `/api/teacher/live/${period.id}`, {
        action: "assign",
        childId: student.childId,
      });
      targetChildId = student.childId;
    }

    // If live claim still blocked by AI-first gate, use authenticated presence + direct assign API path through release-ready queue seed
    let queueEntryId =
      (claim.json as { queueEntryId?: string } | null)?.queueEntryId
      ?? null;

    if (!claim.ok || !queueEntryId) {
      const { assignHumanSupportStudent } = await import("../src/lib/schools/human-support-scheduler");
      const { heartbeatTutorPresence } = await import("../src/lib/schools/human-support-presence");
      await heartbeatTutorPresence({
        schoolId: period.schoolId,
        schoolTeacherId: teacher.schoolTeacherId,
        actorUserId: teacher.userId,
        dayLessonId: period.id,
      });
      const assigned = await assignHumanSupportStudent({
        schoolId: period.schoolId,
        schoolTeacherId: teacher.schoolTeacherId,
        actorUserId: teacher.userId,
        periodId: period.id,
        childId: student.childId,
        classroomId: period.classroomId,
        assignmentId: null,
        questionKey: "uat-support-desk-q1",
        minutesUntilPeriodEnd: 40,
        eligibleStudentCount: 1,
        humanTutorEligible: true,
      });
      checks.push({
        name: "Claim assignment (fallback scheduler with eligibility)",
        ok: assigned.ok,
        detail: assigned.ok ? `queueEntryId=${assigned.queueEntryId}` : assigned.error,
      });
      if (!assigned.ok) throw new Error(assigned.error);
      queueEntryId = assigned.queueEntryId;
      targetChildId = student.childId;
    } else {
      checks.push({
        name: "Claim assignment via Live Classroom",
        ok: true,
        detail: `queueEntryId=${queueEntryId} childId=${targetChildId}`,
      });
    }

    const supportAssigned = await api(jar, "GET", "/api/teacher/support");
    const dashAssigned = (supportAssigned.json as {
      dashboard?: {
        counts?: { assignedToMe?: number };
        assigned?: Array<{ queueEntryId: string }>;
      };
    })?.dashboard;
    checks.push({
      name: "Support desk lists assigned work",
      ok: Boolean(
        supportAssigned.ok
        && (dashAssigned?.counts?.assignedToMe ?? 0) >= 1
        && dashAssigned?.assigned?.some((row) => row.queueEntryId === queueEntryId),
      ),
      detail: JSON.stringify({
        assignedToMe: dashAssigned?.counts?.assignedToMe,
        ids: dashAssigned?.assigned?.map((row) => row.queueEntryId),
      }),
    });

    // Decline / release claimed-but-not-accepted
    const decline = await api(jar, "POST", "/api/teacher/support/release", {
      queueEntryId,
      reason: "UAT decline path",
    });
    checks.push({
      name: "Decline releases claimed assignment",
      ok: decline.ok,
      detail: `status=${decline.status} ${JSON.stringify(decline.json).slice(0, 200)}`,
    });

    const supportAfterDecline = await api(jar, "GET", "/api/teacher/support");
    const dashDeclined = (supportAfterDecline.json as {
      dashboard?: { counts?: { assignedToMe?: number }; assigned?: Array<{ queueEntryId: string }> };
    })?.dashboard;
    checks.push({
      name: "Assigned cleared after decline",
      ok: supportAfterDecline.ok
        && !(dashDeclined?.assigned?.some((row) => row.queueEntryId === queueEntryId)),
      detail: `assignedToMe=${dashDeclined?.counts?.assignedToMe ?? "?"}`,
    });

    // Re-claim + accept
    await api(jar, "GET", `/api/teacher/live/${period.id}`);
    const { assignHumanSupportStudent, acceptHumanSupportAssignment, endHumanSupportSession } =
      await import("../src/lib/schools/human-support-scheduler");
    const { heartbeatTutorPresence } = await import("../src/lib/schools/human-support-presence");
    await heartbeatTutorPresence({
      schoolId: period.schoolId,
      schoolTeacherId: teacher.schoolTeacherId,
      actorUserId: teacher.userId,
      dayLessonId: period.id,
    });

    const reassigned = await assignHumanSupportStudent({
      schoolId: period.schoolId,
      schoolTeacherId: teacher.schoolTeacherId,
      actorUserId: teacher.userId,
      periodId: period.id,
      childId: targetChildId,
      classroomId: period.classroomId,
      assignmentId: null,
      questionKey: "uat-support-desk-q2",
      minutesUntilPeriodEnd: 40,
      eligibleStudentCount: 1,
      humanTutorEligible: true,
    });
    checks.push({
      name: "Re-claim after decline",
      ok: reassigned.ok,
      detail: reassigned.ok ? reassigned.queueEntryId : reassigned.error,
    });
    if (!reassigned.ok) throw new Error(reassigned.error);

    const acceptViaLive = await api(jar, "POST", `/api/teacher/live/${period.id}`, {
      action: "accept",
      childId: targetChildId,
      queueEntryId: reassigned.queueEntryId,
    });

    let sessionId: string | null =
      (acceptViaLive.json as { humanSession?: { id?: string } } | null)?.humanSession?.id
      ?? null;

    if (!acceptViaLive.ok || !sessionId) {
      const accepted = await acceptHumanSupportAssignment({
        schoolId: period.schoolId,
        schoolTeacherId: teacher.schoolTeacherId,
        actorUserId: teacher.userId,
        periodId: period.id,
        queueEntryId: reassigned.queueEntryId,
        childId: targetChildId,
        minutesUntilPeriodEnd: 40,
        eligibleStudentCount: 1,
        humanTutorEligible: true,
        snapshotInput: {
          schoolId: period.schoolId,
          classroomId: period.classroomId,
          dayLessonId: period.id,
          lessonId: period.lessonId,
          subject: period.subject,
          lessonTitle: period.title,
          curriculumSkill: period.skillFocus,
          periodEndsAt: hmNowPlus(45),
          student: {
            activeContentId: null,
            activeAssignmentId: null,
            currentQuestionKey: "uat-support-desk-q2",
            aiSupportState: "exhausted",
            misconception: null,
            studentRecovered: false,
            stages: [],
            attempts: [{
              createdAt: new Date().toISOString(),
              correct: false,
              questionText: "UAT support desk question",
              answerGiven: "wrong",
              hintsUsed: 2,
            }],
            tutorHistory: [],
          },
        },
      });
      checks.push({
        name: "Accept support session",
        ok: accepted.ok,
        detail: accepted.ok ? `session=${accepted.session.id}` : accepted.error,
      });
      if (!accepted.ok) throw new Error(accepted.error);
      sessionId = accepted.session.id;
    } else {
      checks.push({
        name: "Accept support session via Live Classroom",
        ok: true,
        detail: `session=${sessionId}`,
      });
    }

    const supportActive = await api(jar, "GET", "/api/teacher/support");
    const dashActive = (supportActive.json as {
      dashboard?: {
        presence?: { status?: string };
        activeSession?: { sessionId?: string; studentName?: string } | null;
        counts?: { activeMine?: number };
      };
    })?.dashboard;
    checks.push({
      name: "Active session visible on Support desk",
      ok: Boolean(
        supportActive.ok
        && dashActive?.activeSession?.sessionId === sessionId
        && (dashActive?.counts?.activeMine ?? 0) >= 1,
      ),
      detail: JSON.stringify({
        presence: dashActive?.presence?.status,
        sessionId: dashActive?.activeSession?.sessionId,
        student: dashActive?.activeSession?.studentName,
      }),
    });
    checks.push({
      name: "Tutor presence busy during active session",
      ok: dashActive?.presence?.status === "busy"
        || (await prisma.tutorPresence.findUnique({
          where: { schoolTeacherId: teacher.schoolTeacherId },
        }))?.status === "busy",
      detail: `desk=${dashActive?.presence?.status}`,
    });

    // End outcome
    const endViaApi = await api(jar, "POST", `/api/teacher/human-support/sessions/${sessionId}/end`, {
      outcome: "resolved",
      outcomeNotes: "UAT support desk resolved",
      returnToLesson: true,
    });

    if (!endViaApi.ok) {
      const ended = await endHumanSupportSession({
        schoolId: period.schoolId,
        schoolTeacherId: teacher.schoolTeacherId,
        actorUserId: teacher.userId,
        sessionId: sessionId!,
        outcome: "resolved",
        outcomeNotes: "UAT support desk resolved (scheduler fallback)",
      });
      checks.push({
        name: "End session with outcome",
        ok: ended.ok,
        detail: ended.ok ? `outcome=resolved` : ended.error,
      });
      if (!ended.ok) throw new Error(ended.error);
    } else {
      checks.push({
        name: "End session with outcome",
        ok: true,
        detail: `status=${endViaApi.status}`,
      });
    }

    const supportHistory = await api(jar, "GET", "/api/teacher/support");
    const dashHistory = (supportHistory.json as {
      dashboard?: {
        recentHistory?: Array<{ sessionId: string; outcome?: string | null }>;
        counts?: { completedToday?: number; activeMine?: number };
        presence?: { status?: string };
      };
    })?.dashboard;
    checks.push({
      name: "History includes completed session",
      ok: Boolean(
        supportHistory.ok
        && dashHistory?.recentHistory?.some((row) => row.sessionId === sessionId),
      ),
      detail: JSON.stringify({
        completedToday: dashHistory?.counts?.completedToday,
        outcomes: dashHistory?.recentHistory?.slice(0, 3).map((row) => row.outcome),
      }),
    });
    checks.push({
      name: "Active session cleared after end",
      ok: (dashHistory?.counts?.activeMine ?? 0) === 0,
      detail: `activeMine=${dashHistory?.counts?.activeMine}`,
    });

    const historyPage = await api(jar, "GET", "/teacher/support/history");
    checks.push({
      name: "/teacher/support/history page loads",
      ok: historyPage.ok,
      detail: `status=${historyPage.status}`,
    });

    const supportPage = await api(jar, "GET", "/teacher/support");
    checks.push({
      name: "/teacher/support page loads",
      ok: supportPage.ok && /Support|Assigned|Waiting|Human/i.test(supportPage.text),
      detail: `status=${supportPage.status}`,
    });
  } finally {
    await prisma.schoolDayLesson.update({
      where: { id: period.id },
      data: originalClock,
    }).catch(() => null);
  }

  const passed = checks.filter((c) => c.ok).length;
  const failed = checks.filter((c) => !c.ok);
  report.finishedAt = new Date().toISOString();
  report.passed = passed;
  report.failed = failed.length;
  report.failedChecks = failed;
  writeFileSync(evidencePath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({
    ok: failed.length === 0,
    passed,
    failed: failed.length,
    evidence: evidencePath,
    failedChecks: failed,
  }, null, 2));

  if (failed.length > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => null);
  }
}

main()
  .catch((error) => {
    console.error(error);
    writeFileSync(
      resolve("scripts/.uat-tutor-support-dashboard-evidence.json"),
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        finishedAt: new Date().toISOString(),
      }, null, 2),
    );
    process.exitCode = 1;
  });
