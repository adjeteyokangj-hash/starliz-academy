import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { evaluateStudentAssignmentAccess, type SchoolLicenceBlockedReason } from "@/lib/schools/licensing";
import { ageGroupForYearGroup, keyStageForYearGroup, shouldApplyExamBoardTag } from "@/lib/curriculum";
import { readStudentCurriculumProfile } from "@/lib/student-curriculum-profile";

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

export class AssignmentSafetyError extends Error {
  details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "AssignmentSafetyError";
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

type AssignmentSafetyMeta = {
  subject: string;
  yearGroup: string | null;
  keyStage: string | null;
  curriculumPathway: string | null;
  examBoard: string | null;
  ageGroup: string | null;
  topic: string | null;
  skillFocus: string | null;
  status: string;
  schoolId: string | null;
};

type AssignmentRecommendation = {
  level: "recommended" | "eligible_manual";
  reason: string;
  matchedWeakAreas: string[];
};

function parseContentMetadata(raw: string | null | undefined): {
  subject: string | null;
  curriculumPathway: string | null;
  examBoard: string | null;
  ageGroup: string | null;
  topic: string | null;
  skillFocus: string | null;
  schoolId: string | null;
} {
  if (!raw) return { subject: null, curriculumPathway: null, examBoard: null, ageGroup: null, topic: null, skillFocus: null, schoolId: null };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      subject: typeof parsed.subject === "string" ? parsed.subject : null,
      curriculumPathway: typeof parsed.curriculumPathway === "string" ? parsed.curriculumPathway : null,
      examBoard: typeof parsed.examBoard === "string" ? parsed.examBoard : null,
      ageGroup: typeof parsed.ageGroup === "string" ? parsed.ageGroup : null,
      topic: typeof parsed.topic === "string" ? parsed.topic : null,
      skillFocus: typeof parsed.skillFocus === "string" ? parsed.skillFocus : null,
      schoolId: typeof parsed.schoolId === "string" ? parsed.schoolId : null,
    };
  } catch {
    return { subject: null, curriculumPathway: null, examBoard: null, ageGroup: null, topic: null, skillFocus: null, schoolId: null };
  }
}

