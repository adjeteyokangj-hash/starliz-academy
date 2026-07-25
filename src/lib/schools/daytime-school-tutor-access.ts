import { prisma } from "@/lib/db";
import {
  extractHelpFromQuestionItem,
  type StoredQuestionHelp,
} from "@/lib/schools/question-help";
import {
  minutesNow,
  minutesRemainingInPeriod,
  parseHmToMinutes,
  resolvePeriodState,
} from "@/lib/schools/school-day-period";

export const AI_TUTOR_SCOPE_DAYTIME_SCHOOL = "daytime-school" as const;

export type DaytimeTutorQuestion = {
  id: string;
  index: number;
  prompt: string;
  answerType: string;
  modelAnswer: string | number | null;
  passageOrExplanation: string | null;
  choices: string[];
  storedHelp: StoredQuestionHelp;
  raw: Record<string, unknown>;
};

export type DaytimeSchoolTutorContext = {
  studentId: string;
  schoolId: string;
  classroomId: string;
  lessonId: string | null;
  periodId: string;
  assignmentId: string;
  contentId: string;
  stage: string;
  stageOrder: number;
  subject: string;
  yearGroup: string | null;
  lessonTitle: string;
  curriculumSkill: string | null;
  periodEndsAt: string;
  periodStartsAt: string;
  periodActive: boolean;
  assignmentStatus: string;
  question: DaytimeTutorQuestion;
  studentAttempt?: string;
  storedHelp: StoredQuestionHelp;
  contentType: string;
  sharedPassage: string | null;
  ruleExplanation: string | null;
};

export type DaytimeTutorAccessFailure = {
  ok: false;
  status: number;
  code: string;
  error: string;
};

export type DaytimeTutorAccessSuccess = {
  ok: true;
  context: DaytimeSchoolTutorContext;
};

export type DaytimeTutorAccessResult = DaytimeTutorAccessSuccess | DaytimeTutorAccessFailure;

export type DaytimeTutorAccessDeps = {
  findActiveEnrolment: (studentId: string) => Promise<{
    id: string;
    schoolId: string;
    classroomId: string;
  } | null>;
  findPeriod: (periodId: string) => Promise<{
    id: string;
    schoolId: string;
    classroomId: string | null;
    subject: string;
    title: string;
    lessonType: string;
    yearGroup: string | null;
    skillFocus: string | null;
    startsAt: string;
    endsAt: string;
    lessonId: string | null;
    lesson: {
      id: string;
      contentRefs: string | null;
      yearGroup: string | null;
      skillFocus: string | null;
      reviewStatus: string | null;
    } | null;
  } | null>;
  findAssignment: (input: {
    assignmentId: string;
    studentId: string;
    contentId: string;
  }) => Promise<{
    id: string;
    status: string;
    contentId: string;
    content: {
      id: string;
      contentType: string;
      contentJson: string;
      metadataJson: string | null;
      skillFocus: string | null;
      yearGroup: string | null;
      topic: string | null;
    };
  } | null>;
  now?: () => Date;
};

function parseContentRefIds(contentRefs: string | null | undefined): string[] {
  if (!contentRefs?.trim()) return [];
  return contentRefs
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseDaytimeSessionMeta(metadataJson: string | null | undefined): {
  stage?: string;
  stageIndex?: number;
} {
  if (!metadataJson?.trim()) return {};
  try {
    const parsed = JSON.parse(metadataJson) as { daytimeSession?: Record<string, unknown> };
    const session = parsed.daytimeSession;
    if (!session || typeof session !== "object") return {};
    return {
      stage: typeof session.stage === "string" ? session.stage : undefined,
      stageIndex: typeof session.stageIndex === "number" ? session.stageIndex : undefined,
    };
  } catch {
    return {};
  }
}

function toQuestionArray(parsed: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(parsed)) {
    return parsed.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row));
  }
  if (!parsed || typeof parsed !== "object") return [];
  const row = parsed as Record<string, unknown>;
  const nested = Array.isArray(row.questions)
    ? row.questions
    : Array.isArray(row.items)
      ? row.items
      : Array.isArray(row.words)
        ? row.words
        : null;
  if (!nested) {
    return [row];
  }
  const sharedPassage = typeof row.passage === "string"
    ? row.passage
    : row.passage && typeof row.passage === "object" && typeof (row.passage as { text?: unknown }).text === "string"
      ? String((row.passage as { text: string }).text)
      : null;
  const explanation = typeof row.explanation === "string" ? row.explanation : null;
  return nested
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map((entry) => ({
      ...entry,
      passage: entry.passage ?? sharedPassage ?? undefined,
      explanation: entry.explanation ?? explanation ?? undefined,
      title: entry.title ?? row.title,
      skillFocus: entry.skillFocus ?? row.skillFocus,
      subject: entry.subject ?? row.subjectType ?? row.subject,
      ruleExplanation: entry.ruleExplanation ?? row.ruleExplanation,
    }));
}

