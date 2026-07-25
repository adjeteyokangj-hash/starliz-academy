import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { getSchoolTeacherContext } from "@/lib/schools/rbac";
import { loadLiveClassroomBoard } from "@/lib/schools/live-classroom";
import { writeSchoolAuditLog } from "@/lib/schools/audit";
import {
  acceptHumanSupportAssignment,
  assignHumanSupportStudent,
  releaseHumanSupportAssignment,
} from "@/lib/schools/human-support-scheduler";
import { heartbeatTutorPresence } from "@/lib/schools/human-support-presence";

type Params = { params: Promise<{ dayLessonId: string }> };

export async function GET(request: Request, context: Params) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const ctx = await getSchoolTeacherContext(session.userId);
  if (!ctx) {
    return NextResponse.json({ error: "No active school teacher membership." }, { status: 403 });
  }

  const { dayLessonId } = await context.params;
  const params = new URL(request.url).searchParams;
  const supportingRaw = params.get("supporting") ?? "";
  const supportingChildIds = supportingRaw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  await heartbeatTutorPresence({
    schoolId: ctx.schoolId,
    schoolTeacherId: ctx.schoolTeacherId,
    actorUserId: session.userId,
    dayLessonId,
  });

  const result = await loadLiveClassroomBoard({
    dayLessonId,
    schoolId: ctx.schoolId,
    schoolTeacherId: ctx.schoolTeacherId,
    role: ctx.role,
    supportingChildIds,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, board: result.board });
}

/**
 * Human tutor workflow:
 * - action=assign → claim assignment (no session yet)
 * - action=accept → freeze snapshot + start active session
 * - action=release → decline claimed assignment back to waiting
 */
