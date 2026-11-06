import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { activityDefinition, activityReleased } from "./learning/catalogue";
import { ACTIVITY_VERSION, type ActivityState } from "./learning/types";
import { publicActivityView } from "./learning/public-view";
import { codingAssistanceEnabled } from "./settings";
import { stateAfterTeacherFeedback } from "./teacher-feedback-policy";
import { stageArtifact } from "./learning/state-machine";
import { evaluateStudentAssignmentAccess } from "@/lib/schools/licensing";
import { codingPlanIncludesLab } from "./learning/entitlements";

const prefix = `curriculum:${ACTIVITY_VERSION}:`;
function definition(lessonId: string) {
  if (!lessonId.startsWith(prefix)) return null;
  const activity = activityDefinition(lessonId.slice(prefix.length));
  return activity && activityReleased(activity.id) && lessonId === `${prefix}${activity.id}` ? activity : null;
}
export async function teacherActivityIndex(childIds: string[]) {
  if (!childIds.length) return [];
  const rows = await prisma.codingWorkspace.findMany({ where: { childId: { in: childIds }, lessonId: { startsWith: prefix } }, orderBy: { updatedAt: "desc" }, take: 100,
    select: { id: true, childId: true, lessonId: true, stage: true, skillStatus: true, assignmentStatus: true, attemptCount: true, checksPassed: true, updatedAt: true } });
  return rows.flatMap(({ lessonId, ...row }) => { const activity = definition(lessonId); return activity ? [{ ...row, activity: { id: activity.id, title: activity.title, kind: activity.kind, year: activity.year, pathwayId: activity.pathwayId } }] : []; });
}
function savedState(programsJson: string, activityId: string): ActivityState | null {
  if (Buffer.byteLength(programsJson) > 524288) return null;
  try {
    const value = JSON.parse(programsJson) as ActivityState;
    return value.schema === 1 && value.version === ACTIVITY_VERSION && value.activityId === activityId && Array.isArray(value.completed) && Array.isArray(value.assistedVariantIds) && Array.isArray(value.tutorMessages) && value.artifacts && Number.isInteger(value.independentVariant) ? value : null;
  } catch { return null; }
}
export async function teacherActivityDetail(workspaceId: string, childIds: string[]) {
  if (!childIds.length) return null;
  const row = await prisma.codingWorkspace.findFirst({ where: { id: workspaceId, childId: { in: childIds }, lessonId: { startsWith: prefix } } });
  if (!row) return null;
  const activity = definition(row.lessonId), state = activity && savedState(row.programsJson, activity.id);
  if (!activity || !state) return null;
  return { id: row.id, childId: row.childId, teacherFeedback: row.teacherFeedback, updatedAt: row.updatedAt, workspace: publicActivityView(activity, state) };
}
export async function saveTeacherActivityFeedback(input: { workspaceId: string; childIds: string[]; feedback: string; actorUserId?: string; schoolTeacherId?: string; schoolId?: string }) {
  if (!await codingAssistanceEnabled()) return { ok: false as const, error: "Human assistance is disabled for Coding." };
  const { actorUserId, schoolTeacherId, schoolId } = input;
  const feedback = input.feedback.trim();
  if (!actorUserId || !schoolTeacherId || !schoolId) return { ok: false as const, error: "An authenticated school teaching identity is required." };
  if (!feedback || feedback.length > 2000 || !input.childIds.length) return { ok: false as const, error: "Choose a learner in your classes and write a note of at most 2,000 characters." };
  const row = await prisma.codingWorkspace.findFirst({ where: { id: input.workspaceId, childId: { in: input.childIds }, lessonId: { startsWith: prefix } } });
  if (!row) return { ok: false as const, error: "That Coding activity is not in your classes." };
  const access = await evaluateStudentAssignmentAccess(row.childId, schoolId);
  if (!access.allowed || access.schoolId !== schoolId || !await codingPlanIncludesLab({ schoolId: schoolId })) return { ok: false as const, error: "An active school licence covering Coding is required for teacher assistance." };
  const activity = definition(row.lessonId), state = activity && savedState(row.programsJson, activity.id);
  if (!activity || !state) return { ok: false as const, error: "This saved activity is unavailable for reviewed feedback. Its existing data has been retained." };
  // A teacher comment can disclose a solution. It must not leave the current
  // independent task eligible for unassisted credit or overwrite another tab.
  const reviewedState = stateAfterTeacherFeedback(activity, state);
  try {
    const saved = await prisma.$transaction(async (tx) => {
      const teacher = await tx.schoolTeacher.findFirst({ where: { id: schoolTeacherId, userId: actorUserId, schoolId: schoolId, status: "active", role: { in: ["owner", "admin", "teacher"] } }, select: { role: true } });
      if (!teacher) throw new Error("TEACHER_SCOPE_CHANGED");
      const student = await tx.schoolStudent.findFirst({ where: { schoolId: schoolId, childId: row.childId, status: "active", ...(teacher.role === "teacher" ? { classroom: { is: { teacherId: schoolTeacherId, schoolId: schoolId, status: "active" } } } : {}) }, select: { id: true } });
      if (!student || (await tx.skillsLabSettings.findUnique({ where: { labId: "coding" }, select: { humanAssistanceEnabled: true } }))?.humanAssistanceEnabled !== true) throw new Error("TEACHER_SCOPE_CHANGED");
      const updated = await tx.codingWorkspace.update({ where: { id: row.id, childId: { in: input.childIds }, updatedAt: row.updatedAt, programsJson: row.programsJson }, data: { teacherFeedback: feedback, programsJson: JSON.stringify(reviewedState) }, select: { id: true, childId: true, teacherFeedback: true, updatedAt: true } });
      await tx.codingProjectVersion.create({ data: { workspaceId: row.id, stage: state.stage, label: "teacher-feedback", programJson: JSON.stringify({ schema: 1, version: activity.version, activityId: activity.id, artifact: stageArtifact(activity, state, state.stage), files: state.files, independent: false, teacherFeedback: feedback, actorUserId: actorUserId, schoolTeacherId: schoolTeacherId, schoolId: schoolId }) } });
      return updated;
    });
    return { ok: true as const, workspace: saved };
  } catch (error) {
    if (error instanceof Error && error.message === "TEACHER_SCOPE_CHANGED") return { ok: false as const, error: "Teaching access or the assistance setting changed. Reload before trying again." };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return { ok: false as const, error: "This workspace changed in another tab. Reload before adding feedback." };
    throw error;
  }
}