function resolveSharedPassage(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const row = parsed as Record<string, unknown>;
  if (typeof row.passage === "string" && row.passage.trim()) return row.passage.trim();
  if (row.passage && typeof row.passage === "object") {
    const text = (row.passage as { text?: unknown }).text;
    if (typeof text === "string" && text.trim()) return text.trim();
  }
  if (typeof row.explanation === "string" && row.explanation.trim()) return row.explanation.trim();
  return null;
}

function resolveRuleExplanation(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const row = parsed as Record<string, unknown>;
  if (typeof row.ruleExplanation === "string" && row.ruleExplanation.trim()) {
    return row.ruleExplanation.trim();
  }
  return null;
}

function normalizeChoices(item: Record<string, unknown>): string[] {
  const raw = item.choices ?? item.options;
  if (!Array.isArray(raw)) return [];
  return raw.map((choice) => String(choice ?? "").trim()).filter(Boolean);
}

export function resolveQuestionFromContentJson(
  contentJson: string,
  input: { questionId?: string; questionIndex?: number },
): DaytimeTutorQuestion | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contentJson);
  } catch {
    return null;
  }
  const items = toQuestionArray(parsed);
  if (!items.length) return null;

  let index = -1;
  if (input.questionId?.trim()) {
    const wanted = input.questionId.trim();
    index = items.findIndex((item, i) => {
      const id = String(item.id ?? `q-${i + 1}`);
      return id === wanted;
    });
  }
  if (index < 0 && typeof input.questionIndex === "number" && Number.isFinite(input.questionIndex)) {
    index = Math.trunc(input.questionIndex);
  }
  if (index < 0) index = 0;
  if (index < 0 || index >= items.length) return null;

  const item = items[index]!;
  const prompt = String(item.question ?? item.prompt ?? item.word ?? "").trim();
  if (!prompt) return null;
  const id = String(item.id ?? `q-${index + 1}`);
  const modelAnswer = (item.answer ?? item.correctAnswer ?? item.word ?? null) as string | number | null;
  const passageOrExplanation = typeof item.passage === "string"
    ? item.passage
    : typeof item.explanation === "string"
      ? item.explanation
      : null;
  const storedHelp = extractHelpFromQuestionItem(item);

  return {
    id,
    index,
    prompt,
    answerType: String(item.kind ?? (normalizeChoices(item).length ? "multiple-choice" : "short-answer")),
    modelAnswer,
    passageOrExplanation,
    choices: normalizeChoices(item),
    storedHelp,
    raw: item,
  };
}

