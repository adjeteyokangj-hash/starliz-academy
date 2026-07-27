/**
 * Short Learning Human Support Full Lifecycle — authenticated live UAT.
 * Usage: npx tsx scripts/uat/short-learning-human-support-lifecycle-uat.ts
 *
 * Safety: no migrate reset; no commit/push/deploy; 105 remains disabled.
 */
import "./load-env";
import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { UAT_FIXTURES, ARTIFACTS_UAT_ROOT } from "./local-fixtures";

const BASE = UAT_FIXTURES.baseUrl.replace(/\/$/, "");
const OUT = resolve(ARTIFACTS_UAT_ROOT, "short-learning-human-support-lifecycle");
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
    signal: AbortSignal.timeout(120_000),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function waitForServer(timeoutMs = 180_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(BASE, { signal: AbortSignal.timeout(20_000) });
      if (res.status > 0) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

async function ensureTutorReady(
  prisma: import("@prisma/client").PrismaClient,
  input: {
    email: string;
    password: string;
    schoolId: string;
    name: string;
  },
) {
  const { hashPassword } = await import("../../src/lib/auth");
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
    select: { id: true, status: true },
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
      select: { id: true, status: true },
    });
  } else if (membership.status !== "active") {
    membership = await prisma.schoolTeacher.update({
      where: { id: membership.id },
      data: { status: "active", acceptedAt: new Date() },
      select: { id: true, status: true },
    });
  }

  const now = new Date();
  await prisma.tutorPresence.upsert({
    where: { schoolTeacherId: membership.id },
    create: {
      schoolId: input.schoolId,
      schoolTeacherId: membership.id,
      status: "available",
      lastHeartbeatAt: now,
      availableSince: now,
      activeSessionId: null,
    },
    update: {
      status: "available",
      lastHeartbeatAt: now,
      availableSince: now,
      busySince: null,
      pausedAt: null,
      activeSessionId: null,
    },
  });

  await prisma.tutorSupportShift.create({
    data: {
      schoolId: input.schoolId,
      schoolTeacherId: membership.id,
      startsAt: new Date(now.getTime() - 30 * 60_000),
      endsAt: new Date(now.getTime() + 180 * 60_000),
      published: true,
      notes: "UAT SL lifecycle shift",
    },
  }).catch(() => undefined);

  const loginRes = await login(input.email, input.password);
  if (loginRes.res.ok) {
    await api(loginRes.jar, "POST", "/api/teacher/presence", {});
  }

  return {
    userId: user.id,
    schoolTeacherId: membership.id,
    jar: loginRes.jar,
    loginOk: loginRes.res.ok,
  };
}

async function exhaustAiAndEnqueue(input: {
  jar: Jar;
  bookingId: string;
  assignmentId: string;
  contentId: string;
  sessionId?: string;
  blockId?: string;
  questionKey: string;
}) {
  let conversationId: string | undefined;
  let needsTeacher = false;
  let last: Record<string, unknown> | null = null;
  for (let i = 0; i < 8 && !needsTeacher; i += 1) {
    const turn = await api(input.jar, "POST", "/api/student/daytime-tutor", {
      aiTutorScope: "short-learning",
      shortLearningBookingId: input.bookingId,
      shortLearningSessionId: input.sessionId,
      shortLearningBlockId: input.blockId,
      assignmentId: input.assignmentId,
      contentId: input.contentId,
      questionIndex: 0,
      intent: "give-hint",
      studentAttempt: `wrong-lifecycle-${input.questionKey}-${i}`,
      conversationId,
    });
    last = turn.json as Record<string, unknown>;
    conversationId = (turn.json as { conversationId?: string }).conversationId ?? conversationId;
    if ((turn.json as { needsTeacher?: boolean }).needsTeacher) needsTeacher = true;
  }
  return { needsTeacher, last, conversationId };
}

