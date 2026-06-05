import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import {
  BRAIN_WARNING_REVIEW_ACTION,
  BRAIN_WARNING_REVIEW_ENTITY_TYPE,
  buildBrainWarningFingerprint,
  snapshotStatus,
} from "@/app/api/admin/brain-centre/_lib";
import { getStudentLearningBrain } from "@/lib/student-learning-brain";
import { refreshAcademicIntelligenceSnapshot } from "@/lib/academic-intelligence/snapshot";
import { syncCatchUpTasks } from "@/lib/academic-intelligence/catchUpTasks";
import { syncHomeworkTasks } from "@/lib/academic-intelligence/homeworkTasks";

type Params = { params: Promise<{ studentId: string }> };

const actionSchema = z.object({
  action: z.enum([
    "refresh_snapshot",
    "generate_catch_up_recommendation",
    "generate_homework_recommendation",
    "rerun_recommendation_sync_audit",
    "mark_warning_reviewed",
  ]),
  note: z.string().trim().max(1000).optional(),
});

type ActionDeps = {
  requireAdmin: typeof requireAdmin;
  getStudentLearningBrain: typeof getStudentLearningBrain;
  refreshAcademicIntelligenceSnapshot: typeof refreshAcademicIntelligenceSnapshot;
  syncCatchUpTasks: typeof syncCatchUpTasks;
  syncHomeworkTasks: typeof syncHomeworkTasks;
  writeAuditLog: typeof writeAuditLog;
  findStudentProfileJson: (studentId: string) => Promise<string | null>;
};

export async function handleAdminBrainCentreActionPost(
  request: Request,
  context: Params,
  deps: ActionDeps = {
    requireAdmin,
    getStudentLearningBrain,
    refreshAcademicIntelligenceSnapshot,
    syncCatchUpTasks,
    syncHomeworkTasks,
    writeAuditLog,
    findStudentProfileJson: async (studentId) => {
      const student = await prisma.childProfile.findFirst({
        where: { id: studentId, archived: false },
        select: { studentProfile: { select: { aiLearningProfileJson: true } } },
      });
      return student?.studentProfile?.aiLearningProfileJson ?? null;
    },
  },
) {
  const { session, response } = await deps.requireAdmin();
  if (!session) return response;

  const { studentId } = await context.params;
  const body = actionSchema.parse(await request.json());

  const brain = await deps.getStudentLearningBrain(studentId, { includeCoachSignals: true });
  if (!brain) return NextResponse.json({ error: "Brain not available." }, { status: 404 });
  const profileJson = await deps.findStudentProfileJson(studentId);
  const snapshot = snapshotStatus(profileJson);
  const warningFingerprint = buildBrainWarningFingerprint({
    studentId,
    heartbeat: brain.heartbeatSummary,
    recommendationSync: brain.academicIntelligence.recommendationSync,
    dataState: brain.dataState,
    snapshotStatus: snapshot.status,
  });

  let result: Record<string, unknown> = {};
  if (body.action === "refresh_snapshot") {
    result = {
      snapshot: await deps.refreshAcademicIntelligenceSnapshot({
        studentId,
        reason: "manual_refresh",
      }),
    };
  }

  if (body.action === "generate_catch_up_recommendation") {
    result = {
      catchUpTasks: await deps.syncCatchUpTasks({
        studentId,
        recommendations: brain.academicIntelligence.catchUpRecommendations,
        schoolWeekModePlan: brain.academicIntelligence.schoolWeekModePlan,
        actorUserId: session.userId,
      }),
    };
  }

  if (body.action === "generate_homework_recommendation") {
    result = {
      homeworkTasks: await deps.syncHomeworkTasks({
        studentId,
        schoolWeekModePlan: brain.academicIntelligence.schoolWeekModePlan,
        actorUserId: session.userId,
      }),
    };
  }

  if (body.action === "rerun_recommendation_sync_audit") {
    result = {
      recommendationSync: brain.academicIntelligence.recommendationSync,
    };
  }

  if (body.action === "mark_warning_reviewed") {
    result = {
      reviewed: true,
      warningFingerprint,
      heartbeatAction: brain.heartbeatSummary.primaryAction,
      recommendationSyncStatus: brain.academicIntelligence.recommendationSync.status,
    };
  }

  await deps.writeAuditLog({
    actorUserId: session.userId,
    action: body.action === "mark_warning_reviewed" ? BRAIN_WARNING_REVIEW_ACTION : `brain_centre_${body.action}`,
    entityType: BRAIN_WARNING_REVIEW_ENTITY_TYPE,
    entityId: studentId,
    metadata: {
      note: body.note ?? null,
      warningFingerprint,
      lifecycleStatus: body.action === "mark_warning_reviewed" ? "reviewed" : null,
      heartbeatAction: brain.heartbeatSummary.primaryAction,
      heartbeatRiskLevel: brain.heartbeatSummary.riskLevel,
      heartbeatUrgency: brain.heartbeatSummary.urgency,
      recommendationSyncStatus: brain.academicIntelligence.recommendationSync.status,
      recommendationMismatchCount: brain.academicIntelligence.recommendationSync.mismatches.length,
      dataState: brain.dataState.state,
      checklistStatus: brain.dataState.checklistStatus,
      snapshotStatus: snapshot.status,
    },
  });

  return NextResponse.json({
    ok: true,
    action: body.action,
    studentId,
    result,
  });
}

export async function POST(request: Request, context: Params) {
  return handleAdminBrainCentreActionPost(request, context);
}
