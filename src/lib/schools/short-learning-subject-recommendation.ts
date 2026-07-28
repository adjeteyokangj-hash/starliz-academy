/**
 * Deterministic Short Learning subject recommendation from student history.
 * Does not expose raw analytics scores to parents.
 */

import { prisma } from "@/lib/db";
import {
  SHORT_LEARNING_FALLBACK_ROTATION,
  type ShortLearningSubjectKey,
  isManualShortLearningSubject,
  normalizeShortLearningSubjectInput,
} from "@/lib/schools/short-learning-subjects";

export type ShortLearningSelectionReason =
  | "follow_up_recent_difficulty"
  | "continue_unfinished_topic"
  | "curriculum_gap"
  | "balanced_subject_rotation"
  | "insufficient_history_fallback"
  | "parent_selected";

export type ShortLearningSubjectRecommendation = {
  subject: ShortLearningSubjectKey;
  learningFocus: string | null;
  reason: ShortLearningSelectionReason;
};

function normalizeHistorySubject(raw: string | null | undefined): ShortLearningSubjectKey | null {
  const key = normalizeShortLearningSubjectInput(raw);
  if (!key || key === "starliz_choose") return null;
  return isManualShortLearningSubject(key) ? key : null;
}

function pickLeastRecent(
  candidates: ShortLearningSubjectKey[],
  recentSubjects: string[],
): ShortLearningSubjectKey {
  const recent = recentSubjects
    .map((s) => normalizeHistorySubject(s))
    .filter((s): s is ShortLearningSubjectKey => Boolean(s));
  for (const candidate of candidates) {
    if (!recent.includes(candidate)) return candidate;
  }
  const last = recent[0];
  const withoutLast = candidates.filter((c) => c !== last);
  return withoutLast[0] ?? candidates[0] ?? "maths";
}

function readSelectedSubjects(snapshotJson: string | null | undefined): string[] {
  if (!snapshotJson) return [];
  try {
    const parsed = JSON.parse(snapshotJson) as { selectedSubjects?: unknown };
    if (!Array.isArray(parsed.selectedSubjects)) return [];
    return parsed.selectedSubjects.filter((s): s is string => typeof s === "string");
  } catch {
    return [];
  }
}

function readLearningGoals(snapshotJson: string | null | undefined): string[] {
  if (!snapshotJson) return [];
  try {
    const parsed = JSON.parse(snapshotJson) as { learningGoals?: unknown };
    if (!Array.isArray(parsed.learningGoals)) return [];
    return parsed.learningGoals.filter((s): s is string => typeof s === "string");
  } catch {
    return [];
  }
}