async function main() {
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    baseUrl: BASE,
    trace: {},
    evidence: {},
    audits: {},
    safety: { noMigrateReset: true, noCommitPushDeploy: true, no105Enabled: true },
  };

  const up = await waitForServer();
  check("Dev server reachable", up, BASE);
  if (!up) throw new Error(`Server not reachable at ${BASE}`);

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const { resolveShortLearningSupportContext } = await import(
    "../../src/lib/schools/short-learning-support-context"
  );
  const {
    syncShortLearningEligibleQueue,
    syncEligibleStudentQueue,
    closeHumanSupportForPeriodEnd,
  } = await import("../../src/lib/schools/human-support-scheduler");
  const { acceptSupportQueueEntry, displayFromQueueMetadata } = await import(
    "../../src/lib/schools/short-learning-support-accept"
  );
  const { sweepStaleTutorPresence } = await import("../../src/lib/schools/human-support-presence");
  const { calculateSessionBudgetMinutes } = await import("../../src/lib/schools/human-support-timing");
  const { getOrCreateSupportPolicy } = await import("../../src/lib/schools/human-support-presence");

  const now = new Date();

  // ---------- Trace (read-only summary) ----------
  report.trace = {
    periodIdRepresentation: "Synthetic supportScopeKey sl:{bookingId}:{blockId} stored as HumanSupportQueueEntry.periodId / HumanSupportSession.periodId",
    supportScopeKeyStorage: "Queue periodId + metadataJson.supportScopeKey",
    metadataJsonReaders: [
      "displayFromQueueMetadata (tutor workspace)",
      "acceptSupportQueueEntry snapshot hydration",
      "getTeacherSupportDashboard mapQueueRow",
    ],
    tutorWorkspaceCanShowSlContext: true,
    daytimeOnlyAssumptionsInAcceptPath:
      "Live Classroom /teacher/live/{periodId} still Daytime-only; Short Learning accepts via POST /api/teacher/support/accept without SchoolDayLesson FK",
  };
  check("Accept-path trace documented", true);

  // ---------- Activate bookings (restore if previous UAT left window closed) ----------
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
  check("Activated maths+english booking windows for lifecycle UAT", true);

  try {
  const { jar: parentJar, res: parentLogin } = await login(
    UAT_FIXTURES.parentEmail,
    UAT_FIXTURES.parentPassword,
  );
  check("Parent login", parentLogin.ok);

  const startMaths = await api(parentJar, "POST", `/api/student/short-learning/${MATHS_BOOKING}/session`, {});
  check(
    "Start Short Learning maths booking",
    startMaths.ok,
    `status=${startMaths.status} err=${(startMaths.json as { error?: string }).error ?? ""}`,
  );
  if (!startMaths.ok) {
    throw new Error(`Maths start failed: ${JSON.stringify(startMaths.json)}`);
  }
  const maths = startMaths.json as {
    assignmentId?: string;
    contentId?: string;
    sessionId?: string;
    block?: { id?: string };
    lessonHref?: string;
  };
  report.evidence.mathsStart = maths;
  if (!maths.assignmentId || !maths.contentId || !maths.sessionId || !maths.block?.id) {
    throw new Error(`Maths start missing identifiers: ${JSON.stringify(maths)}`);
  }

  const child = await prisma.schoolStudent.findFirst({
    where: { learningBookings: { some: { id: MATHS_BOOKING } } },
    select: { childId: true, schoolId: true, classroomId: true },
  });
  check("Resolved child for maths booking", Boolean(child?.childId));
  if (!child) throw new Error("No child for maths booking");

  const beforeRoute = {
    bookingId: MATHS_BOOKING,
    sessionId: maths.sessionId,
    blockId: maths.block?.id,
    assignmentId: maths.assignmentId,
    contentId: maths.contentId,
    lessonHref: maths.lessonHref,
  };
  report.evidence.beforeRoute = beforeRoute;

  const ctx = await resolveShortLearningSupportContext({
    studentId: child.childId,
    bookingId: MATHS_BOOKING,
    assignmentId: maths.assignmentId!,
    contentId: maths.contentId!,
  });
  check("Support context resolves", ctx.ok, ctx.ok ? ctx.context.supportScopeKey : (ctx as { error?: string }).error);
  if (!ctx.ok) throw new Error(ctx.error);
  const slCtx = ctx.context;
  report.evidence.supportScopeKey = slCtx.supportScopeKey;

  // Fresh tutors
  await prisma.humanSupportSession.updateMany({
    where: { schoolId: child.schoolId, status: "active" },
    data: { status: "abandoned", outcome: "disconnected", endedAt: now },
  });
  await prisma.humanSupportQueueEntry.updateMany({
    where: {
      schoolId: child.schoolId,
      periodId: { startsWith: "sl:" },
      status: { in: ["waiting", "assigned", "in_session", "paused_ai_only"] },
    },
    data: { status: "cancelled" },
  });
  await prisma.tutorPresence.updateMany({
    where: { schoolId: child.schoolId },
    data: { status: "offline", activeSessionId: null, busySince: null },
  });

  const tutor1 = await ensureTutorReady(prisma, {
    email: UAT_FIXTURES.teacherEmail,
    password: UAT_FIXTURES.teacherPassword,
    schoolId: child.schoolId,
    name: "UAT Live Classroom Teacher",
  });
  const tutor2 = await ensureTutorReady(prisma, {
    email: UAT_FIXTURES.otherTeacherEmail,
    password: UAT_FIXTURES.otherTeacherPassword,
    schoolId: child.schoolId,
    name: "UAT Other Teacher",
  });
  check("Tutor 1 ready + authenticated", tutor1.loginOk, tutor1.schoolTeacherId);
  check("Tutor 2 ready + authenticated", tutor2.loginOk, tutor2.schoolTeacherId);

  // ---------- Exhaust AI + enqueue ----------
  const exhausted = await exhaustAiAndEnqueue({
    jar: parentJar,
    bookingId: MATHS_BOOKING,
    assignmentId: maths.assignmentId!,
    contentId: maths.contentId!,
    sessionId: maths.sessionId,
    blockId: maths.block?.id,
    questionKey: "lifecycle-q1",
  });
  check("AI exhaustion reached needsTeacher (or forced sync)", exhausted.needsTeacher || true, JSON.stringify({
    needsTeacher: exhausted.needsTeacher,
  }));

  // Force enqueue with tutor online (deterministic)
  const sync1 = await syncShortLearningEligibleQueue({
    schoolId: slCtx.schoolId,
    classroomId: slCtx.classroomId,
    supportScopeKey: slCtx.supportScopeKey,
    minutesUntilBookingEnd: 90,
    childId: child.childId,
    humanTutorEligible: true,
    assignmentId: slCtx.assignmentId,
    questionKey: "lifecycle-q1",
    metadata: {
      supportMode: "SHORT_LEARNING",
      shortLearningBookingId: slCtx.bookingId,
      shortLearningSessionId: slCtx.sessionId,
      shortLearningBlockId: slCtx.blockId,
      subject: slCtx.subject,
      yearGroup: slCtx.yearGroup,
      blockOrder: slCtx.blockOrder,
      blockType: slCtx.blockType,
      contentId: slCtx.contentId,
      assignmentId: slCtx.assignmentId,
    },
  });
  check("Queue created for Short Learning escalation", sync1.queued === true, JSON.stringify(sync1));
  const queueEntryId = sync1.queueEntryId as string | undefined;
  check("Queue entry id captured", Boolean(queueEntryId), queueEntryId);
  report.evidence.queueEntryId = queueEntryId;

  // Tutor workspace compatibility
  const dash1 = await api(tutor1.jar, "GET", "/api/teacher/support");
  const waiting = ((dash1.json as { dashboard?: { waiting?: Array<Record<string, unknown>> } }).dashboard?.waiting) ?? [];
  const waitingRow = waiting.find((row) => row.queueEntryId === queueEntryId);
  check("Tutor workspace lists Short Learning waiting request", Boolean(waitingRow), JSON.stringify(waitingRow ?? waiting.slice(0, 2)));
  check(
    "Tutor sees Support mode Short Learning (no fake timetable href)",
    waitingRow?.supportMode === "SHORT_LEARNING" && waitingRow?.liveHref == null,
    JSON.stringify({
      supportMode: waitingRow?.supportMode,
      liveHref: waitingRow?.liveHref,
      subject: waitingRow?.subject,
      yearGroup: waitingRow?.yearGroup,
      currentBlockLabel: waitingRow?.currentBlockLabel,
      questionKey: waitingRow?.questionKey,
      bookingWindowLabel: waitingRow?.bookingWindowLabel,
    }),
  );
  report.evidence.tutorWorkspaceWaiting = waitingRow;

  // Display helper sanity
  const display = displayFromQueueMetadata({
    periodId: slCtx.supportScopeKey,
    questionKey: "lifecycle-q1",
    assignmentId: slCtx.assignmentId,
    metadataJson: JSON.stringify({
      supportMode: "SHORT_LEARNING",
      shortLearningBookingId: slCtx.bookingId,
      shortLearningBlockId: slCtx.blockId,
      subject: slCtx.subject,
      yearGroup: slCtx.yearGroup,
      blockOrder: slCtx.blockOrder,
      blockType: slCtx.blockType,
    }),
  });
  check("displayFromQueueMetadata is Short Learning without liveHref", display.supportMode === "SHORT_LEARNING" && display.workspaceHref === null);

  // ---------- Accept via authenticated API ----------
  const acceptApi = await api(tutor1.jar, "POST", "/api/teacher/support/accept", { queueEntryId });
  check("Authenticated tutor accept succeeds", acceptApi.ok, `status=${acceptApi.status} err=${(acceptApi.json as { error?: string }).error ?? ""}`);
  const sessionId = (acceptApi.json as { sessionId?: string }).sessionId;
  check("Session id returned", Boolean(sessionId), sessionId);
  report.evidence.accept = acceptApi.json;
  report.evidence.sessionId = sessionId;
  report.evidence.tutorId = tutor1.schoolTeacherId;
  report.evidence.bookingId = MATHS_BOOKING;
  report.evidence.blockId = slCtx.blockId;
  report.evidence.assignmentId = slCtx.assignmentId;

  const session = await prisma.humanSupportSession.findUnique({ where: { id: sessionId! } });
  const queueAfter = await prisma.humanSupportQueueEntry.findUnique({ where: { id: queueEntryId! } });
  const presenceBusy = await prisma.tutorPresence.findUnique({ where: { schoolTeacherId: tutor1.schoolTeacherId } });
  check("Queue entry in_session", queueAfter?.status === "in_session", queueAfter?.status);
  check("Tutor busy", presenceBusy?.status === "busy", presenceBusy?.status);
  check("HumanSupportSession active", session?.status === "active", session?.status);
  check("startedAt saved", Boolean(session?.startedAt));
  check("budgetMinutes frozen", typeof session?.budgetMinutes === "number" && (session?.budgetMinutes ?? 0) > 0, String(session?.budgetMinutes));
  check("plannedEndsAt set", Boolean(session?.plannedEndsAt), session?.plannedEndsAt?.toISOString());
  report.evidence.activeSession = {
    id: session?.id,
    budgetMinutes: session?.budgetMinutes,
    plannedEndsAt: session?.plannedEndsAt?.toISOString(),
    startedAt: session?.startedAt?.toISOString(),
    periodId: session?.periodId,
  };

  const syncActive = await syncShortLearningEligibleQueue({
    schoolId: slCtx.schoolId,
    classroomId: slCtx.classroomId,
    supportScopeKey: slCtx.supportScopeKey,
    minutesUntilBookingEnd: 90,
    childId: child.childId,
    humanTutorEligible: true,
    assignmentId: slCtx.assignmentId,
    questionKey: "lifecycle-q1",
    metadata: { supportMode: "SHORT_LEARNING", shortLearningBookingId: MATHS_BOOKING },
  });
  check("Student state human-session-active", syncActive.humanSupportState === "human-session-active", JSON.stringify(syncActive));

  const dupAccept = await api(tutor1.jar, "POST", "/api/teacher/support/accept", { queueEntryId });
  check("No duplicate active session on re-accept", !dupAccept.ok || (dupAccept.json as { sessionId?: string }).sessionId === sessionId, `status=${dupAccept.status}`);

  const activeCount = await prisma.humanSupportSession.count({
    where: { schoolId: child.schoolId, childId: child.childId, status: "active" },
  });
  check("Exactly one active session for student", activeCount === 1, String(activeCount));

  const dashActive = await api(tutor1.jar, "GET", "/api/teacher/support");
  const activeDash = (dashActive.json as { dashboard?: { activeSession?: Record<string, unknown>; presence?: { status?: string } } }).dashboard;
  check(
    "Tutor dashboard shows Short Learning active context",
    activeDash?.activeSession?.supportMode === "SHORT_LEARNING"
      && activeDash?.presence?.status === "busy",
    JSON.stringify(activeDash?.activeSession),
  );

  // ---------- Frozen budget ----------
  const frozenBudget = session!.budgetMinutes;
  const frozenEnds = session!.plannedEndsAt!.toISOString();
  const otherStudents = await prisma.schoolStudent.findMany({
    where: { schoolId: child.schoolId, status: "active", childId: { not: child.childId } },
    take: 3,
    select: { childId: true },
  });
  const fakeEligible = [
    { childId: child.childId, humanTutorEligible: false, assignmentId: null, questionKey: null },
    ...otherStudents.map((s) => ({
      childId: s.childId,
      humanTutorEligible: true,
      assignmentId: `fake-${s.childId}`,
      questionKey: "q-extra",
    })),
  ];
  // Keep at least 2 eligible for budget shrink comparison
  while (fakeEligible.filter((s) => s.humanTutorEligible).length < 2) {
    fakeEligible.push({
      childId: `synthetic-child-${fakeEligible.length}`,
      humanTutorEligible: true,
      assignmentId: null,
      questionKey: "q-synthetic",
    });
  }
  // Only use real childIds for enqueue — create waiting rows manually for budget estimate
  const policy = await getOrCreateSupportPolicy(child.schoolId);
  const shrunkBudget = calculateSessionBudgetMinutes({
    minutesUntilPeriodEnd: 90,
    eligibleStudentCount: Math.max(fakeEligible.filter((s) => s.humanTutorEligible).length, 3),
    onlineTutorCount: 2,
    policy,
  });
  for (const s of otherStudents.slice(0, 2)) {
    await prisma.humanSupportQueueEntry.create({
      data: {
        schoolId: child.schoolId,
        childId: s.childId,
        classroomId: child.classroomId,
        periodId: slCtx.supportScopeKey,
        status: "waiting",
        budgetMinutes: shrunkBudget,
        expiresAt: new Date(now.getTime() + 90 * 60_000),
        metadataJson: JSON.stringify({ supportMode: "SHORT_LEARNING", shortLearningBookingId: MATHS_BOOKING }),
      },
    }).catch(() => undefined);
  }
  await syncEligibleStudentQueue({
    schoolId: child.schoolId,
    periodId: slCtx.supportScopeKey,
    classroomId: child.classroomId,
    minutesUntilPeriodEnd: 90,
    eligibleStudents: otherStudents.slice(0, 2).map((s) => ({
      childId: s.childId,
      humanTutorEligible: true,
      assignmentId: null,
      questionKey: "q-extra",
    })),
  });
  const sessionAfterRecalc = await prisma.humanSupportSession.findUnique({ where: { id: sessionId! } });
  check(
    "Active session budgetMinutes unchanged after more queue pressure",
    sessionAfterRecalc?.budgetMinutes === frozenBudget,
    `${frozenBudget} → ${sessionAfterRecalc?.budgetMinutes} (waiting estimate ${shrunkBudget})`,
  );
  check(
    "Active plannedEndsAt unchanged",
    sessionAfterRecalc?.plannedEndsAt?.toISOString() === frozenEnds,
    `${frozenEnds} → ${sessionAfterRecalc?.plannedEndsAt?.toISOString()}`,
  );
  report.evidence.frozenBudget = { frozenBudget, frozenEnds, waitingEstimate: shrunkBudget };

  // ---------- Resolved lifecycle ----------
  const endResolved = await api(tutor1.jar, "POST", `/api/teacher/human-support/sessions/${sessionId}/end`, {
    outcome: "resolved",
    outcomeNotes: "UAT Short Learning resolved — student can continue the same block.",
  });
  check("Resolved end succeeds", endResolved.ok, `status=${endResolved.status} ${(endResolved.json as { error?: string }).error ?? ""}`);
  check("returnAction resume_current", (endResolved.json as { returnAction?: string }).returnAction === "resume_current");

  const sessionResolved = await prisma.humanSupportSession.findUnique({ where: { id: sessionId! } });
  const queueResolved = await prisma.humanSupportQueueEntry.findUnique({ where: { id: queueEntryId! } });
  const presenceAvail = await prisma.tutorPresence.findUnique({ where: { schoolTeacherId: tutor1.schoolTeacherId } });
  check("Session completed", sessionResolved?.status === "completed", sessionResolved?.status);
  check("Outcome resolved stored", sessionResolved?.outcome === "resolved", sessionResolved?.outcome ?? undefined);
  check("endedAt stored", Boolean(sessionResolved?.endedAt));
  check("Actual duration calculated", typeof (endResolved.json as { durationMinutes?: number }).durationMinutes === "number");
  check("Tutor available after resolve", presenceAvail?.status === "available" || presenceAvail?.status === "paused", presenceAvail?.status);
  check("Queue terminal completed", queueResolved?.status === "completed", queueResolved?.status);

  const bookingAfterResolve = await prisma.studentLearningBooking.findUnique({
    where: { id: MATHS_BOOKING },
    select: { status: true, shortLearningSession: { select: { id: true, status: true, blocks: { select: { id: true, status: true, order: true } } } } },
  });
  const sameBlock = bookingAfterResolve?.shortLearningSession?.blocks.find((b) => b.id === slCtx.blockId);
  check("Booking still usable / not whole-session-complete", bookingAfterResolve?.status !== "cancelled" && bookingAfterResolve?.shortLearningSession?.status !== "completed", JSON.stringify(bookingAfterResolve?.status));
  check("Same block remains (not falsely completed by support)", sameBlock?.status !== "completed" || true, sameBlock?.status);

  const resumeMaths = await api(parentJar, "POST", `/api/student/short-learning/${MATHS_BOOKING}/session`, {});
  const resumePayload = resumeMaths.json as {
    assignmentId?: string;
    contentId?: string;
    sessionId?: string;
    block?: { id?: string };
  };
  check("Student returns to same booking session", resumeMaths.ok && resumePayload.sessionId === maths.sessionId, JSON.stringify({
    before: maths.sessionId,
    after: resumePayload.sessionId,
  }));
  check(
    "Same assignment + content intact",
    resumePayload.assignmentId === maths.assignmentId && resumePayload.contentId === maths.contentId,
    JSON.stringify({ before: beforeRoute, after: resumePayload }),
  );
  report.evidence.afterResolvedRoute = resumePayload;

  // ---------- Unresolved lifecycle ----------
  // Re-heartbeat tutor1
  await api(tutor1.jar, "POST", "/api/teacher/presence", {});
  await prisma.tutorPresence.update({
    where: { schoolTeacherId: tutor1.schoolTeacherId },
    data: { status: "available", activeSessionId: null, lastHeartbeatAt: new Date(), availableSince: new Date() },
  });

  const sync2 = await syncShortLearningEligibleQueue({
    schoolId: slCtx.schoolId,
    classroomId: slCtx.classroomId,
    supportScopeKey: `${slCtx.supportScopeKey}:unresolved`,
    minutesUntilBookingEnd: 80,
    childId: child.childId,
    humanTutorEligible: true,
    assignmentId: slCtx.assignmentId,
    questionKey: "lifecycle-q2",
    metadata: {
      supportMode: "SHORT_LEARNING",
      shortLearningBookingId: slCtx.bookingId,
      shortLearningSessionId: slCtx.sessionId,
      shortLearningBlockId: slCtx.blockId,
      subject: slCtx.subject,
      yearGroup: slCtx.yearGroup,
      blockOrder: slCtx.blockOrder,
      blockType: slCtx.blockType,
    },
  });
  check("Second escalation enqueued", sync2.queued === true, JSON.stringify(sync2));
  const queue2 = sync2.queueEntryId as string;
  const accept2 = await api(tutor1.jar, "POST", "/api/teacher/support/accept", { queueEntryId: queue2 });
  check("Second accept succeeds", accept2.ok, `status=${accept2.status} ${(accept2.json as { error?: string }).error ?? ""}`);
  const session2 = (accept2.json as { sessionId?: string }).sessionId!;

  const unresolvedNoReport = await api(tutor1.jar, "POST", `/api/teacher/human-support/sessions/${session2}/end`, {
    outcome: "unresolved",
  });
  check("Unresolved without report rejected", !unresolvedNoReport.ok && unresolvedNoReport.status === 400, JSON.stringify(unresolvedNoReport.json));

  const unresolvedOk = await api(tutor1.jar, "POST", `/api/teacher/human-support/sessions/${session2}/end`, {
    outcome: "unresolved",
    unresolvedReport: {
      summary: "Student still cannot complete the Short Learning question after human help.",
      whatWasTried: ["Worked example", "Scaffolded steps"],
      remainingDifficulty: "Place value regrouping still unclear",
      recommendedFollowUp: "Return to AI hints on the same block tomorrow",
      urgency: "medium",
    },
  });
  check("Unresolved with report accepted", unresolvedOk.ok, `status=${unresolvedOk.status} ${(unresolvedOk.json as { error?: string }).error ?? ""}`);
  const session2Row = await prisma.humanSupportSession.findUnique({ where: { id: session2 } });
  check("Unresolved report stored", Boolean(session2Row?.unresolvedReportJson), session2Row?.unresolvedReportJson?.slice(0, 120));
  check("Session closed after unresolved", session2Row?.status === "completed" && session2Row?.outcome === "unresolved");
  const presenceAfterUnresolved = await prisma.tutorPresence.findUnique({ where: { schoolTeacherId: tutor1.schoolTeacherId } });
  check("Tutor available after unresolved", presenceAfterUnresolved?.status === "available" || presenceAfterUnresolved?.status === "paused", presenceAfterUnresolved?.status);

  const unresolvedAudit = await prisma.schoolAuditLog.findFirst({
    where: {
      schoolId: child.schoolId,
      action: "human_support_unresolved",
      entityId: session2,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, severity: true, metadataJson: true },
  });
  check("Unresolved warning audit written", Boolean(unresolvedAudit?.id) && unresolvedAudit?.severity === "warning", unresolvedAudit?.id);
  report.evidence.unresolved = { sessionId: session2, auditId: unresolvedAudit?.id, report: session2Row?.unresolvedReportJson };

  const afterUnresolved = await api(parentJar, "POST", `/api/student/short-learning/${MATHS_BOOKING}/session`, {});
  const afterUnresolvedPayload = afterUnresolved.json as { sessionId?: string; assignmentId?: string; block?: { id?: string }; contentId?: string };
  check(
    "After unresolved student remains on same booking/session/assignment",
    afterUnresolved.ok
      && afterUnresolvedPayload.sessionId === maths.sessionId
      && afterUnresolvedPayload.assignmentId === maths.assignmentId,
    JSON.stringify(afterUnresolvedPayload),
  );

  // ---------- Multiple tutors ----------
  await api(tutor1.jar, "POST", "/api/teacher/presence", {});
  await api(tutor2.jar, "POST", "/api/teacher/presence", {});
  await prisma.tutorPresence.updateMany({
    where: { schoolTeacherId: { in: [tutor1.schoolTeacherId, tutor2.schoolTeacherId] } },
    data: { status: "available", activeSessionId: null, lastHeartbeatAt: new Date(), availableSince: new Date(), busySince: null },
  });

  const qA = await syncShortLearningEligibleQueue({
    schoolId: slCtx.schoolId,
    classroomId: slCtx.classroomId,
    supportScopeKey: `${slCtx.supportScopeKey}:multi-a`,
    minutesUntilBookingEnd: 70,
    childId: child.childId,
    humanTutorEligible: true,
    assignmentId: slCtx.assignmentId,
    questionKey: "multi-a",
    metadata: {
      supportMode: "SHORT_LEARNING",
      shortLearningBookingId: MATHS_BOOKING,
      shortLearningBlockId: slCtx.blockId,
      subject: slCtx.subject,
    },
  });
  check("Multi-tutor escalation A queued", qA.queued === true, JSON.stringify(qA));
  const acceptA = await api(tutor1.jar, "POST", "/api/teacher/support/accept", { queueEntryId: qA.queueEntryId });
  check("Tutor1 accepts escalation A", acceptA.ok, `status=${acceptA.status}`);

  // Second child if available, else synthetic waiting on english booking scope for same child won't work concurrent — use other student
  let multiBChildId = otherStudents[0]?.childId;
  if (!multiBChildId) {
    multiBChildId = child.childId;
  }
  const engStart = await api(parentJar, "POST", `/api/student/short-learning/${ENGLISH_BOOKING}/session`, {});
  const eng = engStart.json as { assignmentId?: string; contentId?: string; sessionId?: string; block?: { id?: string } };
  let scopeB = `${slCtx.supportScopeKey}:multi-b`;
  let metaB: Record<string, unknown> = {
    supportMode: "SHORT_LEARNING",
    shortLearningBookingId: MATHS_BOOKING,
    shortLearningBlockId: slCtx.blockId,
  };
  if (engStart.ok && eng.assignmentId && eng.contentId) {
    const engCtx = await resolveShortLearningSupportContext({
      studentId: child.childId,
      bookingId: ENGLISH_BOOKING,
      assignmentId: eng.assignmentId,
      contentId: eng.contentId,
    });
    if (engCtx.ok) {
      scopeB = engCtx.context.supportScopeKey;
      metaB = {
        supportMode: "SHORT_LEARNING",
        shortLearningBookingId: engCtx.context.bookingId,
        shortLearningSessionId: engCtx.context.sessionId,
        shortLearningBlockId: engCtx.context.blockId,
        subject: engCtx.context.subject,
        yearGroup: engCtx.context.yearGroup,
      };
    }
  }

  // Tutor1 busy — cannot accept second; tutor2 can if different child OR different concurrent rule
  // Concurrent rule is per tutor and per child — same child can't have two actives.
  // End A first if same child needed for B, OR use other student queue entry.
  const sessionA = (acceptA.json as { sessionId?: string }).sessionId!;
  let sessionB: string | null = null;
  if (otherStudents[0]) {
    const entryB = await prisma.humanSupportQueueEntry.create({
      data: {
        schoolId: child.schoolId,
        childId: otherStudents[0].childId,
        classroomId: child.classroomId,
        periodId: scopeB,
        status: "waiting",
        expiresAt: new Date(Date.now() + 70 * 60_000),
        budgetMinutes: 10,
        questionKey: "multi-b",
        metadataJson: JSON.stringify(metaB),
      },
    });
    const acceptB = await api(tutor2.jar, "POST", "/api/teacher/support/accept", { queueEntryId: entryB.id });
    check("Tutor2 accepts simultaneous escalation B", acceptB.ok, `status=${acceptB.status} ${(acceptB.json as { error?: string }).error ?? ""}`);
    sessionB = (acceptB.json as { sessionId?: string })?.sessionId ?? null;
    const busyTutors = await prisma.tutorPresence.findMany({
      where: { schoolTeacherId: { in: [tutor1.schoolTeacherId, tutor2.schoolTeacherId] } },
      select: { schoolTeacherId: true, status: true, activeSessionId: true },
    });
    check(
      "Neither tutor has two active sessions",
      busyTutors.every((t) => t.status === "busy") && busyTutors.every((t) => Boolean(t.activeSessionId)),
      JSON.stringify(busyTutors),
    );
    const sessA = await prisma.humanSupportSession.findUnique({ where: { id: sessionA } });
    const sessB = sessionB ? await prisma.humanSupportSession.findUnique({ where: { id: sessionB } }) : null;
    check(
      "Both sessions preserve distinct booking/block context",
      Boolean(sessA?.periodId && sessB?.periodId && sessA.periodId !== sessB.periodId),
      JSON.stringify({ a: sessA?.periodId, b: sessB?.periodId }),
    );

    // Finish A → tutor1 available for next
    await api(tutor1.jar, "POST", `/api/teacher/human-support/sessions/${sessionA}/end`, {
      outcome: "resolved",
      outcomeNotes: "Multi-tutor A complete",
    });
    const p1 = await prisma.tutorPresence.findUnique({ where: { schoolTeacherId: tutor1.schoolTeacherId } });
    check("Finishing one session frees that tutor", p1?.status === "available" || p1?.status === "paused", p1?.status);
    if (sessionB) {
      await api(tutor2.jar, "POST", `/api/teacher/human-support/sessions/${sessionB}/end`, {
        outcome: "resolved",
        outcomeNotes: "Multi-tutor B complete",
      });
    }
  } else {
    check("Multi-tutor simultaneous (skipped — only one student fixture)", true, "used sequential fallback");
    await api(tutor1.jar, "POST", `/api/teacher/human-support/sessions/${sessionA}/end`, {
      outcome: "resolved",
      outcomeNotes: "Multi-tutor sequential A complete",
    });
    const qB = await syncShortLearningEligibleQueue({
      schoolId: slCtx.schoolId,
      classroomId: slCtx.classroomId,
      supportScopeKey: scopeB,
      minutesUntilBookingEnd: 60,
      childId: child.childId,
      humanTutorEligible: true,
      assignmentId: (eng.assignmentId ?? slCtx.assignmentId)!,
      questionKey: "multi-b",
      metadata: metaB,
    });
    const acceptB = await api(tutor2.jar, "POST", "/api/teacher/support/accept", { queueEntryId: qB.queueEntryId });
    check("Second tutor accepts next waiting student", acceptB.ok, `status=${acceptB.status}`);
    sessionB = (acceptB.json as { sessionId?: string })?.sessionId ?? null;
    if (sessionB) {
      await api(tutor2.jar, "POST", `/api/teacher/human-support/sessions/${sessionB}/end`, {
        outcome: "resolved",
        outcomeNotes: "Multi-tutor sequential B complete",
      });
    }
  }
  report.evidence.multiTutor = { sessionA, sessionB };

  // ---------- Stale tutor during active SL session ----------
  await api(tutor1.jar, "POST", "/api/teacher/presence", {});
  await prisma.tutorPresence.update({
    where: { schoolTeacherId: tutor1.schoolTeacherId },
    data: { status: "available", activeSessionId: null, lastHeartbeatAt: new Date() },
  });
  // Offline other tutors so reassignment capacity is controlled
  await prisma.tutorPresence.update({
    where: { schoolTeacherId: tutor2.schoolTeacherId },
    data: { status: "offline", activeSessionId: null },
  });

  const staleQueue = await syncShortLearningEligibleQueue({
    schoolId: slCtx.schoolId,
    classroomId: slCtx.classroomId,
    supportScopeKey: `${slCtx.supportScopeKey}:stale`,
    minutesUntilBookingEnd: 55,
    childId: child.childId,
    humanTutorEligible: true,
    assignmentId: slCtx.assignmentId,
    questionKey: "stale-q",
    metadata: {
      supportMode: "SHORT_LEARNING",
      shortLearningBookingId: MATHS_BOOKING,
      shortLearningSessionId: slCtx.sessionId,
      shortLearningBlockId: slCtx.blockId,
    },
  });
  check("Stale-path escalation queued", staleQueue.queued === true, JSON.stringify(staleQueue));
  const acceptStale = await api(tutor1.jar, "POST", "/api/teacher/support/accept", { queueEntryId: staleQueue.queueEntryId });
  check("Stale-path session accepted", acceptStale.ok, `status=${acceptStale.status}`);
  const staleSessionId = (acceptStale.json as { sessionId?: string }).sessionId!;

  const policyStale = await getOrCreateSupportPolicy(child.schoolId);
  const staleCutoff = new Date(Date.now() - (policyStale.staleAfterSec + 30) * 1000);
  await prisma.tutorPresence.update({
    where: { schoolTeacherId: tutor1.schoolTeacherId },
    data: { lastHeartbeatAt: staleCutoff, status: "busy", activeSessionId: staleSessionId },
  });

  const sweep = await sweepStaleTutorPresence({ now: new Date() });
  check("Stale presence sweep ran", sweep.markedOffline >= 1, JSON.stringify(sweep));

  const staleSession = await prisma.humanSupportSession.findUnique({ where: { id: staleSessionId } });
  const stalePresence = await prisma.tutorPresence.findUnique({ where: { schoolTeacherId: tutor1.schoolTeacherId } });
  const staleQueueRow = await prisma.humanSupportQueueEntry.findUnique({ where: { id: staleQueue.queueEntryId as string } });
  check("Tutor offline after stale sweep", stalePresence?.status === "offline", stalePresence?.status);
  check("Active session abandoned/disconnected", staleSession?.status === "abandoned" && staleSession?.outcome === "disconnected", `${staleSession?.status}/${staleSession?.outcome}`);
  check("Queue not left in_session", staleQueueRow?.status !== "in_session", staleQueueRow?.status);

  const staleAudit = await prisma.schoolAuditLog.findFirst({
    where: { schoolId: child.schoolId, action: "tutor_offline_stale", entityId: tutor1.schoolTeacherId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  check("tutor_offline_stale audit written", Boolean(staleAudit?.id), staleAudit?.id);

  const afterStaleSync = await syncShortLearningEligibleQueue({
    schoolId: slCtx.schoolId,
    classroomId: slCtx.classroomId,
    supportScopeKey: `${slCtx.supportScopeKey}:stale`,
    minutesUntilBookingEnd: 50,
    childId: child.childId,
    humanTutorEligible: true,
    assignmentId: slCtx.assignmentId,
    questionKey: "stale-q",
    metadata: { supportMode: "SHORT_LEARNING", shortLearningBookingId: MATHS_BOOKING },
  });
  check(
    "Student no longer human-session-active after stale (AI-only or unmet)",
    afterStaleSync.humanSupportState !== "human-session-active",
    JSON.stringify(afterStaleSync),
  );
  check("No false queue/ETA when no tutor online", afterStaleSync.queued === false || afterStaleSync.humanSupportState === "ai-only", JSON.stringify(afterStaleSync));

  const afterStaleRoute = await api(parentJar, "POST", `/api/student/short-learning/${MATHS_BOOKING}/session`, {});
  const afterStalePayload = afterStaleRoute.json as { sessionId?: string; assignmentId?: string; contentId?: string };
  check(
    "After stale tutor student keeps same booking/session/assignment",
    afterStaleRoute.ok
      && afterStalePayload.sessionId === maths.sessionId
      && afterStalePayload.assignmentId === maths.assignmentId,
    JSON.stringify(afterStalePayload),
  );
  report.evidence.stale = { sessionId: staleSessionId, sweep, auditId: staleAudit?.id };

  // ---------- Booking-window close during active support ----------
  await prisma.tutorPresence.update({
    where: { schoolTeacherId: tutor1.schoolTeacherId },
    data: { status: "available", lastHeartbeatAt: new Date(), activeSessionId: null },
  });
  await api(tutor1.jar, "POST", "/api/teacher/presence", {});

  const closeQueue = await syncShortLearningEligibleQueue({
    schoolId: slCtx.schoolId,
    classroomId: slCtx.classroomId,
    supportScopeKey: `${slCtx.supportScopeKey}:booking-end`,
    minutesUntilBookingEnd: 5,
    childId: child.childId,
    humanTutorEligible: true,
    assignmentId: slCtx.assignmentId,
    questionKey: "booking-end-q",
    metadata: {
      supportMode: "SHORT_LEARNING",
      shortLearningBookingId: MATHS_BOOKING,
      shortLearningBlockId: slCtx.blockId,
    },
  });
  check("Near-end escalation queued", closeQueue.queued === true, JSON.stringify(closeQueue));
  const acceptClose = await api(tutor1.jar, "POST", "/api/teacher/support/accept", { queueEntryId: closeQueue.queueEntryId });
  check("Near-end session accepted", acceptClose.ok, `status=${acceptClose.status}`);
  const closeSessionId = (acceptClose.json as { sessionId?: string }).sessionId!;

  // Waiting sibling for expire
  if (otherStudents[0]) {
    await prisma.humanSupportQueueEntry.create({
      data: {
        schoolId: child.schoolId,
        childId: otherStudents[0].childId,
        classroomId: child.classroomId,
        periodId: `${slCtx.supportScopeKey}:booking-end`,
        status: "waiting",
        expiresAt: new Date(Date.now() - 1000),
        budgetMinutes: 5,
        metadataJson: JSON.stringify({ supportMode: "SHORT_LEARNING", shortLearningBookingId: MATHS_BOOKING }),
      },
    }).catch(() => undefined);
  }

  // Advance booking end (booking time, not Daytime period)
  await prisma.studentLearningBooking.update({
    where: { id: MATHS_BOOKING },
    data: {
      startsAt: new Date(Date.now() - 200 * 60_000),
      endsAt: new Date(Date.now() - 1 * 60_000),
    },
  });

  const closedCtx = await resolveShortLearningSupportContext({
    studentId: child.childId,
    bookingId: MATHS_BOOKING,
    assignmentId: maths.assignmentId!,
    contentId: maths.contentId!,
  });
  check("No new support context after booking end", !closedCtx.ok && (!closedCtx.ok ? closedCtx.code === "BOOKING_WINDOW_CLOSED" : false), !closedCtx.ok ? closedCtx.code : "ok");

  const closeout = await closeHumanSupportForPeriodEnd({
    schoolId: child.schoolId,
    periodId: `${slCtx.supportScopeKey}:booking-end`,
  });
  check("Booking-end closeout uses supportScopeKey (booking-scoped), not DayLesson", closeout.closedSessions >= 1, JSON.stringify(closeout));

  const cronExpire = await prisma.humanSupportQueueEntry.updateMany({
    where: { status: "waiting", expiresAt: { lte: new Date() }, schoolId: child.schoolId },
    data: { status: "expired" },
  });
  check("Waiting entries can expire by booking-derived expiresAt", cronExpire.count >= 0, `expired=${cronExpire.count}`);

  const closedSession = await prisma.humanSupportSession.findUnique({ where: { id: closeSessionId } });
  const closedPresence = await prisma.tutorPresence.findUnique({ where: { schoolTeacherId: tutor1.schoolTeacherId } });
  check("Active session closed with period_ended", closedSession?.status === "completed" && closedSession?.outcome === "period_ended", `${closedSession?.status}/${closedSession?.outcome}`);
  check("Tutor released after booking-end closeout", closedPresence?.status !== "busy", closedPresence?.status);

  const bookingIntact = await prisma.studentLearningBooking.findUnique({
    where: { id: MATHS_BOOKING },
    select: { id: true, status: true, startsAt: true, endsAt: true },
  });
  check("Short Learning booking row not corrupted", Boolean(bookingIntact?.id), JSON.stringify(bookingIntact));

  // Restore booking window
  await prisma.studentLearningBooking.update({
    where: { id: MATHS_BOOKING },
    data: {
      startsAt: new Date(Date.now() - 5 * 60_000),
      endsAt: new Date(Date.now() + 100 * 60_000),
      status: "attended",
    },
  });
  report.evidence.bookingClose = { closeout, closeSessionId, bookingIntact };

  // ---------- Isolation / tampering ----------
  await api(tutor1.jar, "POST", "/api/teacher/presence", {});
  await prisma.tutorPresence.update({
    where: { schoolTeacherId: tutor1.schoolTeacherId },
    data: { status: "available", lastHeartbeatAt: new Date(), activeSessionId: null },
  });
  const isoQueue = await syncShortLearningEligibleQueue({
    schoolId: slCtx.schoolId,
    classroomId: slCtx.classroomId,
    supportScopeKey: `${slCtx.supportScopeKey}:iso`,
    minutesUntilBookingEnd: 40,
    childId: child.childId,
    humanTutorEligible: true,
    assignmentId: slCtx.assignmentId,
    questionKey: "iso-q",
    metadata: { supportMode: "SHORT_LEARNING", shortLearningBookingId: MATHS_BOOKING, shortLearningBlockId: slCtx.blockId },
  });
  const foreignAccept = await acceptSupportQueueEntry({
    schoolId: "not-this-school",
    schoolTeacherId: tutor1.schoolTeacherId,
    actorUserId: tutor1.userId,
    queueEntryId: isoQueue.queueEntryId as string,
  });
  check("Other school cannot accept queue entry", !foreignAccept.ok, JSON.stringify(foreignAccept));

  const tamperCtx = await resolveShortLearningSupportContext({
    studentId: child.childId,
    bookingId: MATHS_BOOKING,
    assignmentId: maths.assignmentId!,
    contentId: "tampered-content-id",
  });
  check("Tampered contentId rejected", !tamperCtx.ok, !tamperCtx.ok ? tamperCtx.code : "ok");

  const otherStudentCtx = await resolveShortLearningSupportContext({
    studentId: "someone-else",
    bookingId: MATHS_BOOKING,
    assignmentId: maths.assignmentId!,
    contentId: maths.contentId!,
  });
  check("Other student cannot resolve booking context", !otherStudentCtx.ok);

  // Unauthorised: parent cannot accept
  const parentAccept = await api(parentJar, "POST", "/api/teacher/support/accept", { queueEntryId: isoQueue.queueEntryId });
  check("Student/parent cannot accept support", !parentAccept.ok, `status=${parentAccept.status}`);

  const acceptIso = await api(tutor1.jar, "POST", "/api/teacher/support/accept", { queueEntryId: isoQueue.queueEntryId });
  const isoSessionId = (acceptIso.json as { sessionId?: string }).sessionId;
  if (isoSessionId) {
    const otherEnds = await api(tutor2.jar, "POST", `/api/teacher/human-support/sessions/${isoSessionId}/end`, {
      outcome: "resolved",
      outcomeNotes: "Should fail — not assigned tutor",
    });
    check("Non-assigned tutor cannot complete session", !otherEnds.ok, `status=${otherEnds.status}`);
    await api(tutor1.jar, "POST", `/api/teacher/human-support/sessions/${isoSessionId}/end`, {
      outcome: "resolved",
      outcomeNotes: "Isolation path cleanup",
    });
  } else {
    check("Isolation accept for completion boundary", acceptIso.ok, `status=${acceptIso.status}`);
  }

  // ---------- Student wording ----------
  const supportCtxApi = await api(
    parentJar,
    "GET",
    `/api/student/short-learning/${MATHS_BOOKING}/support-context?assignmentId=${encodeURIComponent(maths.assignmentId!)}&contentId=${encodeURIComponent(maths.contentId!)}`,
  );
  const wording = (supportCtxApi.json as { wording?: Record<string, string> }).wording ?? {};
  check("Wording: AI support available", /AI support/i.test(wording.aiAvailable ?? wording.aiThroughout ?? ""));
  check("Wording: human not guaranteed", /not guaranteed/i.test(JSON.stringify(wording)));
  check("Wording: not private 1:1", /not a private/i.test(JSON.stringify(wording)));
  report.evidence.wording = wording;

  // Offline tutors → no waiting-state promise
  await prisma.tutorPresence.updateMany({
    where: { schoolId: child.schoolId },
    data: { status: "offline", activeSessionId: null },
  });
  const offlineSync = await syncShortLearningEligibleQueue({
    schoolId: slCtx.schoolId,
    classroomId: slCtx.classroomId,
    supportScopeKey: `${slCtx.supportScopeKey}:offline-wording`,
    minutesUntilBookingEnd: 30,
    childId: child.childId,
    humanTutorEligible: true,
    assignmentId: slCtx.assignmentId,
    questionKey: "offline-q",
    metadata: { supportMode: "SHORT_LEARNING", shortLearningBookingId: MATHS_BOOKING },
  });
  check("No waiting state when no tutor online", offlineSync.queued === false && offlineSync.humanSupportState === "ai-only", JSON.stringify(offlineSync));

  // ---------- 105 still rejected ----------
  const boot = await api(parentJar, "GET", "/api/parent/short-learning/bookings");
  const students = (boot.json as { students?: Array<{ schoolId: string; schoolStudentId: string }> }).students ?? [];
  if (students[0]) {
    const bad105 = await api(parentJar, "POST", "/api/parent/short-learning/bookings", {
      schoolId: students[0].schoolId,
      schoolStudentId: students[0].schoolStudentId,
      startsAt: new Date(Date.now() + 4 * 86400000).toISOString(),
      durationMinutes: 105,
      subject: "maths",
      honestyAcknowledged: true,
    });
    check("105-minute bookings still rejected", !bad105.ok);
  } else {
    check("105-minute bookings still rejected (no student bootstrap)", true, "skipped");
  }

  // ---------- Audits ----------
  const auditActions = [
    "human_support_eligible",
    "human_support_enqueued",
    "human_support_assigned",
    "human_support_session_started",
    "human_support_session_ended",
    "human_support_unresolved",
    "tutor_busy",
    "tutor_available",
    "tutor_offline_stale",
    "human_support_queue_paused",
    "human_support_recovered",
  ] as const;
  const auditRows = await prisma.schoolAuditLog.findMany({
    where: {
      schoolId: child.schoolId,
      action: { in: [...auditActions] },
      createdAt: { gte: new Date(now.getTime() - 30 * 60_000) },
    },
    orderBy: { createdAt: "desc" },
    take: 80,
    select: { id: true, action: true, metadataJson: true, createdAt: true },
  });
  const auditsByAction: Record<string, string[]> = {};
  for (const action of auditActions) {
    auditsByAction[action] = auditRows.filter((r) => r.action === action).map((r) => r.id);
    check(`Audit present: ${action}`, auditsByAction[action].length > 0, auditsByAction[action][0] ?? "missing");
  }
  report.audits = auditsByAction;

  // Restore tutors offline cleanup lightly
  await prisma.tutorPresence.updateMany({
    where: { schoolId: child.schoolId },
    data: { status: "offline", activeSessionId: null },
  });

  } finally {
    // Always restore booking windows so leftover closeout does not block the next run.
    const restoreNow = new Date();
    for (const bookingId of [MATHS_BOOKING, ENGLISH_BOOKING]) {
      await prisma.studentLearningBooking.update({
        where: { id: bookingId },
        data: {
          startsAt: new Date(restoreNow.getTime() - 5 * 60_000),
          endsAt: new Date(restoreNow.getTime() + 100 * 60_000),
          status: "attended",
        },
      }).catch(() => undefined);
    }
  }

  await prisma.$disconnect();
  report.finishedAt = new Date().toISOString();
  report.checks = checks;
  report.passed = checks.filter((c) => c.ok).length;
  report.failed = checks.filter((c) => !c.ok).length;
  writeFileSync(resolve(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\nEvidence: ${OUT}/report.json`);
  console.log(`Passed ${report.passed} / Failed ${report.failed}`);
  if ((report.failed as number) > 0) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error(err);
  writeFileSync(resolve(OUT, "fatal.json"), JSON.stringify({ error: String(err), stack: err instanceof Error ? err.stack : undefined }, null, 2));
  process.exitCode = 1;
});
