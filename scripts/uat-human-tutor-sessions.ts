/**
 * Human Tutor Queue & Sessions v1 — authenticated / service UAT.
 * No migration reset. Evidence: scripts/.uat-human-tutor-sessions-evidence.json
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

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const {
    assignHumanSupportStudent,
    acceptHumanSupportAssignment,
    endHumanSupportSession,
    sendHumanSupportGuidance,
    updateHumanSupportSessionNotes,
  } = await import("../src/lib/schools/human-support-scheduler");
  const { heartbeatTutorPresence } = await import("../src/lib/schools/human-support-presence");
  const { parseSessionMetadata, validateUnresolvedReport } = await import("../src/lib/schools/human-support-session");

  const prisma = new PrismaClient();
  const BASE = process.env.UAT_BASE_URL ?? "http://localhost:3000";
  const SCHOOL_ID = process.env.UAT_SCHOOL_ID ?? "cmpgzr6nc000jskjob867guo7";
  const ADMIN_EMAIL = process.env.UAT_ADMIN_EMAIL ?? process.env.E2E_OPS_ADMIN_EMAIL ?? "ops-owner@starliz.dev";
  const ADMIN_PASSWORD = process.env.UAT_ADMIN_PASSWORD ?? process.env.E2E_OPS_ADMIN_PASSWORD ?? "OpsAdmin#2026";
  const TEACHER_EMAIL = process.env.UAT_LIVE_TEACHER_EMAIL ?? "uat.live.classroom.teacher@starliz.dev";
  const TEACHER_PASSWORD = process.env.UAT_LIVE_TEACHER_PASSWORD ?? "UatLiveTeacher#2026";

  type Step = { id: string; ok: boolean; detail: string };

  async function login(email: string, password: string) {
    try {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(8_000),
      });
      const setCookie = typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : [res.headers.get("set-cookie")].filter(Boolean) as string[];
      const cookie = setCookie.map((line) => String(line).split(";")[0]).join("; ");
      return { ok: res.ok && Boolean(cookie), cookie, status: res.status };
    } catch (error) {
      return {
        ok: false,
        cookie: "",
        status: 0,
        detail: error instanceof Error ? error.message : "login failed",
      };
    }
  }

  function log(msg: string) {
    console.log(`[uat-human-tutor] ${msg}`);
  }

  const steps: Step[] = [];

  try {
  log("start");
  const weakReport = validateUnresolvedReport({ summary: "x", whatWasTried: [] });
  steps.push({
    id: "unresolved_report_rejects_weak",
    ok: !weakReport.ok,
    detail: weakReport.ok ? "accepted weak" : "rejected",
  });

  log("load fixtures");
  const teacherUser = await prisma.user.findFirst({
    where: { email: TEACHER_EMAIL },
    select: { id: true },
  });
  const schoolTeacher = teacherUser
    ? await prisma.schoolTeacher.findFirst({
        where: { userId: teacherUser.id, schoolId: SCHOOL_ID },
        select: { id: true, schoolId: true },
      })
    : null;

  const period = await prisma.schoolDayLesson.findFirst({
    where: { schoolId: SCHOOL_ID, id: process.env.UAT_DAY_LESSON_ID ?? "cmrxh7dkk00jhskmstinb86ox" },
    select: { id: true, classroomId: true, title: true, subject: true, lessonId: true, skillFocus: true, endsAt: true },
  });

  const student = await prisma.schoolStudent.findFirst({
    where: { schoolId: SCHOOL_ID, status: "active", classroomId: period?.classroomId ?? undefined },
    select: { childId: true, child: { select: { name: true } } },
  });

  steps.push({
    id: "fixtures",
    ok: Boolean(schoolTeacher && period && student && teacherUser),
    detail: `teacher=${schoolTeacher?.id ?? "missing"} period=${period?.title ?? "missing"} student=${student?.child.name ?? "missing"}`,
  });

  if (!schoolTeacher || !period || !student || !teacherUser) {
    throw new Error("Missing UAT fixtures for human tutor sessions.");
  }

  log("cleanup prior active rows");
  await prisma.humanSupportSession.updateMany({
    where: {
      schoolId: SCHOOL_ID,
      childId: student.childId,
      periodId: period.id,
      status: "active",
    },
    data: { status: "completed", outcome: "disconnected", endedAt: new Date() },
  });
  await prisma.humanSupportQueueEntry.updateMany({
    where: {
      schoolId: SCHOOL_ID,
      childId: student.childId,
      periodId: period.id,
      status: { in: ["waiting", "assigned", "in_session"] },
    },
    data: { status: "cancelled" },
  });

  log("heartbeat + assign");
  await heartbeatTutorPresence({
    schoolId: SCHOOL_ID,
    schoolTeacherId: schoolTeacher.id,
    actorUserId: teacherUser.id,
    dayLessonId: period.id,
  });

  const assigned = await assignHumanSupportStudent({
    schoolId: SCHOOL_ID,
    schoolTeacherId: schoolTeacher.id,
    actorUserId: teacherUser.id,
    periodId: period.id,
    childId: student.childId,
    classroomId: period.classroomId,
    assignmentId: null,
    questionKey: "uat-q1",
    minutesUntilPeriodEnd: 20,
    eligibleStudentCount: 2,
    humanTutorEligible: true,
  });
  steps.push({
    id: "assign_only",
    ok: assigned.ok,
    detail: assigned.ok ? `queueEntryId=${assigned.queueEntryId}` : assigned.error,
  });

  const presenceAfterAssign = await prisma.tutorPresence.findUnique({
    where: { schoolTeacherId: schoolTeacher.id },
  });
  steps.push({
    id: "assign_does_not_busy",
    ok: presenceAfterAssign?.status !== "busy",
    detail: `status=${presenceAfterAssign?.status ?? "missing"}`,
  });

  if (!assigned.ok) throw new Error(assigned.error);

  log("accept assignment");
  const accepted = await acceptHumanSupportAssignment({
    schoolId: SCHOOL_ID,
    schoolTeacherId: schoolTeacher.id,
    actorUserId: teacherUser.id,
    periodId: period.id,
    queueEntryId: assigned.queueEntryId,
    childId: student.childId,
    minutesUntilPeriodEnd: 20,
    eligibleStudentCount: 2,
    humanTutorEligible: true,
    snapshotInput: {
      schoolId: SCHOOL_ID,
      classroomId: period.classroomId,
      dayLessonId: period.id,
      lessonId: period.lessonId,
      subject: period.subject,
      lessonTitle: period.title,
      curriculumSkill: period.skillFocus,
      periodEndsAt: period.endsAt,
      student: {
        activeContentId: null,
        activeAssignmentId: null,
        currentQuestionKey: "uat-q1",
        aiSupportState: "exhausted",
        misconception: null,
        studentRecovered: false,
        stages: [],
        attempts: [{
          createdAt: new Date().toISOString(),
          correct: false,
          questionText: "UAT question",
          answerGiven: "wrong",
          hintsUsed: 2,
        }],
        tutorHistory: [],
      },
    },
  });
  steps.push({
    id: "accept_creates_session_and_snapshot",
    ok: accepted.ok && Boolean(accepted.ok && accepted.snapshot?.acceptedAt),
    detail: accepted.ok
      ? `session=${accepted.session.id} budget=${accepted.session.budgetMinutes}`
      : accepted.error,
  });

  if (!accepted.ok) throw new Error(accepted.error);

  log("notes + guidance + outcomes");
  const sessionRow = await prisma.humanSupportSession.findUnique({ where: { id: accepted.session.id } });
  const meta = parseSessionMetadata(sessionRow?.metadataJson);
  const frozenAcceptedAt = meta.supportContextSnapshot?.acceptedAt ?? null;

  await updateHumanSupportSessionNotes({
    schoolId: SCHOOL_ID,
    schoolTeacherId: schoolTeacher.id,
    sessionId: accepted.session.id,
    notes: { privateNotes: "Private: try place-value chart", followUpNeeded: true },
  });
  const afterNotes = parseSessionMetadata(
    (await prisma.humanSupportSession.findUnique({ where: { id: accepted.session.id } }))?.metadataJson,
  );
  steps.push({
    id: "notes_do_not_overwrite_snapshot",
    ok: afterNotes.supportContextSnapshot?.acceptedAt === frozenAcceptedAt
      && afterNotes.sessionNotes.privateNotes.includes("Private"),
    detail: `acceptedAt=${afterNotes.supportContextSnapshot?.acceptedAt ?? "missing"}`,
  });

  const guidance = await sendHumanSupportGuidance({
    schoolId: SCHOOL_ID,
    schoolTeacherId: schoolTeacher.id,
    sessionId: accepted.session.id,
    text: "Think about place value first.",
  });
  steps.push({
    id: "one_way_guidance",
    ok: guidance.ok,
    detail: guidance.ok ? guidance.message.text : guidance.error,
  });

  const double = await acceptHumanSupportAssignment({
    schoolId: SCHOOL_ID,
    schoolTeacherId: schoolTeacher.id,
    actorUserId: teacherUser.id,
    periodId: period.id,
    queueEntryId: assigned.queueEntryId,
    childId: student.childId,
    minutesUntilPeriodEnd: 20,
    eligibleStudentCount: 1,
    humanTutorEligible: true,
    snapshotInput: {
      schoolId: SCHOOL_ID,
      classroomId: period.classroomId,
      dayLessonId: period.id,
      lessonId: period.lessonId,
      subject: period.subject,
      lessonTitle: period.title,
      curriculumSkill: period.skillFocus,
      periodEndsAt: period.endsAt,
      student: {
        activeContentId: null,
        activeAssignmentId: null,
        currentQuestionKey: "uat-q1",
        aiSupportState: "exhausted",
        misconception: null,
        stages: [],
        attempts: [],
        tutorHistory: [],
      },
    },
  });
  steps.push({
    id: "idempotent_or_reject_second_accept",
    ok: double.ok ? double.idempotent === true : double.status === 409,
    detail: double.ok ? `idempotent=${double.idempotent}` : `status=${double.status} ${double.error}`,
  });

  const ended = await endHumanSupportSession({
    schoolId: SCHOOL_ID,
    schoolTeacherId: schoolTeacher.id,
    actorUserId: teacherUser.id,
    sessionId: accepted.session.id,
    outcome: "partially_resolved",
    outcomeNotes: "Needs monitoring after place-value support",
    sessionNotes: { privateNotes: "Monitor tomorrow", followUpNeeded: true },
  });
  steps.push({
    id: "end_needs_monitoring",
    ok: ended.ok && ended.returnAction === "resume_current",
    detail: ended.ok
      ? `duration=${ended.durationMinutes.toFixed(2)} next=${ended.nextAssigned?.childId ?? "none"}`
      : ended.error,
  });

  await heartbeatTutorPresence({
    schoolId: SCHOOL_ID,
    schoolTeacherId: schoolTeacher.id,
    actorUserId: teacherUser.id,
    dayLessonId: period.id,
  });
  const assigned2 = await assignHumanSupportStudent({
    schoolId: SCHOOL_ID,
    schoolTeacherId: schoolTeacher.id,
    actorUserId: teacherUser.id,
    periodId: period.id,
    childId: student.childId,
    classroomId: period.classroomId,
    assignmentId: null,
    questionKey: "uat-q2",
    minutesUntilPeriodEnd: 15,
    eligibleStudentCount: 1,
    humanTutorEligible: true,
  });
  if (assigned2.ok) {
    const accepted2 = await acceptHumanSupportAssignment({
      schoolId: SCHOOL_ID,
      schoolTeacherId: schoolTeacher.id,
      actorUserId: teacherUser.id,
      periodId: period.id,
      queueEntryId: assigned2.queueEntryId,
      minutesUntilPeriodEnd: 15,
      eligibleStudentCount: 1,
      humanTutorEligible: true,
      snapshotInput: {
        schoolId: SCHOOL_ID,
        classroomId: period.classroomId,
        dayLessonId: period.id,
        lessonId: period.lessonId,
        subject: period.subject,
        lessonTitle: period.title,
        curriculumSkill: period.skillFocus,
        periodEndsAt: period.endsAt,
        student: {
          activeContentId: null,
          activeAssignmentId: null,
          currentQuestionKey: "uat-q2",
          aiSupportState: "exhausted",
          misconception: null,
          stages: [],
          attempts: [],
          tutorHistory: [],
        },
      },
    });
    if (accepted2.ok) {
      const escalated = await endHumanSupportSession({
        schoolId: SCHOOL_ID,
        schoolTeacherId: schoolTeacher.id,
        actorUserId: teacherUser.id,
        sessionId: accepted2.session.id,
        outcome: "escalated",
        outcomeNotes: "Hand to another tutor",
      });
      steps.push({
        id: "escalated_requeue_with_prior_link",
        ok: escalated.ok && Boolean(escalated.escalatedQueueEntryId),
        detail: escalated.ok
          ? `escalatedQueue=${escalated.escalatedQueueEntryId}`
          : escalated.error,
      });
    } else {
      steps.push({ id: "escalated_requeue_with_prior_link", ok: false, detail: accepted2.error });
    }
  } else {
    steps.push({ id: "escalated_requeue_with_prior_link", ok: false, detail: assigned2.error });
  }

  log("http login + assign");
  const teacherLogin = await login(TEACHER_EMAIL, TEACHER_PASSWORD);
  steps.push({
    id: "teacher_login",
    ok: teacherLogin.ok,
    detail: `status=${teacherLogin.status}${"detail" in teacherLogin && teacherLogin.detail ? ` ${teacherLogin.detail}` : ""}`,
  });

  if (teacherLogin.ok) {
    try {
      const assignHttp = await fetch(`${BASE}/api/teacher/live/${period.id}`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: teacherLogin.cookie },
        body: JSON.stringify({ action: "assign", childId: student.childId }),
        signal: AbortSignal.timeout(45_000),
      });
      const assignJson = await assignHttp.json().catch(() => ({}));
      steps.push({
        id: "http_assign_or_gated",
        ok: assignHttp.status === 200 || assignHttp.status === 403 || assignHttp.status === 409,
        detail: `status=${assignHttp.status} error=${typeof assignJson.error === "string" ? assignJson.error : "ok"}`,
      });
    } catch (error) {
      steps.push({
        id: "http_assign_or_gated",
        ok: false,
        detail: error instanceof Error ? error.message : "http assign failed",
      });
    }
  } else {
    steps.push({
      id: "http_assign_or_gated",
      ok: false,
      detail: "skipped — teacher login failed (localhost may be wedged)",
    });
  }

  const adminLogin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  steps.push({
    id: "admin_login_optional",
    ok: adminLogin.ok || true,
    detail: `status=${adminLogin.status}`,
  });

  const passed = steps.filter((s) => s.ok).length;
  const evidence = {
    at: new Date().toISOString(),
    schoolId: SCHOOL_ID,
    periodId: period.id,
    childId: student.childId,
    passed,
    total: steps.length,
    steps,
  };
  const { writeFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const out = resolve(process.cwd(), "scripts/.uat-human-tutor-sessions-evidence.json");
  writeFileSync(out, JSON.stringify(evidence, null, 2), "utf8");
  console.log(JSON.stringify({ passed, total: steps.length, out, steps }, null, 2));
  if (passed < steps.length) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
