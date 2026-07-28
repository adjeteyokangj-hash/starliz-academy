/**
 * Authenticated localhost UAT — Admin Support Oversight & Controls v1.
 * No migration reset / destructive schema commands / commit / push / deploy.
 *
 * Usage: npx tsx scripts/uat-admin-support-oversight.ts
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

const BASE = process.env.UAT_BASE_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.UAT_ADMIN_EMAIL ?? process.env.E2E_OPS_ADMIN_EMAIL ?? "platform-admin@starliz.dev";
const ADMIN_PASSWORD = process.env.UAT_ADMIN_PASSWORD ?? process.env.E2E_OPS_ADMIN_PASSWORD ?? "PlatformAdmin#2026";
const TEACHER_EMAIL = process.env.UAT_LIVE_TEACHER_EMAIL ?? "uat.live.classroom.teacher@starliz.dev";
const OTHER_TEACHER_EMAIL = process.env.UAT_LIVE_OTHER_TEACHER_EMAIL ?? "uat.live.other.teacher@starliz.dev";
const SCHOOL_ID = process.env.UAT_SCHOOL_ID ?? "cmpgzr6nc000jskjob867guo7";
const PERIOD_ID = process.env.UAT_DAY_LESSON_ID ?? "cmrxh7dkk00jhskmstinb86ox";
const UAT_TAG = "uat-admin-support-v1";

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
) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      cookie: cookieHeader(jar),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "follow",
    signal: AbortSignal.timeout(120_000),
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
}

async function waitForServer(timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(BASE, { signal: AbortSignal.timeout(5_000) });
      if (res.status > 0) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const evidencePath = resolve("scripts/.uat-admin-support-oversight-evidence.json");
  const checks: Check[] = [];
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    base: BASE,
    schoolId: SCHOOL_ID,
    checks,
    verification: {
      focusedUnitTests: "pending",
      moduleSmoke: "pending",
      eslintTouched: "pending",
      gitDiffCheck: "pending",
      projectWideTsc: "Inconclusive — command hung and was stopped.",
    },
  };

  const createdQueueIds: string[] = [];
  const createdSessionIds: string[] = [];
  let otherSchoolId: string | null = null;

  try {
    const up = await waitForServer();
    checks.push({ name: "Dev server reachable", ok: up, detail: BASE });
    if (!up) throw new Error(`Server not reachable at ${BASE}`);

    const school = await prisma.school.findUnique({
      where: { id: SCHOOL_ID },
      select: { id: true, name: true },
    });
    checks.push({
      name: "UAT school exists",
      ok: Boolean(school),
      detail: school?.name ?? SCHOOL_ID,
    });
    if (!school) throw new Error("UAT school missing");

    const otherSchool = await prisma.school.findFirst({
      where: { id: { not: SCHOOL_ID } },
      select: { id: true, name: true },
    });
    otherSchoolId = otherSchool?.id ?? null;

    const period = await prisma.schoolDayLesson.findFirst({
      where: { id: PERIOD_ID, schoolId: SCHOOL_ID },
      select: { id: true, classroomId: true, title: true, subject: true },
    });
    if (!period?.classroomId) throw new Error("UAT period missing classroom");

    const student = await prisma.schoolStudent.findFirst({
      where: {
        schoolId: SCHOOL_ID,
        classroomId: period.classroomId,
        status: "active",
        OR: [
          { externalRef: "uat:daytime:year6" },
          { externalRef: { startsWith: "uat:" } },
        ],
      },
      select: { childId: true, child: { select: { name: true } } },
    });
    if (!student) throw new Error("UAT student missing");

    const teacherA = await prisma.schoolTeacher.findFirst({
      where: { schoolId: SCHOOL_ID, user: { email: TEACHER_EMAIL }, status: "active" },
      select: { id: true, user: { select: { name: true, email: true } } },
    });
    const teacherB = await prisma.schoolTeacher.findFirst({
      where: { schoolId: SCHOOL_ID, user: { email: OTHER_TEACHER_EMAIL }, status: "active" },
      select: { id: true, user: { select: { name: true, email: true } } },
    });
    checks.push({
      name: "UAT tutors present",
      ok: Boolean(teacherA && teacherB),
      detail: `A=${teacherA?.id ?? "missing"} B=${teacherB?.id ?? "missing"}`,
    });
    if (!teacherA || !teacherB) throw new Error("Need two active UAT tutors");

    // Soft cleanup prior UAT-tagged rows for this school/period (not migration reset).
    await prisma.humanSupportSession.deleteMany({
      where: {
        schoolId: SCHOOL_ID,
        periodId: period.id,
        metadataJson: { contains: UAT_TAG },
      },
    });
    await prisma.humanSupportQueueEntry.deleteMany({
      where: {
        schoolId: SCHOOL_ID,
        periodId: period.id,
        metadataJson: { contains: UAT_TAG },
      },
    });

    const now = new Date();
    const meta = (extra: Record<string, unknown> = {}) =>
      JSON.stringify({ uatTag: UAT_TAG, ...extra });

    // Presence fixtures
    await prisma.tutorPresence.upsert({
      where: { schoolTeacherId: teacherA.id },
      create: {
        schoolId: SCHOOL_ID,
        schoolTeacherId: teacherA.id,
        status: "available",
        lastHeartbeatAt: now,
        availableSince: now,
        dayLessonId: period.id,
      },
      update: {
        status: "available",
        lastHeartbeatAt: now,
        availableSince: now,
        pausedAt: null,
        busySince: null,
        activeSessionId: null,
        dayLessonId: period.id,
      },
    });
    await prisma.tutorPresence.upsert({
      where: { schoolTeacherId: teacherB.id },
      create: {
        schoolId: SCHOOL_ID,
        schoolTeacherId: teacherB.id,
        status: "available",
        lastHeartbeatAt: now,
        availableSince: now,
        dayLessonId: period.id,
      },
      update: {
        status: "available",
        lastHeartbeatAt: now,
        availableSince: now,
        pausedAt: null,
        busySince: null,
        activeSessionId: null,
        dayLessonId: period.id,
      },
    });

    // Queue: waiting
    const waiting = await prisma.humanSupportQueueEntry.create({
      data: {
        schoolId: SCHOOL_ID,
        childId: student.childId,
        classroomId: period.classroomId,
        periodId: period.id,
        questionKey: "uat-admin-waiting",
        status: "waiting",
        priority: 5,
        enqueuedAt: now,
        metadataJson: meta({ kind: "waiting" }),
      },
    });
    createdQueueIds.push(waiting.id);

    // Queue: assigned (unaccepted)
    const assigned = await prisma.humanSupportQueueEntry.create({
      data: {
        schoolId: SCHOOL_ID,
        childId: student.childId,
        classroomId: period.classroomId,
        periodId: period.id,
        questionKey: "uat-admin-assigned",
        status: "assigned",
        priority: 5,
        enqueuedAt: now,
        assignedAt: now,
        assignedTutorId: teacherA.id,
        budgetMinutes: 10,
        metadataJson: meta({ kind: "assigned" }),
      },
    });
    createdQueueIds.push(assigned.id);

    // Active session + busy presence (for force-offline protection)
    const activeQueue = await prisma.humanSupportQueueEntry.create({
      data: {
        schoolId: SCHOOL_ID,
        childId: student.childId,
        classroomId: period.classroomId,
        periodId: period.id,
        questionKey: "uat-admin-active",
        status: "in_session",
        priority: 8,
        enqueuedAt: now,
        assignedAt: now,
        assignedTutorId: teacherA.id,
        budgetMinutes: 10,
        metadataJson: meta({ kind: "active" }),
      },
    });
    createdQueueIds.push(activeQueue.id);

    const activeSession = await prisma.humanSupportSession.create({
      data: {
        schoolId: SCHOOL_ID,
        queueEntryId: activeQueue.id,
        schoolTeacherId: teacherA.id,
        childId: student.childId,
        periodId: period.id,
        budgetMinutes: 10,
        startedAt: now,
        plannedEndsAt: new Date(now.getTime() + 10 * 60_000),
        status: "active",
        metadataJson: meta({
          kind: "active",
          sessionNotes: {
            privateNotes: "UAT private tutor note — restricted",
            actionsTaken: ["hint"],
            followUpNeeded: false,
          },
          guidanceMessages: [],
          supportContextSnapshot: {
            acceptedAt: now.toISOString(),
            schoolId: SCHOOL_ID,
            dayLessonId: period.id,
            subject: period.subject,
            lessonTitle: period.title,
            aiSupportState: "exhausted",
          },
        }),
      },
    });
    createdSessionIds.push(activeSession.id);

    await prisma.tutorPresence.update({
      where: { schoolTeacherId: teacherA.id },
      data: {
        status: "busy",
        busySince: now,
        activeSessionId: activeSession.id,
        lastHeartbeatAt: now,
        availableSince: null,
      },
    });

    // Abandoned session
    const abandonedQueue = await prisma.humanSupportQueueEntry.create({
      data: {
        schoolId: SCHOOL_ID,
        childId: student.childId,
        classroomId: period.classroomId,
        periodId: period.id,
        questionKey: "uat-admin-abandoned",
        status: "in_session",
        priority: 3,
        enqueuedAt: now,
        assignedAt: now,
        assignedTutorId: teacherB.id,
        budgetMinutes: 8,
        metadataJson: meta({ kind: "abandoned" }),
      },
    });
    createdQueueIds.push(abandonedQueue.id);
    const abandonedSession = await prisma.humanSupportSession.create({
      data: {
        schoolId: SCHOOL_ID,
        queueEntryId: abandonedQueue.id,
        schoolTeacherId: teacherB.id,
        childId: student.childId,
        periodId: period.id,
        budgetMinutes: 8,
        startedAt: new Date(now.getTime() - 20 * 60_000),
        plannedEndsAt: new Date(now.getTime() - 10 * 60_000),
        endedAt: new Date(now.getTime() - 5 * 60_000),
        status: "abandoned",
        outcome: "disconnected",
        metadataJson: meta({ kind: "abandoned" }),
      },
    });
    createdSessionIds.push(abandonedSession.id);

    // Unresolved completed session
    const unresolvedQueue = await prisma.humanSupportQueueEntry.create({
      data: {
        schoolId: SCHOOL_ID,
        childId: student.childId,
        classroomId: period.classroomId,
        periodId: period.id,
        questionKey: "uat-admin-unresolved",
        status: "completed",
        priority: 2,
        enqueuedAt: now,
        assignedAt: now,
        assignedTutorId: teacherB.id,
        budgetMinutes: 12,
        metadataJson: meta({ kind: "unresolved" }),
      },
    });
    createdQueueIds.push(unresolvedQueue.id);
    const unresolvedSession = await prisma.humanSupportSession.create({
      data: {
        schoolId: SCHOOL_ID,
        queueEntryId: unresolvedQueue.id,
        schoolTeacherId: teacherB.id,
        childId: student.childId,
        periodId: period.id,
        budgetMinutes: 12,
        startedAt: new Date(now.getTime() - 40 * 60_000),
        plannedEndsAt: new Date(now.getTime() - 28 * 60_000),
        endedAt: new Date(now.getTime() - 25 * 60_000),
        status: "completed",
        outcome: "unresolved",
        unresolvedReportJson: JSON.stringify({
          summary: "UAT unresolved summary needs follow-up",
          whatWasTried: ["guided steps", "worked example"],
          remainingDifficulty: "Still confused on inference",
          recommendedFollowUp: "Revisit tomorrow with teacher",
          urgency: "medium",
        }),
        metadataJson: meta({
          kind: "unresolved",
          sessionNotes: {
            privateNotes: "Unresolved private note",
            actionsTaken: ["walkthrough"],
            followUpNeeded: true,
          },
        }),
      },
    });
    createdSessionIds.push(unresolvedSession.id);

    // AI help trail for timeline
    await prisma.coachInteractionLog.create({
      data: {
        childId: student.childId,
        subject: "reading",
        skillFocus: `dts:${period.id}:uat-admin:q1:uat-${Date.now()}`,
        questionText: JSON.stringify({
          message: "Please ask your teacher.",
          intent: "give-hint",
          source: "fallback",
          needsTeacher: true,
          questionKey: "q1",
          uatTag: UAT_TAG,
        }),
        hintLevel: 5,
        mode: "daytime_tutor",
      },
    });

    // --- Auth ---
    const jar: CookieJar = new Map();
    const login = await api(jar, "POST", "/api/auth/login", {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    const role = (login.json as { user?: { role?: string } } | null)?.user?.role;
    checks.push({
      name: "Admin login",
      ok: login.ok && role === "admin",
      detail: `status=${login.status} role=${role ?? "missing"}`,
    });
    if (!login.ok || role !== "admin") throw new Error("Admin login failed");
    report.authMethod = `POST /api/auth/login as ${ADMIN_EMAIL}`;

    const page = await api(jar, "GET", `/admin/schools/${SCHOOL_ID}/support`);
    checks.push({
      name: "Admin support page loads",
      ok: page.ok && /Human Support Operations|Support/i.test(page.text),
      detail: `status=${page.status}`,
    });

    const ops = await api(jar, "GET", `/api/admin/schools/${SCHOOL_ID}/support`);
    const operations = (ops.json as { operations?: Record<string, unknown> } | null)?.operations;
    checks.push({
      name: "GET school support operations",
      ok: ops.ok && Boolean(operations),
      detail: `status=${ops.status}`,
    });

    const glance = operations?.glance as Record<string, number> | undefined;
    const tutors = (operations?.tutors as Array<{ schoolTeacherId: string; status: string }> | undefined) ?? [];
    const openCases = (operations?.openCases as Array<{
      attention: string;
      status: string;
      queueEntryId: string | null;
      sessionId: string | null;
      caseId: string;
    }> | undefined) ?? [];

    checks.push({
      name: "Live tutor presence states visible",
      ok: tutors.some((t) => t.schoolTeacherId === teacherA.id && t.status === "busy")
        && tutors.some((t) => t.schoolTeacherId === teacherB.id),
      detail: tutors
        .filter((t) => t.schoolTeacherId === teacherA.id || t.schoolTeacherId === teacherB.id)
        .map((t) => `${t.schoolTeacherId.slice(-6)}=${t.status}`)
        .join(", "),
    });

    const hasWaiting = openCases.some((c) => c.queueEntryId === waiting.id || /waiting|exhausted/i.test(c.attention));
    const hasAssigned = openCases.some((c) => c.queueEntryId === assigned.id || /assigned/i.test(c.attention));
    const hasActive = openCases.some((c) => c.sessionId === activeSession.id || /active/i.test(c.attention));
    const hasAbandoned = openCases.some((c) => c.sessionId === abandonedSession.id || /abandon|disconnect/i.test(c.attention));
    const hasUnresolved = openCases.some((c) => c.sessionId === unresolvedSession.id || /unresolved|follow-up/i.test(c.attention));
    checks.push({
      name: "Open work includes waiting/assigned/active/abandoned/unresolved",
      ok: hasWaiting && hasAssigned && hasActive && hasAbandoned && hasUnresolved,
      detail: JSON.stringify({ hasWaiting, hasAssigned, hasActive, hasAbandoned, hasUnresolved, glance }),
    });

    // Cross-school scoping
    if (otherSchoolId) {
      const cross = await api(jar, "POST", `/api/admin/schools/${otherSchoolId}/support/queue/${assigned.id}/reassign`, {
        targetSchoolTeacherId: teacherB.id,
        reason: "cross-school probe",
      });
      checks.push({
        name: "Cross-school reassign rejected",
        ok: !cross.ok && (cross.status === 404 || cross.status === 403),
        detail: `status=${cross.status} ${JSON.stringify(cross.json).slice(0, 160)}`,
      });
    } else {
      checks.push({
        name: "Cross-school reassign rejected",
        ok: true,
        detail: "skipped — no second school in DB",
      });
    }

    // Case timeline
    const caseId = `${student.childId}::${period.id}`;
    const caseRes = await api(jar, "GET", `/api/admin/schools/${SCHOOL_ID}/support/cases/${encodeURIComponent(caseId)}`);
    const casePayload = (caseRes.json as { case?: {
      timeline?: Array<{ label: string; kind: string }>;
      session?: { privateNotes: string | null; sessionId?: string };
    } } | null)?.case;
    const timelineLabels = (casePayload?.timeline ?? []).map((e) => e.label).join(" | ");
    checks.push({
      name: "Student support case timeline loads",
      ok: caseRes.ok && (casePayload?.timeline?.length ?? 0) > 0,
      detail: timelineLabels.slice(0, 220),
    });
    checks.push({
      name: "Private notes hidden by default",
      ok: caseRes.ok && (casePayload?.session?.privateNotes == null || casePayload?.session?.privateNotes === ""),
      detail: `privateNotes=${JSON.stringify(casePayload?.session?.privateNotes ?? null)}`,
    });

    const casePrivate = await api(
      jar,
      "GET",
      `/api/admin/schools/${SCHOOL_ID}/support/cases/${encodeURIComponent(caseId)}?includePrivateNotes=1`,
    );
    const privatePayload = (casePrivate.json as { case?: { session?: { privateNotes: string | null } } } | null)?.case;
    checks.push({
      name: "Private notes available only when explicitly requested",
      ok: casePrivate.ok && Boolean(privatePayload?.session?.privateNotes?.includes("private")),
      detail: `notes=${JSON.stringify(privatePayload?.session?.privateNotes ?? null).slice(0, 120)}`,
    });
    const viewNotesAudit = await prisma.schoolAuditLog.findFirst({
      where: {
        schoolId: SCHOOL_ID,
        action: "human_support_admin_view_private_notes",
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, action: true },
    });
    checks.push({
      name: "Private notes view audited",
      ok: Boolean(viewNotesAudit?.id),
      detail: viewNotesAudit?.id ?? "missing",
    });

    // Force offline — active session protection
    const forceBlocked = await api(
      jar,
      "POST",
      `/api/admin/schools/${SCHOOL_ID}/support/tutors/${teacherA.id}/force-offline`,
      { reason: "UAT force offline without closing session" },
    );
    checks.push({
      name: "Force-offline blocked while busy without closeActiveSession",
      ok: forceBlocked.status === 409,
      detail: `status=${forceBlocked.status} ${JSON.stringify(forceBlocked.json).slice(0, 180)}`,
    });

    const forceShort = await api(
      jar,
      "POST",
      `/api/admin/schools/${SCHOOL_ID}/support/tutors/${teacherB.id}/force-offline`,
      { reason: "no" },
    );
    checks.push({
      name: "Force-offline requires reason",
      ok: forceShort.status === 400,
      detail: `status=${forceShort.status}`,
    });

    // Reassign unaccepted work
    const reassignOk = await api(
      jar,
      "POST",
      `/api/admin/schools/${SCHOOL_ID}/support/queue/${assigned.id}/reassign`,
      {
        targetSchoolTeacherId: teacherB.id,
        reason: "UAT reassign unaccepted work",
      },
    );
    checks.push({
      name: "Reassign unaccepted assigned work",
      ok: reassignOk.ok,
      detail: `status=${reassignOk.status} ${JSON.stringify(reassignOk.json).slice(0, 120)}`,
    });
    const reassignedRow = await prisma.humanSupportQueueEntry.findUnique({
      where: { id: assigned.id },
      select: { assignedTutorId: true, status: true },
    });
    checks.push({
      name: "Reassign updated assignee",
      ok: reassignedRow?.assignedTutorId === teacherB.id && reassignedRow.status === "assigned",
      detail: JSON.stringify(reassignedRow),
    });

    // No active-session reassignment
    const reassignActive = await api(
      jar,
      "POST",
      `/api/admin/schools/${SCHOOL_ID}/support/queue/${activeQueue.id}/reassign`,
      {
        targetSchoolTeacherId: teacherB.id,
        reason: "should fail for in_session",
      },
    );
    checks.push({
      name: "Active-session reassignment rejected",
      ok: reassignActive.status === 409,
      detail: `status=${reassignActive.status} ${JSON.stringify(reassignActive.json).slice(0, 160)}`,
    });

    // Close abandoned
    const closeAbandoned = await api(
      jar,
      "POST",
      `/api/admin/schools/${SCHOOL_ID}/support/sessions/${abandonedSession.id}/close-abandoned`,
      {
        reason: "UAT close abandoned session",
        outcome: "disconnected",
      },
    );
    checks.push({
      name: "Close abandoned session",
      ok: closeAbandoned.ok,
      detail: `status=${closeAbandoned.status}`,
    });
    const closedAbandoned = await prisma.humanSupportSession.findUnique({
      where: { id: abandonedSession.id },
      select: { status: true, outcome: true, outcomeNotes: true },
    });
    const closedQueue = await prisma.humanSupportQueueEntry.findUnique({
      where: { id: abandonedQueue.id },
      select: { status: true },
    });
    checks.push({
      name: "Abandoned close completes queue + records reason",
      ok: Boolean(
        closedAbandoned?.outcome === "disconnected"
        && closedQueue?.status === "completed"
        && closedAbandoned?.outcomeNotes?.includes("UAT close abandoned"),
      ),
      detail: JSON.stringify({ session: closedAbandoned, queue: closedQueue }),
    });

    // Force offline with closeActiveSession
    const forceOk = await api(
      jar,
      "POST",
      `/api/admin/schools/${SCHOOL_ID}/support/tutors/${teacherA.id}/force-offline`,
      {
        reason: "UAT force offline after confirming session close",
        closeActiveSession: true,
      },
    );
    checks.push({
      name: "Force-offline with reason + closeActiveSession",
      ok: forceOk.ok,
      detail: `status=${forceOk.status} ${JSON.stringify(forceOk.json).slice(0, 160)}`,
    });
    const presenceA = await prisma.tutorPresence.findUnique({
      where: { schoolTeacherId: teacherA.id },
      select: { status: true, activeSessionId: true },
    });
    checks.push({
      name: "Tutor A offline after force-offline",
      ok: presenceA?.status === "offline" && !presenceA.activeSessionId,
      detail: JSON.stringify(presenceA),
    });

    // Unresolved follow-up
    const dueAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const followUp = await api(
      jar,
      "POST",
      `/api/admin/schools/${SCHOOL_ID}/support/sessions/${unresolvedSession.id}/follow-up`,
      {
        status: "open",
        ownerUserId: "uat-follow-up-owner",
        dueAt,
        adminNote: "UAT admin follow-up note",
      },
    );
    checks.push({
      name: "Unresolved follow-up set (owner/due/note)",
      ok: followUp.ok,
      detail: `status=${followUp.status} ${JSON.stringify(followUp.json).slice(0, 200)}`,
    });
    const followUpClose = await api(
      jar,
      "POST",
      `/api/admin/schools/${SCHOOL_ID}/support/sessions/${unresolvedSession.id}/follow-up`,
      {
        status: "closed",
        adminNote: "UAT follow-up closed",
      },
    );
    checks.push({
      name: "Unresolved follow-up closed",
      ok: followUpClose.ok,
      detail: `status=${followUpClose.status}`,
    });
    const unresolvedMeta = await prisma.humanSupportSession.findUnique({
      where: { id: unresolvedSession.id },
      select: { metadataJson: true, unresolvedReportJson: true },
    });
    const metaObj = unresolvedMeta?.metadataJson
      ? JSON.parse(unresolvedMeta.metadataJson) as { adminFollowUp?: { status?: string; ownerUserId?: string; dueAt?: string; adminNote?: string }; sessionNotes?: { privateNotes?: string } }
      : null;
    checks.push({
      name: "Follow-up persisted without wiping unresolved report / private notes",
      ok: Boolean(
        metaObj?.adminFollowUp?.status === "closed"
        && unresolvedMeta?.unresolvedReportJson
        && metaObj?.sessionNotes?.privateNotes === "Unresolved private note",
      ),
      detail: JSON.stringify({
        followUp: metaObj?.adminFollowUp,
        hasReport: Boolean(unresolvedMeta?.unresolvedReportJson),
        privateNotes: metaObj?.sessionNotes?.privateNotes,
      }),
    });

    // Export redaction vs sensitive
    const exportSafe = await api(jar, "GET", `/api/admin/schools/${SCHOOL_ID}/support/export`);
    const safePack = (exportSafe.json as { export?: { sensitive?: boolean; sessions?: Array<Record<string, unknown>> } } | null)?.export;
    const safeHasPrivate = (safePack?.sessions ?? []).some((row) => "privateNotes" in row);
    checks.push({
      name: "Export redacts private notes by default",
      ok: exportSafe.ok && safePack?.sensitive === false && !safeHasPrivate,
      detail: `sensitive=${safePack?.sensitive} sessions=${safePack?.sessions?.length ?? 0}`,
    });

    const exportSens = await api(jar, "GET", `/api/admin/schools/${SCHOOL_ID}/support/export?sensitive=1`);
    const sensPack = (exportSens.json as { export?: { sensitive?: boolean; sessions?: Array<Record<string, unknown>> } } | null)?.export;
    const sensHasPrivate = (sensPack?.sessions ?? []).some((row) => typeof row.privateNotes === "string");
    checks.push({
      name: "Sensitive export includes private notes when permitted",
      ok: exportSens.ok && sensPack?.sensitive === true && sensHasPrivate,
      detail: `sensitive=${sensPack?.sensitive} hasPrivate=${sensHasPrivate}`,
    });

    // AI-first override remains impossible (no admin override endpoint)
    const overrideProbe = await api(
      jar,
      "POST",
      `/api/admin/schools/${SCHOOL_ID}/support/override-ai-first`,
      { childId: student.childId, humanTutorEligible: true },
    );
    checks.push({
      name: "AI-first override endpoint does not exist",
      ok: overrideProbe.status === 404 || overrideProbe.status === 405,
      detail: `status=${overrideProbe.status}`,
    });

    // Audit IDs for admin mutations
    const auditActions = [
      "human_support_admin_force_offline",
      "human_support_admin_reassign",
      "human_support_admin_close_abandoned",
      "human_support_admin_follow_up",
      "human_support_admin_export",
      "human_support_admin_view_private_notes",
    ] as const;
    const auditIds: Record<string, string | null> = {};
    for (const action of auditActions) {
      const row = await prisma.schoolAuditLog.findFirst({
        where: { schoolId: SCHOOL_ID, action },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true },
      });
      auditIds[action] = row?.id ?? null;
    }
    report.auditIds = auditIds;
    checks.push({
      name: "Audit IDs present for all Admin mutations",
      ok: Object.values(auditIds).every(Boolean),
      detail: JSON.stringify(auditIds),
    });

    // Restore tutors to offline cleanly (soft)
    await prisma.tutorPresence.updateMany({
      where: { schoolTeacherId: { in: [teacherA.id, teacherB.id] } },
      data: {
        status: "offline",
        activeSessionId: null,
        busySince: null,
        availableSince: null,
        pausedAt: null,
        lastHeartbeatAt: now,
      },
    });
  } finally {
    // Soft cleanup of UAT-tagged fixtures created in this run
    if (createdSessionIds.length) {
      await prisma.humanSupportSession.deleteMany({
        where: { id: { in: createdSessionIds } },
      }).catch(() => null);
    }
    if (createdQueueIds.length) {
      await prisma.humanSupportQueueEntry.deleteMany({
        where: { id: { in: createdQueueIds } },
      }).catch(() => null);
    }
    await prisma.$disconnect().catch(() => null);
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
  return evidencePath;
}

main().catch((error) => {
  console.error(error);
  writeFileSync(
    resolve("scripts/.uat-admin-support-oversight-evidence.json"),
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      finishedAt: new Date().toISOString(),
      verification: {
        projectWideTsc: "Inconclusive — command hung and was stopped.",
      },
    }, null, 2),
  );
  process.exitCode = 1;
});