export function createDefaultDaytimeTutorAccessDeps(): DaytimeTutorAccessDeps {
  return {
    findActiveEnrolment: async (studentId) => {
      const row = await prisma.schoolStudent.findFirst({
        where: { childId: studentId, status: "active", classroomId: { not: null } },
        orderBy: { updatedAt: "desc" },
        select: { id: true, schoolId: true, classroomId: true },
      });
      if (!row?.classroomId) return null;
      return { id: row.id, schoolId: row.schoolId, classroomId: row.classroomId };
    },
    findPeriod: async (periodId) => {
      return prisma.schoolDayLesson.findUnique({
        where: { id: periodId },
        select: {
          id: true,
          schoolId: true,
          classroomId: true,
          subject: true,
          title: true,
          lessonType: true,
          yearGroup: true,
          skillFocus: true,
          startsAt: true,
          endsAt: true,
          lessonId: true,
          lesson: {
            select: {
              id: true,
              contentRefs: true,
              yearGroup: true,
              skillFocus: true,
              reviewStatus: true,
            },
          },
        },
      });
    },
    findAssignment: async ({ assignmentId, studentId, contentId }) => {
      return prisma.assignment.findFirst({
        where: {
          id: assignmentId,
          studentId,
          contentId,
        },
        select: {
          id: true,
          status: true,
          contentId: true,
          content: {
            select: {
              id: true,
              contentType: true,
              contentJson: true,
              metadataJson: true,
              skillFocus: true,
              yearGroup: true,
              topic: true,
            },
          },
        },
      });
    },
    now: () => new Date(),
  };
}

/**
 * Server-side gate for School AI Tutor v1 (daytime-school scope only).
 * Does not trust client lesson/school/stage/subject/answer metadata.
 */
