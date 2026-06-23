import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { recalculateWeakAreaFromAttempts } from "@/lib/ai/weak-area-detector";
import { resolveParentScope } from "@/lib/parent_scope";
import { checkSubscriptionAccess, getTrialSessionLimit } from "@/lib/subscriptions/enforcement";
import { isPlayableAssignedStatus } from "@/lib/subscriptions/learning-access";
import { updateStudentSkills } from "@/lib/skillEngine";
import { resolveAttemptStudentIdentity, upsertLearningDnaProfileFromAttempt } from "@/lib/attempts/learning_dna_pipeline";
import { invalidateAcademicIntelligenceSnapshot } from "@/lib/academic-intelligence/snapshot";
import {
  writeLearningActivity,
  type WriteLearningActivityDeps,
} from "@/lib/learning-activity/writeLearningActivity";

type AttemptRouteDeps = {
  prisma: typeof prisma;
  requireSession: typeof requireSession;
  resolveParentScope: typeof resolveParentScope;
  checkSubscriptionAccess: typeof checkSubscriptionAccess;
  getTrialSessionLimit: typeof getTrialSessionLimit;
  resolveAttemptStudentIdentity: typeof resolveAttemptStudentIdentity;
  recalculateWeakAreaFromAttempts: typeof recalculateWeakAreaFromAttempts;
  updateStudentSkills: typeof updateStudentSkills;
  upsertLearningDnaProfileFromAttempt: typeof upsertLearningDnaProfileFromAttempt;
  invalidateAcademicIntelligenceSnapshot: typeof invalidateAcademicIntelligenceSnapshot;
  writeAuditLog: typeof writeAuditLog;
  writeLearningActivity?: typeof writeLearningActivity;
};

const defaultDeps: AttemptRouteDeps = {
  prisma,
  requireSession,
  resolveParentScope,
  checkSubscriptionAccess,
  getTrialSessionLimit,
  resolveAttemptStudentIdentity,
  recalculateWeakAreaFromAttempts,
  updateStudentSkills,
  upsertLearningDnaProfileFromAttempt,
  invalidateAcademicIntelligenceSnapshot,
  writeAuditLog,
  writeLearningActivity,
};

const attemptSchema = z.object({
  studentId: z.string().min(1),
  subject: z.enum(["spelling", "math", "reading"]),
  spellingMode: z.string().optional(),
  keyStage: z.string().optional(),
  yearGroup: z.string().optional(),
  skillFocus: z.string().min(1),
  contentId: z.string().optional(),
  assignmentId: z.string().optional(),
  questionText: z.string().optional(),
  answerGiven: z.string().optional(),
  correctAnswer: z.string().optional(),
  correct: z.boolean(),
  responseTimeMs: z.number().int().min(0).default(0),
  hintsUsed: z.number().int().min(0).default(0),
  difficulty: z.number().int().min(1).max(5).default(1),
  skills: z.string().optional(), // comma-separated skill codes
  pronunciationAttempted: z.boolean().optional(),
  pronunciationPassed: z.boolean().optional(),
  spokenText: z.string().optional(),
  targetText: z.string().optional(),
  errorType: z.string().optional(),
  idempotencyKey: z.string().min(1).optional(),
});

export async function handleAttemptPost(request: Request, deps: AttemptRouteDeps = defaultDeps) {
  const { session, response } = await deps.requireSession();
  if (!session) return response;

  try {
    const body = attemptSchema.parse(await request.json());
    const parentScope = await deps.resolveParentScope(session);
    if (!parentScope) {
      return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
    }

    const { resolvedStudentId, assignment } = await deps.resolveAttemptStudentIdentity(deps.prisma, {
      assignmentId: body.assignmentId,
      requestedStudentId: body.studentId,
      parentId: parentScope.parentId,
    });

    const [user, access] = await Promise.all([
      deps.prisma.user.findUnique({ where: { id: parentScope.parentId }, select: { trialSessionsUsed: true } }),
      deps.checkSubscriptionAccess(parentScope.parentId),
    ]);

    const hasPaidSubscription = access.hasPaidSubscription === true && access.allowed;
    const hasPlayableAssignedAccess = isPlayableAssignedStatus(assignment?.status);
    if (!hasPaidSubscription && !hasPlayableAssignedAccess && (user?.trialSessionsUsed ?? 0) >= deps.getTrialSessionLimit()) {
      return NextResponse.json({ error: "Subscription required" }, { status: 403 });
    }

    const student = await deps.prisma.childProfile.findFirst({
      where: { id: resolvedStudentId, parentId: parentScope.parentId },
      select: { id: true },
    });
    if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

    const { idempotencyKey, ...attempt } = body;
    const result = await (deps.writeLearningActivity ?? writeLearningActivity)({
      actorUserId: session.userId,
      clientStudentId: body.studentId,
      resolvedStudentId,
      assignment,
      idempotencyKey,
      attempt,
    }, {
      prisma: deps.prisma,
      recalculateWeakAreaFromAttempts: deps.recalculateWeakAreaFromAttempts,
      updateStudentSkills: deps.updateStudentSkills,
      upsertLearningDnaProfileFromAttempt: deps.upsertLearningDnaProfileFromAttempt,
      invalidateAcademicIntelligenceSnapshot: deps.invalidateAcademicIntelligenceSnapshot,
      writeAuditLog: deps.writeAuditLog,
    } satisfies WriteLearningActivityDeps);

    return NextResponse.json({
      ok: true,
      attempt: result.attempt,
      weakArea: result.weakArea,
      skills: result.skills,
      learningDnaUpdatedForChildId: result.learningDnaUpdatedForChildId,
      studentResolution: result.studentResolution,
      message: "Attempt saved.",
    }, { status: 201 });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Attempt submission failed:", error);
    }
    return NextResponse.json({ error: "Invalid attempt payload." }, { status: 400 });
  }
}
