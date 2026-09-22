import { NextResponse } from "next/server";
import { readChildSelectionFromCookie, readSessionFromCookie } from "@/lib/auth";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveShortLearningSupportContext, shortLearningSupportMetadata } from "@/lib/schools/short-learning-support-context";
import { resolveStudentHumanSupportEligibility } from "@/lib/schools/support-eligibility";
import { syncShortLearningEligibleQueue } from "@/lib/schools/human-support-scheduler";
import { studentHumanSupportDisplay } from "@/lib/schools/daytime-lesson-ui";

type Params = { params: Promise<{ bookingId: string }> };

async function resolveChildId(session: { userId: string; email: string; role: string }) {
  let childId: string | null = await readChildSelectionFromCookie(session.userId);
  if (!childId && session.role === "parent") {
    const parentScope = await resolveParentScope(session);
    if (parentScope) childId = await resolveParentActiveChildId(parentScope.parentId);
  }
  return childId;
}

/** POST — student invites a human tutor when one is on shift and available. */
export async function POST(request: Request, { params }: Params) {
  const session = await readSessionFromCookie();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const childId = await resolveChildId(session);
  if (!childId) return NextResponse.json({ error: "Select a child profile first." }, { status: 400 });

  const { bookingId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    assignmentId?: string;
    contentId?: string;
    shortLearningSessionId?: string;
    shortLearningBlockId?: string;
    questionId?: string;
  };

  const assignmentId = typeof body.assignmentId === "string" ? body.assignmentId.trim() : "";
  const contentId = typeof body.contentId === "string" ? body.contentId.trim() : "";
  if (!assignmentId || !contentId) {
    return NextResponse.json({ error: "Lesson details are missing." }, { status: 400 });
  }

  const resolved = await resolveShortLearningSupportContext({
    studentId: childId,
    bookingId,
    assignmentId,
    contentId,
    sessionId: body.shortLearningSessionId,
    blockId: body.shortLearningBlockId,
  });
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error, code: resolved.code }, { status: resolved.status });
  }

  const sl = resolved.context;
  const eligibility = resolveStudentHumanSupportEligibility({
    mode: "SHORT_LEARNING",
    aiExhausted: false,
    studentRequestedHelp: true,
    studentRecovered: false,
    bookingActive: true,
  });
  const minutesUntilBookingEnd = Math.max(
    1,
    Math.ceil((sl.bookingEndsAt.getTime() - Date.now()) / 60_000),
  );
  const sync = await syncShortLearningEligibleQueue({
    schoolId: sl.schoolId,
    classroomId: sl.classroomId,
    supportScopeKey: sl.supportScopeKey,
    minutesUntilBookingEnd,
    childId,
    humanTutorEligible: eligibility.humanTutorEligible,
    assignmentId: sl.assignmentId,
    questionKey: typeof body.questionId === "string" ? body.questionId : null,
    metadata: shortLearningSupportMetadata(sl, { invitedByStudent: true }),
  });

  const humanSupport = studentHumanSupportDisplay({
    onlineTutorCount: sync.counts.onlineTutorCount,
    availableTutorCount: sync.counts.availableTutorCount,
    busyTutorCount: Math.max(0, sync.counts.onlineTutorCount - sync.counts.availableTutorCount),
    studentQueued: sync.queued,
    studentSessionActive: sync.humanSupportState === "human-session-active",
  });

  return NextResponse.json({
    ok: true,
    queued: sync.queued,
    continueAi: sync.continueAi,
    unmetEscalation: sync.unmetEscalation,
    humanSupport: {
      ...humanSupport,
      summary: humanSupport.state,
    },
    message: sync.queued
      ? "A tutor has been invited. Keep going with AI help while you wait."
      : sync.humanSupportState === "human-session-active"
        ? "A tutor is already helping you."
        : "No tutor is free right now. Continue with AI help.",
  });
}
