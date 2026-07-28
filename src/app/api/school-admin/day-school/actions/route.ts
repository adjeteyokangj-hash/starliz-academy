import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { canDo } from "@/lib/schools/permissions";
import { requireSchoolAdminContext } from "@/lib/schools/portal-routing";
import { bootstrapDaytimeSchool } from "@/lib/schools/bootstrap-daytime-school";
import { generateDaytimeLessonContent } from "@/lib/schools/generate-daytime-lesson-content";
import {
  approveDaytimeDay,
  approveDaytimeLesson,
  regenerateDaytimeLesson,
} from "@/lib/schools/daytime-lesson-review";
import { updateSchoolDayLesson } from "@/lib/schools/update-school-day-lesson";
import { findSchoolDashboardRecord } from "@/lib/schools/school-admin-payload";

const ALLOWED_ACTIONS = new Set([
  "bootstrapDaytimeSchool",
  "updateSchoolDayLesson",
  "generateDaytimeLessonContent",
  "approveDaytimeLesson",
  "regenerateDaytimeLesson",
  "approveDaytimeDay",
]);

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const ctx = await requireSchoolAdminContext(session.userId);
  if (!ctx) {
    return NextResponse.json({ error: "School admin access required." }, { status: 403 });
  }
  if (!canDo(ctx.role, "manageClassrooms") && !canDo(ctx.role, "viewProgress")) {
    return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const action = typeof (body as { action?: unknown }).action === "string"
    ? (body as { action: string }).action
    : "";
  const payload = ((body as { payload?: unknown }).payload ?? {}) as Record<string, unknown>;

  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  }

  // Membership schoolId is authoritative — never trust client schoolId for tenancy.
  const schoolId = ctx.schoolId;
  const actorUserId = session.userId;

  try {
    switch (action) {
      case "bootstrapDaytimeSchool": {
        const bootstrapped = await bootstrapDaytimeSchool({ schoolId, actorUserId });
        if (!bootstrapped.ok) {
          return NextResponse.json({ error: bootstrapped.error }, { status: bootstrapped.status });
        }
        break;
      }
      case "updateSchoolDayLesson": {
        const updated = await updateSchoolDayLesson({
          schoolId,
          dayLessonId: String(payload.dayLessonId ?? ""),
          actorUserId,
          teacherId: payload.teacherId === null ? null : typeof payload.teacherId === "string" ? payload.teacherId : undefined,
          room: payload.room === null ? null : typeof payload.room === "string" ? payload.room : undefined,
          startsAt: typeof payload.startsAt === "string" ? payload.startsAt : undefined,
          endsAt: typeof payload.endsAt === "string" ? payload.endsAt : undefined,
          subject: typeof payload.subject === "string" ? payload.subject : undefined,
          title: typeof payload.title === "string" ? payload.title : undefined,
          lessonId: payload.lessonId === null ? null : typeof payload.lessonId === "string" ? payload.lessonId : undefined,
        });
        if (!updated.ok) {
          return NextResponse.json(
            { error: updated.error, conflicts: updated.conflicts ?? [] },
            { status: updated.status },
          );
        }
        const schoolAfterUpdate = await findSchoolDashboardRecord(schoolId);
        return NextResponse.json({
          ok: true,
          school: schoolAfterUpdate,
          warnings: updated.warnings ?? [],
        });
      }
      case "generateDaytimeLessonContent": {
        const generated = await generateDaytimeLessonContent({
          schoolId,
          actorUserId,
          classroomId:
            payload.classroomId === null
              ? null
              : typeof payload.classroomId === "string"
                ? payload.classroomId
                : undefined,
          dayOfWeek: typeof payload.dayOfWeek === "number" ? payload.dayOfWeek : undefined,
          force: Boolean(payload.force),
          dayLessonId: typeof payload.dayLessonId === "string" ? payload.dayLessonId : undefined,
        });
        if (!generated.ok) {
          return NextResponse.json({ error: generated.error }, { status: generated.status });
        }
        break;
      }
      case "approveDaytimeLesson": {
        const approved = await approveDaytimeLesson({
          schoolId,
          dayLessonId: String(payload.dayLessonId ?? ""),
          actorUserId,
        });
        if (!approved.ok) {
          return NextResponse.json(
            { error: approved.error, code: approved.code ?? null },
            { status: approved.status },
          );
        }
        break;
      }
      case "regenerateDaytimeLesson": {
        const regenerated = await regenerateDaytimeLesson({
          schoolId,
          dayLessonId: String(payload.dayLessonId ?? ""),
          actorUserId,
          regenerateReason: typeof payload.regenerateReason === "string" ? payload.regenerateReason : null,
          allowWeeklyReview: typeof payload.allowWeeklyReview === "boolean" ? payload.allowWeeklyReview : null,
          reviewReason:
            typeof payload.reviewReason === "string"
              ? payload.reviewReason
              : typeof payload.regenerateReason === "string"
                ? payload.regenerateReason
                : null,
        });
        if (!regenerated.ok) {
          return NextResponse.json({ error: regenerated.error }, { status: regenerated.status });
        }
        break;
      }
      case "approveDaytimeDay": {
        const dayApproved = await approveDaytimeDay({
          schoolId,
          classroomId: String(payload.classroomId ?? ""),
          dayOfWeek: Number(payload.dayOfWeek),
          actorUserId,
        });
        if (!dayApproved.ok) {
          return NextResponse.json(
            {
              error: dayApproved.error,
              code: dayApproved.code ?? null,
              blockers: dayApproved.blockers ?? [],
            },
            { status: dayApproved.status },
          );
        }
        break;
      }
      default:
        return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }

    const school = await findSchoolDashboardRecord(schoolId);
    return NextResponse.json({ ok: true, school });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Action failed.";
    const safe =
      message.length <= 200 && !/prisma|sql|stack|ECONN|timeout|internal/i.test(message)
        ? message
        : "Unable to complete Day School action.";
    return NextResponse.json({ error: safe }, { status: 400 });
  }
}