function normalizeSubject(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function parseAgeGroupRange(ageGroup: string | null | undefined): { min: number; max: number } | null {
  if (!ageGroup) return null;
  const match = ageGroup.match(/(\d{1,2})\s*[\u2013\-]\s*(\d{1,2})/);
  if (!match) return null;
  const min = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}

function isValidContentJson(contentJson: string): boolean {
  try {
    const parsed = JSON.parse(contentJson) as unknown;
    return Array.isArray(parsed) || (parsed !== null && typeof parsed === "object");
  } catch {
    return false;
  }
}

export async function getAssignmentSafetyAndRecommendation(input: {
  studentId: string;
  contentId: string;
}): Promise<
  | {
    safe: true;
    meta: AssignmentSafetyMeta;
    recommendation: AssignmentRecommendation;
  }
  | {
    safe: false;
    reason: string;
    meta: AssignmentSafetyMeta;
  }
> {
  const [student, content] = await Promise.all([
    prisma.childProfile.findUnique({
      where: { id: input.studentId },
      select: {
        id: true,
        name: true,
        age: true,
        yearGroup: true,
        weakAreas: {
          where: { status: "active" },
          select: { skillFocus: true },
        },
        schoolLinks: {
          where: { status: "active" },
          select: { schoolId: true },
        },
        studentProfile: { select: { keyStageLevel: true, subjectFocus: true, aiLearningProfileJson: true } },
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
        contentType: true,
        metadataJson: true,
      },
    }),
  ]);

  if (!student || !content) {
    return {
      safe: false,
      reason: "Student or content not found.",
      meta: {
        subject: "unknown",
        yearGroup: null,
        keyStage: null,
        curriculumPathway: null,
        examBoard: null,
        ageGroup: null,
        topic: null,
        skillFocus: null,
        status: content?.status ?? "unknown",
        schoolId: null,
      },
    };
  }

  const parsedMeta = parseContentMetadata(content.metadataJson);
  const contentSubject = normalizeSubject(parsedMeta.subject) || "unknown";
  const contentYearGroup = content.yearGroup ?? null;
  const contentKeyStage = content.keyStage ?? null;
  const contentPathway = parsedMeta.curriculumPathway ?? null;
  const contentExamBoard = parsedMeta.examBoard ?? null;
  const contentAgeGroup = parsedMeta.ageGroup ?? (contentYearGroup ? ageGroupForYearGroup(contentYearGroup) : null);
  const studentKeyStage = student.studentProfile?.keyStageLevel || (student.yearGroup ? keyStageForYearGroup(student.yearGroup) : null);
  const studentCurriculum = readStudentCurriculumProfile({
    yearGroup: student.yearGroup,
    keyStageLevel: studentKeyStage,
    aiLearningProfileJson: student.studentProfile?.aiLearningProfileJson ?? null,
  });
  const studentSchoolIds = student.schoolLinks.map((link) => link.schoolId);
  const meta: AssignmentSafetyMeta = {
    subject: contentSubject,
    yearGroup: contentYearGroup,
    keyStage: contentKeyStage,
    curriculumPathway: contentPathway,
    examBoard: contentExamBoard,
    ageGroup: contentAgeGroup,
    topic: parsedMeta.topic ?? content.topic ?? null,
    skillFocus: parsedMeta.skillFocus ?? content.skillFocus ?? null,
    status: content.status,
    schoolId: parsedMeta.schoolId,
  };

  if (!["reviewed", "published"].includes(content.status)) {
    return { safe: false, reason: "Only Reviewed or Published content can be assigned.", meta };
  }

  if (!isValidContentJson(content.contentJson)) {
    return { safe: false, reason: "Content is not valid JSON and cannot be assigned.", meta };
  }

  if (meta.schoolId && studentSchoolIds.length > 0 && !studentSchoolIds.includes(meta.schoolId)) {
    return { safe: false, reason: "Student and content belong to different schools and cannot be assigned.", meta };
  }

  if (meta.schoolId && studentSchoolIds.length === 0) {
    return { safe: false, reason: "Student has no active school context for this school-scoped content.", meta };
  }

  if (contentYearGroup && student.yearGroup && contentYearGroup !== student.yearGroup) {
    return {
      safe: false,
      reason: `This content is for ${contentYearGroup} / ${contentKeyStage ?? "unknown key stage"} and cannot be assigned to this student.`,
      meta,
    };
  }

  if (contentKeyStage && studentKeyStage && contentKeyStage !== studentKeyStage) {
    return {
      safe: false,
      reason: `This content is for ${contentYearGroup ?? "specific year"} / ${contentKeyStage} and cannot be assigned to this student.`,
      meta,
    };
  }

  const shouldCheckExamBoard = shouldApplyExamBoardTag({
    yearGroup: contentYearGroup,
    keyStage: contentKeyStage,
    curriculumPathway: contentPathway,
    subject: parsedMeta.subject ?? content.contentType,
  });
  if (shouldCheckExamBoard && contentExamBoard && studentCurriculum.examBoard && contentExamBoard !== studentCurriculum.examBoard) {
    return {
      safe: false,
      reason: `This GCSE content is tagged for ${contentExamBoard} and cannot be assigned to a ${studentCurriculum.examBoard} learner profile.`,
      meta,
    };
  }

  const strictAgeRange = parseAgeGroupRange(contentAgeGroup);
  if (strictAgeRange && typeof student.age === "number" && (student.age < strictAgeRange.min || student.age > strictAgeRange.max)) {
    return { safe: false, reason: `This content is designed for age group ${contentAgeGroup}.`, meta };
  }

  const studentSubjectFocus = normalizeSubject(student.studentProfile?.subjectFocus);
  const contentSkillFocus = normalizeSubject(meta.skillFocus);
  const contentTopic = normalizeSubject(meta.topic);
  const matchedWeakAreas = student.weakAreas
    .map((area) => normalizeSubject(area.skillFocus))
    .filter((skill) => {
      if (!skill) return false;
      const hasNeedle = Boolean(contentSkillFocus) || Boolean(contentTopic);
      if (!hasNeedle) return false;
      return contentSkillFocus.includes(skill)
        || contentTopic.includes(skill)
        || (Boolean(contentSkillFocus) && skill.includes(contentSkillFocus));
    });

  if (matchedWeakAreas.length > 0) {
    return {
      safe: true,
      meta,
      recommendation: {
        level: "recommended",
        reason: "Recommended match: this content supports the student's weak area.",
        matchedWeakAreas,
      },
    };
  }

  if (studentSubjectFocus && contentSubject !== "unknown" && (studentSubjectFocus.includes(contentSubject) || contentSubject.includes(studentSubjectFocus))) {
    return {
      safe: true,
      meta,
      recommendation: {
        level: "recommended",
        reason: "Recommended match: this content aligns with the student's subject focus.",
        matchedWeakAreas: [],
      },
    };
  }

  return {
    safe: true,
    meta,
    recommendation: {
      level: "eligible_manual",
      reason: "Eligible manual assignment: no matching weak area detected.",
      matchedWeakAreas: [],
    },
  };
}

export async function assignContentToStudent(input: {
  studentId: string;
  contentId: string;
  actorUserId?: string;
  reason?: string;
}) {
  const safety = await getAssignmentSafetyAndRecommendation({ studentId: input.studentId, contentId: input.contentId });
  if (!safety.safe) {
    throw new AssignmentSafetyError(safety.reason, { safety: safety.meta });
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

  await prisma.aIContentCache.update({
    where: { id: input.contentId },
    data: {
      usedCount: {
        increment: 1,
      },
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
      matchedYearGroup: safety.meta.yearGroup,
      matchedKeyStage: safety.meta.keyStage,
      contentStatus: safety.meta.status,
      contentSubject: safety.meta.subject,
      topic: safety.meta.topic,
      skillFocus: safety.meta.skillFocus,
      assignmentSafety: "hard_pass",
      assignmentRecommendation: safety.recommendation.level,
      recommendationReason: safety.recommendation.reason,
      matchedWeakAreas: safety.recommendation.matchedWeakAreas,
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