export async function assertDaytimeSchoolTutorAccess(
  input: {
    studentId: string;
    periodId: string;
    assignmentId: string;
    contentId: string;
    questionId?: string;
    questionIndex?: number;
    studentAttempt?: string;
    /** Rejected if present without a valid daytime assignment chain — practice/forged flags. */
    forgedDaytimeQuery?: boolean;
  },
  deps: DaytimeTutorAccessDeps = createDefaultDaytimeTutorAccessDeps(),
): Promise<DaytimeTutorAccessResult> {
  const studentId = input.studentId.trim();
  const periodId = input.periodId.trim();
  const assignmentId = input.assignmentId.trim();
  const contentId = input.contentId.trim();

  if (!studentId || !periodId || !assignmentId || !contentId) {
    return {
      ok: false,
      status: 400,
      code: "MISSING_CONTEXT",
      error: "School AI Tutor needs a daytime assignment, period, and question context.",
    };
  }

  // Practice / forged daytime=1 without a real assignment chain is rejected above
  // (practice has no assignmentId). Extra guard if caller marks forged query alone.
  if (input.forgedDaytimeQuery && (!assignmentId || !periodId)) {
    return {
      ok: false,
      status: 403,
      code: "FORGED_DAYTIME_FLAG",
      error: "Daytime tutor is only available inside an approved school lesson.",
    };
  }

  const enrolment = await deps.findActiveEnrolment(studentId);
  if (!enrolment) {
    return {
      ok: false,
      status: 403,
      code: "INACTIVE_ENROLMENT",
      error: "You are not enrolled in an active school class.",
    };
  }

  const period = await deps.findPeriod(periodId);
  if (!period) {
    return { ok: false, status: 404, code: "PERIOD_NOT_FOUND", error: "Period not found." };
  }

  if (period.schoolId !== enrolment.schoolId || period.classroomId !== enrolment.classroomId) {
    return {
      ok: false,
      status: 403,
      code: "CLASSROOM_MISMATCH",
      error: "This period is not on your class timetable.",
    };
  }

  const lessonType = period.lessonType.trim().toLowerCase();
  if (lessonType === "break" || lessonType === "lunch" || lessonType === "registration") {
    return {
      ok: false,
      status: 400,
      code: "NOT_PLAYABLE",
      error: "This period does not have a digital lesson.",
    };
  }

  if (!period.lesson) {
    return {
      ok: false,
      status: 409,
      code: "LESSON_NOT_LINKED",
      error: "This period has no approved lesson linked yet.",
    };
  }

  const reviewStatus = period.lesson.reviewStatus ?? "draft";
  if (reviewStatus !== "approved") {
    return {
      ok: false,
      status: 409,
      code: "LESSON_NOT_APPROVED",
      error: "This lesson is not approved for class yet.",
    };
  }

  const linkedIds = parseContentRefIds(period.lesson.contentRefs);
  if (!linkedIds.includes(contentId)) {
    return {
      ok: false,
      status: 403,
      code: "NOT_DAYTIME_CONTENT",
      error: "School AI Tutor only works for your current daytime lesson assignment.",
    };
  }

  const assignment = await deps.findAssignment({ assignmentId, studentId, contentId });
  if (!assignment) {
    return {
      ok: false,
      status: 403,
      code: "ASSIGNMENT_MISMATCH",
      error: "That assignment does not belong to you for this lesson.",
    };
  }

  const now = deps.now?.() ?? new Date();
  const nowMinutes = minutesNow(now);
  const periodState = resolvePeriodState(period.startsAt, period.endsAt, nowMinutes);
  const remaining = minutesRemainingInPeriod(period.endsAt, now);
  const periodActive = periodState === "now" && remaining > 0;

  if (!periodActive) {
    return {
      ok: false,
      status: 403,
      code: "PERIOD_ENDED",
      error: "This school period has ended. Ask your teacher if you still need help.",
    };
  }

  // Completed assignments may still receive in-period review help (stored/live).
  // Archived / cancelled are blocked.
  const status = assignment.status.trim().toLowerCase();
  if (status === "archived" || status === "cancelled") {
    return {
      ok: false,
      status: 403,
      code: "ASSIGNMENT_CLOSED",
      error: "This assignment is no longer available for tutor help.",
    };
  }

  let parsedContent: unknown = null;
  try {
    parsedContent = JSON.parse(assignment.content.contentJson);
  } catch {
    return {
      ok: false,
      status: 422,
      code: "INVALID_CONTENT",
      error: "Lesson content could not be read for tutor help.",
    };
  }

  const question = resolveQuestionFromContentJson(assignment.content.contentJson, {
    questionId: input.questionId,
    questionIndex: input.questionIndex,
  });
  if (!question) {
    return {
      ok: false,
      status: 404,
      code: "QUESTION_NOT_FOUND",
      error: "That question is not part of this daytime assignment.",
    };
  }

  const sessionMeta = parseDaytimeSessionMeta(assignment.content.metadataJson);
  const stage = sessionMeta.stage
    ?? (linkedIds.indexOf(contentId) === 0
      ? "warmup"
      : linkedIds.indexOf(contentId) === 1
        ? "core"
        : "stretch");
  const stageOrder = sessionMeta.stageIndex
    ?? Math.max(0, linkedIds.indexOf(contentId));

  // Sanity: start/end must parse (already used by resolvePeriodState).
  if (parseHmToMinutes(period.startsAt) < 0 || parseHmToMinutes(period.endsAt) < 0) {
    return {
      ok: false,
      status: 422,
      code: "INVALID_PERIOD_TIMES",
      error: "This period has invalid timetable times.",
    };
  }

  const attempt = typeof input.studentAttempt === "string" ? input.studentAttempt.trim() : "";

  return {
    ok: true,
    context: {
      studentId,
      schoolId: enrolment.schoolId,
      classroomId: enrolment.classroomId,
      lessonId: period.lessonId,
      periodId: period.id,
      assignmentId: assignment.id,
      contentId: assignment.contentId,
      stage,
      stageOrder,
      subject: period.subject,
      yearGroup: period.yearGroup ?? period.lesson.yearGroup ?? assignment.content.yearGroup,
      lessonTitle: period.title,
      curriculumSkill: period.skillFocus ?? period.lesson.skillFocus ?? assignment.content.skillFocus,
      periodEndsAt: period.endsAt,
      periodStartsAt: period.startsAt,
      periodActive,
      assignmentStatus: assignment.status,
      question,
      studentAttempt: attempt || undefined,
      storedHelp: question.storedHelp,
      contentType: assignment.content.contentType,
      sharedPassage: resolveSharedPassage(parsedContent),
      ruleExplanation: resolveRuleExplanation(parsedContent)
        ?? (typeof question.raw.ruleExplanation === "string" ? question.raw.ruleExplanation : null),
    },
  };
}
