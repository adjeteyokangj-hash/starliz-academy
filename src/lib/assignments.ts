import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { evaluateStudentAssignmentAccess, type SchoolLicenceBlockedReason } from "@/lib/schools/licensing";

export class SchoolLicenceAccessError extends Error {
  reason: SchoolLicenceBlockedReason;
  schoolId?: string;
  schoolName?: string;

  constructor(input: {
    reason: SchoolLicenceBlockedReason;
    schoolId?: string;
    schoolName?: string;
  }) {
    super("School licence does not allow assignments for this student.");
    this.name = "SchoolLicenceAccessError";
    this.reason = input.reason;
    this.schoolId = input.schoolId;
    this.schoolName = input.schoolName;
  }
}

export async function assignContentToStudent(input: {
  studentId: string;
  contentId: string;
  actorUserId?: string;
  reason?: string;
}) {
  const schoolAccess = await evaluateStudentAssignmentAccess(input.studentId);
  if (!schoolAccess.allowed) {
    throw new SchoolLicenceAccessError({
      reason: schoolAccess.reason ?? "LICENCE_EXPIRED",
      schoolId: schoolAccess.schoolId,
      schoolName: schoolAccess.schoolName,
    });
  }

  const assignment = await prisma.assignment.upsert({
    where: { studentId_contentId: { studentId: input.studentId, contentId: input.contentId } },
    create: {
      studentId: input.studentId,
      contentId: input.contentId,
      status: "assigned",
    },
    update: {
      status: "assigned",
      updatedAt: new Date(),
    },
  });

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: "assignment.created",
    entityType: "assignment",
    entityId: assignment.id,
    metadata: { studentId: input.studentId, contentId: input.contentId, reason: input.reason },
  });

  return assignment;
}

export function taskHrefForContentType(contentType: string, assignmentId?: string) {
  const path = contentType === "lesson" || contentType === "ai_daily"
    ? "/games/lesson"
    : contentType === "math"
      ? "/games/math"
      : contentType === "reading"
        ? "/games/reading"
        : "/games/spelling";
  const params = new URLSearchParams();
  if (assignmentId) params.set("assignmentId", assignmentId);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
