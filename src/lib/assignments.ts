import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { evaluateStudentAssignmentAccess, type SchoolLicenceBlockedReason } from "@/lib/schools/licensing";
import { ageGroupForYearGroup, keyStageForYearGroup } from "@/lib/curriculum";

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

export class AssignmentEligibilityError extends Error {
  details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "AssignmentEligibilityError";
    this.details = details;
  }
}

export class DuplicateAssignmentError extends Error {
  assignmentId: string;

  constructor(assignmentId: string) {
    super("This content is already assigned to this student.");
    this.name = "DuplicateAssignmentError";
    this.assignmentId = assignmentId;
  }
}

type ContentEligibilityMeta = {
  subject: string;
  yearGroup: string | null;
  keyStage: string | null;
  ageGroup: string | null;
  topic: string | null;
  skillFocus: string | null;
  status: string;
};

function parseContentMetadata(raw: string | null | undefined): {
  subject: string | null;
  ageGroup: string | null;
  topic: string | null;
  skillFocus: string | null;
} {
  if (!raw) return { subject: null, ageGroup: null, topic: null, skillFocus: null };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      subject: typeof parsed.subject === "string" ? parsed.subject : null,
      ageGroup: typeof parsed.ageGroup === "string" ? parsed.ageGroup : null,
      topic: typeof parsed.topic === "string" ? parsed.topic : null,
      skillFocus: typeof parsed.skillFocus === "string" ? parsed.skillFocus : null,
    };
  } catch {
    return { subject: null, ageGroup: null, topic: null, skillFocus: null };
  }
}

function normalizeSubject(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function isValidContentJson(contentJson: string): boolean {
  try {
    const parsed = JSON.parse(contentJson) as unknown;
    return Array.isArray(parsed) || (parsed !== null && typeof parsed === "object");
  } catch {
    return false;
  }
}

export async function getAssignmentEligibility(input: {
  studentId: string;
  contentId: string;
}): Promise<{ eligible: true; meta: ContentEligibilityMeta } | { eligible: false; reason: string; meta: ContentEligibilityMeta }> {
  const [student, content] = await Promise.all([
    prisma.childProfile.findUnique({
      where: { id: input.studentId },
      select: {
        id: true,
        name: true,
        yearGroup: true,
        studentProfile: { select: { keyStageLevel: true, subjectFocus: true } },
      },
    }),
    prisma.aIContentCache.findUnique({
      where: { id: input.contentId },
      select: {
        id: true,
        status: true,
        contentJson: true,
        topic: true,
        skillFocus: true,
        keyStage: true,
        yearGroup: true,
        metadataJson: true,
      },
    }),
  ]);

  if (!student || !content) {
    return {
      eligible: false,
      reason: "Student or content not found.",
      meta: {
        subject: "unknown",
        yearGroup: null,
        keyStage: null,
        ageGroup: null,
        topic: null,
        skillFocus: null,
        status: content?.status ?? "unknown",
      },
    };
  }

  const parsedMeta = parseContentMetadata(content.metadataJson);
  const contentSubject = normalizeSubject(parsedMeta.subject) || "unknown";
  const contentYearGroup = content.yearGroup ?? null;
  const contentKeyStage = content.keyStage ?? null;
  const contentAgeGroup = parsedMeta.ageGroup ?? (contentYearGroup ? ageGroupForYearGroup(contentYearGroup) : null);
  const studentKeyStage = student.studentProfile?.keyStageLevel || (student.yearGroup ? keyStageForYearGroup(student.yearGroup) : null);
  const studentAgeGroup = student.yearGroup ? ageGroupForYearGroup(student.yearGroup) : null;
  const meta: ContentEligibilityMeta = {
    subject: contentSubject,
    yearGroup: contentYearGroup,
    keyStage: contentKeyStage,
    ageGroup: contentAgeGroup,
    topic: parsedMeta.topic ?? content.topic ?? null,
    skillFocus: parsedMeta.skillFocus ?? content.skillFocus ?? null,
    status: content.status,
  };

  if (!["reviewed", "published"].includes(content.status)) {
    return { eligible: false, reason: "Only Reviewed or Published content can be assigned.", meta };
  }

  if (!isValidContentJson(content.contentJson)) {
    return { eligible: false, reason: "Content is not valid JSON and cannot be assigned.", meta };
  }

  if (contentYearGroup && student.yearGroup && contentYearGroup !== student.yearGroup) {
    return {
      eligible: false,
      reason: `This content is for ${contentYearGroup} / ${contentKeyStage ?? "unknown key stage"} and cannot be assigned to this student.`,
      meta,
    };
  }

  if (contentKeyStage && studentKeyStage && contentKeyStage !== studentKeyStage) {
    return {
      eligible: false,
      reason: `This content is for ${contentYearGroup ?? "specific year"} / ${contentKeyStage} and cannot be assigned to this student.`,
      meta,
    };
  }

  if (contentAgeGroup && studentAgeGroup && contentAgeGroup !== studentAgeGroup) {
    return { eligible: false, reason: `This content is designed for age group ${contentAgeGroup}.`, meta };
  }

  const studentSubjectFocus = normalizeSubject(student.studentProfile?.subjectFocus);
  if (studentSubjectFocus && contentSubject !== "unknown" && !studentSubjectFocus.includes(contentSubject) && !contentSubject.includes(studentSubjectFocus)) {
    return { eligible: false, reason: "Student subject focus does not match this content subject.", meta };
  }

  return { eligible: true, meta };
}

export async function assignContentToStudent(input: {
  studentId: string;
  contentId: string;
  actorUserId?: string;
  reason?: string;
}) {
  const eligibility = await getAssignmentEligibility({ studentId: input.studentId, contentId: input.contentId });
  if (!eligibility.eligible) {
    throw new AssignmentEligibilityError(eligibility.reason, { eligibility: eligibility.meta });
  }

  const schoolAccess = await evaluateStudentAssignmentAccess(input.studentId);
  if (!schoolAccess.allowed) {
    throw new SchoolLicenceAccessError({
      reason: schoolAccess.reason ?? "LICENCE_EXPIRED",
      schoolId: schoolAccess.schoolId,
      schoolName: schoolAccess.schoolName,
    });
  }

  const existing = await prisma.assignment.findUnique({
    where: { studentId_contentId: { studentId: input.studentId, contentId: input.contentId } },
    select: { id: true, status: true },
  });
  if (existing && existing.status !== "archived" && existing.status !== "completed") {
    throw new DuplicateAssignmentError(existing.id);
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
    metadata: {
      studentId: input.studentId,
      contentId: input.contentId,
      reason: input.reason,
      matchedYearGroup: eligibility.meta.yearGroup,
      matchedKeyStage: eligibility.meta.keyStage,
      contentStatus: eligibility.meta.status,
      contentSubject: eligibility.meta.subject,
      topic: eligibility.meta.topic,
      skillFocus: eligibility.meta.skillFocus,
    },
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