export async function recommendShortLearningSubject(input: {
  schoolId: string;
  schoolStudentId: string;
  parentUserId: string;
  now?: Date;
}): Promise<ShortLearningSubjectRecommendation> {
  const now = input.now ?? new Date();
  const lookback = new Date(now.getTime() - 90 * 24 * 60 * 60_000);

  const student = await prisma.schoolStudent.findFirst({
    where: {
      id: input.schoolStudentId,
      schoolId: input.schoolId,
      status: "active",
      OR: [
        { parentLinks: { some: { parentUserId: input.parentUserId, status: "active" } } },
        { child: { parentId: input.parentUserId, archived: false } },
      ],
    },
    select: {
      id: true,
      childId: true,
      classroomId: true,
      child: {
        select: {
          id: true,
          yearGroup: true,
          snapshotJson: true,
        },
      },
    },
  });
  if (!student) {
    throw new Error("Student is not linked to this parent for this school.");
  }

  const childId = student.childId;
  const [bookings, dayLessons, weakAreas, incorrectAttempts] = await Promise.all([
    prisma.studentLearningBooking.findMany({
      where: {
        schoolStudentId: input.schoolStudentId,
        startsAt: { gte: lookback },
        status: { notIn: ["cancelled", "late_cancelled"] },
      },
      orderBy: { startsAt: "desc" },
      take: 40,
      select: {
        subject: true,
        learningFocus: true,
        status: true,
        startsAt: true,
        shortLearningSession: {
          select: {
            status: true,
            currentBlockOrder: true,
            blocks: {
              select: { status: true, learningObjective: true },
              orderBy: { order: "asc" },
              take: 12,
            },
          },
        },
      },
    }),
    student.classroomId
      ? prisma.schoolDayLesson.findMany({
          where: {
            schoolId: input.schoolId,
            classroomId: student.classroomId,
            updatedAt: { gte: lookback },
          },
          orderBy: { updatedAt: "desc" },
          take: 30,
          select: { subject: true, skillFocus: true, status: true },
        })
      : Promise.resolve([] as Array<{ subject: string; skillFocus: string | null; status: string }>),
    childId
      ? prisma.weakArea.findMany({
          where: { studentId: childId, status: "active" },
          orderBy: { lastDetectedAt: "desc" },
          take: 10,
          select: { subject: true, skillFocus: true, accuracy: true },
        })
      : Promise.resolve([] as Array<{ subject: string; skillFocus: string; accuracy: number }>),
    childId
      ? prisma.attempt.findMany({
          where: {
            studentId: childId,
            correct: false,
            createdAt: { gte: lookback },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { subject: true, skillFocus: true },
        })
      : Promise.resolve([] as Array<{ subject: string; skillFocus: string }>),
  ]);

  const recentSubjects = [
    ...bookings.map((b) => b.subject),
    ...dayLessons.map((l) => l.subject),
  ];
  const selected = readSelectedSubjects(student.child?.snapshotJson)
    .map((s) => normalizeHistorySubject(s))
    .filter((s): s is ShortLearningSubjectKey => Boolean(s));
  const goals = readLearningGoals(student.child?.snapshotJson);

  // 1. Continue unfinished Short Learning journeys
  for (const booking of bookings) {
    const session = booking.shortLearningSession;
    if (!session) continue;
    const unfinished =
      ["planned", "generating", "awaiting_review", "ready"].includes(session.status)
      && session.blocks.some((b) => b.status !== "completed" && b.status !== "skipped");
    const subject = normalizeHistorySubject(booking.subject);
    if (unfinished && subject) {
      const focusBlock = session.blocks.find((b) => b.status !== "completed" && b.status !== "skipped");
      return {
        subject,
        learningFocus: focusBlock?.learningObjective?.trim()
          || booking.learningFocus?.trim()
          || null,
        reason: "continue_unfinished_topic",
      };
    }
  }

  // 2. Follow up recent difficulty
  const weak = weakAreas[0];
  if (weak) {
    const subject = normalizeHistorySubject(weak.subject);
    if (subject) {
      return {
        subject,
        learningFocus: weak.skillFocus?.trim() || null,
        reason: "follow_up_recent_difficulty",
      };
    }
  }
  const hardAttempt = incorrectAttempts[0];
  if (hardAttempt) {
    const subject = normalizeHistorySubject(hardAttempt.subject);
    if (subject) {
      return {
        subject,
        learningFocus: hardAttempt.skillFocus?.trim() || null,
        reason: "follow_up_recent_difficulty",
      };
    }
  }
  const difficultBooking = bookings.find((b) =>
    ["no_show", "expired"].includes(b.status)
    || (b.shortLearningSession?.blocks.some((block) => block.status === "skipped") ?? false),
  );
  if (difficultBooking) {
    const subject = normalizeHistorySubject(difficultBooking.subject);
    if (subject) {
      return {
        subject,
        learningFocus: difficultBooking.learningFocus?.trim() || null,
        reason: "follow_up_recent_difficulty",
      };
    }
  }

  // 3. Curriculum gap — selected subjects not covered recently
  if (selected.length > 0) {
    const covered = new Set(
      recentSubjects.map((s) => normalizeHistorySubject(s)).filter(Boolean),
    );
    const gap = selected.find((s) => !covered.has(s));
    if (gap) {
      const goal = goals.find((g) => g.toLowerCase().includes(gap));
      return {
        subject: gap,
        learningFocus: goal?.trim() || null,
        reason: "curriculum_gap",
      };
    }
  }

  // 4–5. Balanced rotation / avoid immediate repetition
  const rotationPool =
    selected.length > 0
      ? [
          ...SHORT_LEARNING_FALLBACK_ROTATION.filter((s) => selected.includes(s)),
          ...SHORT_LEARNING_FALLBACK_ROTATION.filter((s) => !selected.includes(s)),
        ]
      : SHORT_LEARNING_FALLBACK_ROTATION;

  if (recentSubjects.length > 0) {
    return {
      subject: pickLeastRecent(rotationPool, recentSubjects),
      learningFocus: null,
      reason: "balanced_subject_rotation",
    };
  }

  // 6. Insufficient history — safe core fallback (deterministic by student id)
  const hash = Array.from(input.schoolStudentId).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const subject = SHORT_LEARNING_FALLBACK_ROTATION[hash % 3] ?? "maths";
  return {
    subject,
    learningFocus: null,
    reason: "insufficient_history_fallback",
  };
}