export async function POST(request: Request, context: Params) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const ctx = await getSchoolTeacherContext(session.userId);
  if (!ctx) {
    return NextResponse.json({ error: "No active school teacher membership." }, { status: 403 });
  }

  const { dayLessonId } = await context.params;
  const body = await request.json().catch(() => null);
  const childId = body && typeof body === "object" && typeof (body as { childId?: unknown }).childId === "string"
    ? (body as { childId: string }).childId
    : null;
  const queueEntryId = body && typeof body === "object" && typeof (body as { queueEntryId?: unknown }).queueEntryId === "string"
    ? (body as { queueEntryId: string }).queueEntryId
    : null;
  const action = body && typeof body === "object" && typeof (body as { action?: unknown }).action === "string"
    ? (body as { action: string }).action
    : "assign";

  if (!childId && action !== "accept" && action !== "release") {
    return NextResponse.json({ error: "childId is required." }, { status: 400 });
  }
  if (action === "accept" && !childId && !queueEntryId) {
    return NextResponse.json({ error: "childId or queueEntryId is required to accept." }, { status: 400 });
  }
  if (action === "release" && !queueEntryId) {
    return NextResponse.json({ error: "queueEntryId is required to release." }, { status: 400 });
  }

  await heartbeatTutorPresence({
    schoolId: ctx.schoolId,
    schoolTeacherId: ctx.schoolTeacherId,
    actorUserId: session.userId,
    dayLessonId,
  });

  const boardResult = await loadLiveClassroomBoard({
    dayLessonId,
    schoolId: ctx.schoolId,
    schoolTeacherId: ctx.schoolTeacherId,
    role: ctx.role,
  });

  if (!boardResult.ok) {
    return NextResponse.json({ error: boardResult.error }, { status: boardResult.status });
  }

  if (action === "release") {
    const releaseId = queueEntryId ?? boardResult.board.viewer.myAssignment?.queueEntryId ?? null;
    if (!releaseId) {
      return NextResponse.json({ error: "queueEntryId is required to release." }, { status: 400 });
    }
    const released = await releaseHumanSupportAssignment({
      schoolId: ctx.schoolId,
      schoolTeacherId: ctx.schoolTeacherId,
      actorUserId: session.userId,
      queueEntryId: releaseId,
    });
    if (!released.ok) {
      return NextResponse.json({ error: released.error }, { status: released.status });
    }
    const refreshed = await loadLiveClassroomBoard({
      dayLessonId,
      schoolId: ctx.schoolId,
      schoolTeacherId: ctx.schoolTeacherId,
      role: ctx.role,
    });
    if (!refreshed.ok) {
      return NextResponse.json({ error: refreshed.error }, { status: refreshed.status });
    }
    return NextResponse.json({
      ok: true,
      mode: "released",
      queueEntryId: released.queueEntryId,
      message: "Assignment released. Student remains on AI support.",
      board: refreshed.board,
    });
  }

  const targetChildId = childId
    ?? boardResult.board.viewer.myAssignment?.childId
    ?? null;
  const student = targetChildId
    ? boardResult.board.students.find((row) => row.childId === targetChildId)
    : null;
  if (!student) {
    return NextResponse.json({ error: "Student not in this classroom period." }, { status: 404 });
  }

  if (action === "assign" || action === "join") {
    if (!student.canJoinAsHumanTutor && student.teacherState !== "supporting" && !student.assignedToMe) {
      return NextResponse.json({
        error: "Join as human tutor is only available when AI support is exhausted and the student has not recovered.",
        humanTutorEligible: false,
        canOpenDrawer: true,
      }, { status: 403 });
    }

    if (boardResult.board.tutorCounts.online === 0) {
      return NextResponse.json({
        error: "No tutors online — student remains with AI support (no waiting queue).",
        humanSupportState: "ai-only",
      }, { status: 409 });
    }

    const assigned = await assignHumanSupportStudent({
      schoolId: ctx.schoolId,
      schoolTeacherId: ctx.schoolTeacherId,
      actorUserId: session.userId,
      periodId: dayLessonId,
      childId: student.childId,
      classroomId: boardResult.board.period.classroomId,
      assignmentId: student.activeAssignmentId,
      questionKey: student.currentQuestionKey,
      minutesUntilPeriodEnd: boardResult.board.period.minutesRemaining,
      eligibleStudentCount: boardResult.board.counts.teacherRequired,
      humanTutorEligible: student.humanTutorEligible || student.assignedToMe,
    });

    if (!assigned.ok) {
      return NextResponse.json({ error: assigned.error }, { status: assigned.status });
    }

    await writeSchoolAuditLog({
      schoolId: ctx.schoolId,
      actorUserId: session.userId,
      actorSchoolTeacherId: ctx.schoolTeacherId,
      actorType: "school_staff",
      source: "api",
      action: "live_classroom_intervene",
      entityType: "student",
      entityId: student.childId,
      metadata: {
        dayLessonId,
        childId: student.childId,
        queueEntryId: assigned.queueEntryId,
        phase: "assigned",
      },
      severity: "warning",
    });

    const refreshed = await loadLiveClassroomBoard({
      dayLessonId,
      schoolId: ctx.schoolId,
      schoolTeacherId: ctx.schoolTeacherId,
      role: ctx.role,
      supportingChildIds: [student.childId],
    });

    if (!refreshed.ok) {
      return NextResponse.json({ error: refreshed.error }, { status: refreshed.status });
    }

    return NextResponse.json({
      ok: true,
      mode: "assigned",
      queueEntryId: assigned.queueEntryId,
      budgetMinutesEstimate: assigned.budgetMinutesEstimate,
      message: "Assignment claimed. Accept to freeze the support snapshot and start the timed session.",
      board: refreshed.board,
      student: refreshed.board.students.find((row) => row.childId === student.childId) ?? null,
    });
  }

  if (action === "accept") {
    if (!student.humanTutorEligible && !student.assignedToMe && student.teacherState !== "supporting") {
      return NextResponse.json({
        error: "Cannot accept — AI-first eligibility no longer holds.",
        humanTutorEligible: false,
      }, { status: 403 });
    }

    const accepted = await acceptHumanSupportAssignment({
      schoolId: ctx.schoolId,
      schoolTeacherId: ctx.schoolTeacherId,
      actorUserId: session.userId,
      periodId: dayLessonId,
      childId: student.childId,
      queueEntryId: queueEntryId ?? boardResult.board.viewer.myAssignment?.queueEntryId ?? null,
      minutesUntilPeriodEnd: boardResult.board.period.minutesRemaining,
      eligibleStudentCount: Math.max(boardResult.board.counts.teacherRequired, 1),
      humanTutorEligible: student.humanTutorEligible || student.assignedToMe,
      snapshotInput: {
        schoolId: ctx.schoolId,
        classroomId: boardResult.board.period.classroomId,
        dayLessonId,
        lessonId: boardResult.board.period.lessonId,
        subject: boardResult.board.period.subject,
        lessonTitle: boardResult.board.period.lessonTitle,
        curriculumSkill: boardResult.board.period.skillFocus,
        periodEndsAt: boardResult.board.period.endsAt,
        student: {
          activeContentId: student.activeContentId,
          activeAssignmentId: student.activeAssignmentId,
          currentQuestionKey: student.currentQuestionKey,
          aiSupportState: student.aiSupportState,
          misconception: student.misconception,
          recoveryOutcome: student.recoveryOutcome ?? null,
          studentRecovered: student.studentRecovered,
          stages: student.stages,
          attempts: student.attempts,
          tutorHistory: student.tutorHistory,
        },
      },
    });

    if (!accepted.ok) {
      return NextResponse.json({ error: accepted.error }, { status: accepted.status });
    }

    const refreshed = await loadLiveClassroomBoard({
      dayLessonId,
      schoolId: ctx.schoolId,
      schoolTeacherId: ctx.schoolTeacherId,
      role: ctx.role,
      supportingChildIds: [student.childId],
    });

    if (!refreshed.ok) {
      return NextResponse.json({ error: refreshed.error }, { status: refreshed.status });
    }

    return NextResponse.json({
      ok: true,
      mode: "supporting",
      humanSession: accepted.session,
      snapshot: accepted.snapshot,
      message: `Support session accepted — ${accepted.session.budgetMinutes} minutes frozen. Snapshot locked at accept.`,
      board: refreshed.board,
      student: refreshed.board.students.find((row) => row.childId === student.childId) ?? null,
    });
  }

  return NextResponse.json({ error: "Unsupported action. Use assign, accept, or release." }, { status: 400 });
}
