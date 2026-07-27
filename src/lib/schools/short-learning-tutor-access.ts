import { prisma } from "@/lib/db";
import {
  type DaytimeSchoolTutorContext,
  type DaytimeTutorAccessResult,
  resolveQuestionFromContentJson,
} from "@/lib/schools/daytime-school-tutor-access";
import {
  resolveShortLearningSupportContext,
  shortLearningSupportMetadata,
  type ShortLearningSupportContext,
} from "@/lib/schools/short-learning-support-context";

export async function assertShortLearningTutorAccess(input: {
  studentId: string;
  bookingId: string;
  assignmentId: string;
  contentId: string;
  blockId?: string;
  sessionId?: string;
  questionId?: string;
  questionIndex?: number;
  studentAttempt?: string;
  now?: Date;
}): Promise<DaytimeTutorAccessResult & { slContext?: ShortLearningSupportContext }> {
  const resolved = await resolveShortLearningSupportContext({
    studentId: input.studentId,
    bookingId: input.bookingId,
    assignmentId: input.assignmentId,
    contentId: input.contentId,
    blockId: input.blockId,
    sessionId: input.sessionId,
    now: input.now,
  });
  if (!resolved.ok) {
    return {
      ok: false,
      status: resolved.status,
      code: resolved.code,
      error: resolved.error,
    };
  }

  const content = await prisma.aIContentCache.findUnique({
    where: { id: input.contentId },
    select: {
      id: true,
      contentType: true,
      contentJson: true,
      metadataJson: true,
      skillFocus: true,
      yearGroup: true,
      topic: true,
    },
  });
  if (!content) {
    return { ok: false, status: 404, code: "CONTENT_MISSING", error: "Lesson content was not found." };
  }

  const question = resolveQuestionFromContentJson(content.contentJson, {
    questionId: input.questionId,
    questionIndex: input.questionIndex,
  });
  if (!question) {
    return { ok: false, status: 400, code: "QUESTION_MISSING", error: "That question could not be loaded for AI help." };
  }

  const sl = resolved.context;
  const context: DaytimeSchoolTutorContext = {
    studentId: sl.studentId,
    schoolId: sl.schoolId,
    classroomId: sl.classroomId ?? sl.schoolId,
    lessonId: null,
    periodId: sl.supportScopeKey,
    assignmentId: sl.assignmentId,
    contentId: sl.contentId,
    stage: sl.blockType,
    stageOrder: sl.blockOrder,
    subject: sl.subject,
    yearGroup: sl.yearGroup,
    lessonTitle: sl.learningObjective ?? `${sl.subject} · Short Learning`,
    curriculumSkill: content.skillFocus,
    periodEndsAt: sl.bookingEndsAt.toISOString(),
    periodStartsAt: sl.bookingStartsAt.toISOString(),
    periodActive: true,
    assignmentStatus: "assigned",
    question,
    studentAttempt: input.studentAttempt,
    storedHelp: question.storedHelp,
    contentType: content.contentType,
    sharedPassage: typeof question.passageOrExplanation === "string" ? question.passageOrExplanation : null,
    ruleExplanation: null,
  };

  return { ok: true, context, slContext: sl };
}

export { shortLearningSupportMetadata };
