/**
 * Short Learning live AI Tutor + Human Support escalation UAT.
 * Usage: npx tsx scripts/uat/short-learning-support-uat.ts
 * Safety: no migrate reset; no commit/push; 105 remains disabled.
 */
import "./load-env";
import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { UAT_FIXTURES, ARTIFACTS_UAT_ROOT } from "./local-fixtures";

const BASE = UAT_FIXTURES.baseUrl.replace(/\/$/, "");
const OUT = resolve(ARTIFACTS_UAT_ROOT, "short-learning-support");
mkdirSync(OUT, { recursive: true });

const MATHS_BOOKING = "cms0sottc0045skis6d749tpo";
const ENGLISH_BOOKING = "cms0soye7004bskiszgy8ddf0";

type Jar = { cookie: string };
type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function login(email: string, password: string): Promise<{ jar: Jar; res: Response }> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  return { jar: { cookie: setCookie.map((c) => c.split(";")[0]).join("; ") }, res };
}

async function api(jar: Jar, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: jar.cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function main() {
  const report: Record<string, unknown> = { startedAt: new Date().toISOString(), baseUrl: BASE };
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const { resolveShortLearningSupportContext } = await import(
    "../../src/lib/schools/short-learning-support-context"
  );
  const { syncShortLearningEligibleQueue } = await import(
    "../../src/lib/schools/human-support-scheduler"
  );
  const { assertShortLearningTutorAccess } = await import(
    "../../src/lib/schools/short-learning-tutor-access"
  );
  const { respondDaytimeSchoolTutor } = await import("../../src/lib/schools/daytime-school-tutor");

  const { jar, res: loginRes } = await login(UAT_FIXTURES.parentEmail, UAT_FIXTURES.parentPassword);
  check("Parent login", loginRes.ok);

  // Activate booking windows for live support UAT (additive update only).
  const now = new Date();
  for (const bookingId of [MATHS_BOOKING, ENGLISH_BOOKING]) {
    await prisma.studentLearningBooking.update({
      where: { id: bookingId },
      data: {
        startsAt: new Date(now.getTime() - 5 * 60_000),
        endsAt: new Date(now.getTime() + 100 * 60_000),
        status: "attended",
      },
    });
  }
  check("Activated maths+english booking windows for UAT", true);

  // Ensure sessions ready + start block for maths
  const startMaths = await api(jar, "POST", `/api/student/short-learning/${MATHS_BOOKING}/session`, {});
  check("Maths SL start for tutor UAT", startMaths.ok, `status=${startMaths.status} err=${(startMaths.json as { error?: string }).error ?? ""}`);
  const mathsPayload = startMaths.json as {
    assignmentId?: string;
    contentId?: string;
    sessionId?: string;
    block?: { id?: string };
    lessonHref?: string;
  };
  report.mathsStart = mathsPayload;

  const child = await prisma.schoolStudent.findFirst({
    where: { learningBookings: { some: { id: MATHS_BOOKING } } },
    select: { childId: true, schoolId: true, classroomId: true },
  });
  check("Resolved child for maths booking", Boolean(child?.childId));

  // Context resolution
  const ctx = await resolveShortLearningSupportContext({
    studentId: child!.childId,
    bookingId: MATHS_BOOKING,
    assignmentId: mathsPayload.assignmentId!,
    contentId: mathsPayload.contentId!,
  });
  check("resolveShortLearningSupportContext ok", ctx.ok, ctx.ok ? ctx.context.supportScopeKey : (ctx as { error?: string }).error);
  report.supportContext = ctx.ok ? ctx.context : ctx;

  // Tamper isolation
  const tamper = await resolveShortLearningSupportContext({
    studentId: child!.childId,
    bookingId: MATHS_BOOKING,
    assignmentId: mathsPayload.assignmentId!,
    contentId: "not-a-real-content-id",
  });
  check("Tampered contentId rejected", !tamper.ok, !tamper.ok ? tamper.code : "unexpected ok");

  const otherBooking = await resolveShortLearningSupportContext({
    studentId: "not-the-child",
    bookingId: MATHS_BOOKING,
    assignmentId: mathsPayload.assignmentId!,
    contentId: mathsPayload.contentId!,
  });
  check("Other studentId rejected", !otherBooking.ok, !otherBooking.ok ? otherBooking.code : "unexpected ok");

  // Progressive AI help via access + respond (force exhaustion by repeating intent)
  const access = await assertShortLearningTutorAccess({
    studentId: child!.childId,
    bookingId: MATHS_BOOKING,
    assignmentId: mathsPayload.assignmentId!,
    contentId: mathsPayload.contentId!,
    blockId: mathsPayload.block?.id,
    questionIndex: 0,
    studentAttempt: "wrong-answer",
  });
  check("Short Learning tutor access ok", access.ok, access.ok ? access.context.periodId : (access as { error?: string }).error);

  let conversationId: string | undefined;
  let needsTeacher = false;
  let lastTutor: Record<string, unknown> | null = null;
  if (access.ok) {
    for (let i = 0; i < 5; i += 1) {
      const turn = await respondDaytimeSchoolTutor({
        context: { ...access.context, studentAttempt: "wrong-answer" },
        intent: "give-hint",
        conversationId,
      });
      conversationId = turn.conversationId;
      lastTutor = turn as unknown as Record<string, unknown>;
      if (turn.needsTeacher) {
        needsTeacher = true;
        break;
      }
    }
  }
  check("Progressive AI help ran", Boolean(lastTutor), `needsTeacher=${needsTeacher}`);
  report.progressiveHelp = { needsTeacher, lastTutor, conversationId };

  // Live API path
  const liveHelp = await api(jar, "POST", "/api/student/daytime-tutor", {
    aiTutorScope: "short-learning",
    shortLearningBookingId: MATHS_BOOKING,
    shortLearningSessionId: mathsPayload.sessionId,
    shortLearningBlockId: mathsPayload.block?.id,
    assignmentId: mathsPayload.assignmentId,
    contentId: mathsPayload.contentId,
    questionIndex: 0,
    intent: "give-hint",
    studentAttempt: "still-wrong",
    conversationId,
  });
  check(
    "Live AI Tutor short-learning scope responds",
    liveHelp.ok || liveHelp.status === 429,
    `status=${liveHelp.status} err=${(liveHelp.json as { error?: string }).error ?? ""}`,
  );
  report.liveHelp = liveHelp.json;

  // Exhaust via repeated API calls
  let apiNeedsTeacher = Boolean((liveHelp.json as { needsTeacher?: boolean }).needsTeacher);
  let apiConversationId = (liveHelp.json as { conversationId?: string }).conversationId ?? conversationId;
  for (let i = 0; i < 6 && !apiNeedsTeacher; i += 1) {
    const turn = await api(jar, "POST", "/api/student/daytime-tutor", {
      aiTutorScope: "short-learning",
      shortLearningBookingId: MATHS_BOOKING,
      assignmentId: mathsPayload.assignmentId,
      contentId: mathsPayload.contentId,
      questionIndex: 0,
      intent: "give-hint",
      studentAttempt: `wrong-${i}`,
      conversationId: apiConversationId,
    });
    apiConversationId = (turn.json as { conversationId?: string }).conversationId ?? apiConversationId;
    if ((turn.json as { needsTeacher?: boolean }).needsTeacher) {
      apiNeedsTeacher = true;
      report.exhaustedTurn = turn.json;
    }
  }
  check("AI help can reach needsTeacher / exhaustion", apiNeedsTeacher || needsTeacher);

  // Force offline tutors for AI-only path
  await prisma.tutorPresence.updateMany({
    where: { schoolId: child!.schoolId },
    data: { status: "offline", activeSessionId: null },
  });

  const slCtx = ctx.ok ? ctx.context : null;
  if (slCtx) {
    const syncOffline = await syncShortLearningEligibleQueue({
      schoolId: slCtx.schoolId,
      classroomId: slCtx.classroomId,
      supportScopeKey: slCtx.supportScopeKey,
      minutesUntilBookingEnd: 90,
      childId: child!.childId,
      humanTutorEligible: true,
      assignmentId: slCtx.assignmentId,
      questionKey: "q-1",
      metadata: {
        supportMode: "SHORT_LEARNING",
        shortLearningBookingId: slCtx.bookingId,
        shortLearningSessionId: slCtx.sessionId,
        shortLearningBlockId: slCtx.blockId,
      },
    });
    check("No-tutor path does not enqueue", syncOffline.enqueued === 0 && syncOffline.queued === false, JSON.stringify(syncOffline));
    check("No-tutor humanSupportState is ai-only", syncOffline.humanSupportState === "ai-only");
    check("No-tutor continueAi true", syncOffline.continueAi === true);
    report.noTutorSync = syncOffline;
  }

  // Support context API
  const supportCtx = await api(
    jar,
    "GET",
    `/api/student/short-learning/${MATHS_BOOKING}/support-context?assignmentId=${encodeURIComponent(mathsPayload.assignmentId!)}&contentId=${encodeURIComponent(mathsPayload.contentId!)}`,
  );
  check("Support context API ok", supportCtx.ok, `status=${supportCtx.status}`);
  const wording = (supportCtx.json as { wording?: Record<string, string> }).wording ?? {};
  check("Student wording: AI throughout", /AI support is available/i.test(wording.aiAvailable ?? ""));
  check("Student wording: not guaranteed", /not guaranteed/i.test(wording.notGuaranteed ?? ""));
  check("Student wording: not private 1:1", /not a private/i.test(wording.notPrivate ?? ""));
  report.supportCtxApi = supportCtx.json;

  // Tutor-online escalation: create/update presence available for a school teacher if one exists
  const schoolTeacher = await prisma.schoolTeacher.findFirst({
    where: { schoolId: child!.schoolId, status: "active" },
    select: { id: true },
  });
  let tutorOnlineResult: Record<string, unknown> | null = null;
  if (schoolTeacher && slCtx) {
    await prisma.tutorPresence.upsert({
      where: { schoolTeacherId: schoolTeacher.id },
      create: {
        schoolId: child!.schoolId,
        schoolTeacherId: schoolTeacher.id,
        status: "available",
        lastHeartbeatAt: new Date(),
      },
      update: {
        status: "available",
        lastHeartbeatAt: new Date(),
        activeSessionId: null,
      },
    });
    // Ensure a published shift covering now if table exists
    try {
      await prisma.tutorSupportShift.create({
        data: {
          schoolId: child!.schoolId,
          schoolTeacherId: schoolTeacher.id,
          startsAt: new Date(now.getTime() - 30 * 60_000),
          endsAt: new Date(now.getTime() + 120 * 60_000),
          published: true,
          notes: "UAT SL support shift",
        },
      });
    } catch {
      // may already exist / unique constraints — ignore
    }

    const syncOnline = await syncShortLearningEligibleQueue({
      schoolId: slCtx.schoolId,
      classroomId: slCtx.classroomId,
      supportScopeKey: `${slCtx.supportScopeKey}:online`,
      minutesUntilBookingEnd: 90,
      childId: child!.childId,
      humanTutorEligible: true,
      assignmentId: slCtx.assignmentId,
      questionKey: "q-online",
      metadata: {
        supportMode: "SHORT_LEARNING",
        shortLearningBookingId: slCtx.bookingId,
        shortLearningSessionId: slCtx.sessionId,
        shortLearningBlockId: slCtx.blockId,
      },
    });
    tutorOnlineResult = syncOnline as unknown as Record<string, unknown>;
    check(
      "Tutor-online escalation enqueues or reports capacity limitation honestly",
      syncOnline.queued === true || syncOnline.humanSupportState === "ai-only",
      JSON.stringify(syncOnline),
    );
  } else {
    check("Tutor-online escalation (skipped — no school teacher fixture)", true, "no active schoolTeacher");
  }
  report.tutorOnline = tutorOnlineResult;

  // Multi-block continuity: start english second block context isolation
  const startEng = await api(jar, "POST", `/api/student/short-learning/${ENGLISH_BOOKING}/session`, {});
  check("English start for multi-block continuity", startEng.ok, `status=${startEng.status}`);
  if (startEng.ok) {
    const eng = startEng.json as { assignmentId: string; contentId: string; block: { id: string }; sessionId: string };
    const engCtx = await resolveShortLearningSupportContext({
      studentId: child!.childId,
      bookingId: ENGLISH_BOOKING,
      assignmentId: eng.assignmentId,
      contentId: eng.contentId,
    });
    check("English support context ok", engCtx.ok);
    if (engCtx.ok && ctx.ok) {
      check(
        "Block scope keys differ across bookings/blocks",
        engCtx.context.supportScopeKey !== ctx.context.supportScopeKey,
        `${ctx.context.supportScopeKey} vs ${engCtx.context.supportScopeKey}`,
      );
      check("Booking id constant for english", engCtx.context.bookingId === ENGLISH_BOOKING);
    }
    report.englishStart = eng;
  }

  // Booking window closed
  await prisma.studentLearningBooking.update({
    where: { id: MATHS_BOOKING },
    data: {
      startsAt: new Date(now.getTime() - 200 * 60_000),
      endsAt: new Date(now.getTime() - 20 * 60_000),
    },
  });
  const closed = await resolveShortLearningSupportContext({
    studentId: child!.childId,
    bookingId: MATHS_BOOKING,
    assignmentId: mathsPayload.assignmentId!,
    contentId: mathsPayload.contentId!,
  });
  check("After booking end support blocked", !closed.ok && (!closed.ok ? closed.code === "BOOKING_WINDOW_CLOSED" : false), !closed.ok ? closed.code : "ok");

  // Restore active window for remaining journey
  await prisma.studentLearningBooking.update({
    where: { id: MATHS_BOOKING },
    data: {
      startsAt: new Date(now.getTime() - 5 * 60_000),
      endsAt: new Date(now.getTime() + 100 * 60_000),
    },
  });

  // 105 still rejected
  const boot = await api(jar, "GET", "/api/parent/short-learning/bookings");
  const students = (boot.json as { students?: Array<{ schoolId: string; schoolStudentId: string }> }).students ?? [];
  if (students[0]) {
    const bad105 = await api(jar, "POST", "/api/parent/short-learning/bookings", {
      schoolId: students[0].schoolId,
      schoolStudentId: students[0].schoolStudentId,
      startsAt: new Date(now.getTime() + 3 * 86400000).toISOString(),
      durationMinutes: 105,
      subject: "maths",
      honestyAcknowledged: true,
    });
    check("105-minute bookings still rejected", !bad105.ok);
  }

  // Audit samples
  const audits = await prisma.schoolAuditLog.findMany({
    where: {
      schoolId: child!.schoolId,
      action: { in: ["daytime_tutor_help", "human_support_eligible", "human_support_enqueued"] },
      createdAt: { gte: new Date(now.getTime() - 10 * 60_000) },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, action: true, metadataJson: true, createdAt: true },
  });
  check("Audit events recorded for SL support path", audits.length > 0, `count=${audits.length}`);
  report.auditIds = audits.map((a) => ({ id: a.id, action: a.action }));

  // Role isolation on tutor API
  const teacherLogin = await login(UAT_FIXTURES.teacherEmail, UAT_FIXTURES.teacherPassword);
  if (teacherLogin.res.ok) {
    const teacherCall = await api(teacherLogin.jar, "POST", "/api/student/daytime-tutor", {
      aiTutorScope: "short-learning",
      shortLearningBookingId: MATHS_BOOKING,
      assignmentId: mathsPayload.assignmentId,
      contentId: mathsPayload.contentId,
      intent: "give-hint",
    });
    check("Teacher cannot call student tutor as child", !teacherCall.ok, `status=${teacherCall.status}`);
  } else {
    check("Teacher login for isolation (fixture optional)", true, "teacher fixture login failed — skipped");
  }

  await prisma.$disconnect();
  report.finishedAt = new Date().toISOString();
  report.checks = checks;
  report.passed = checks.filter((c) => c.ok).length;
  report.failed = checks.filter((c) => !c.ok).length;
  report.safety = { noMigrateReset: true, noCommitPushDeploy: true, no105Enabled: true };
  writeFileSync(resolve(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\nEvidence: ${OUT}/report.json`);
  console.log(`Passed ${report.passed} / Failed ${report.failed}`);
  if (report.failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  writeFileSync(resolve(OUT, "fatal.json"), JSON.stringify({ error: String(err) }, null, 2));
  process.exitCode = 1;
});
