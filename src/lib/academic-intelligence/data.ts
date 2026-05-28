import { prisma } from "@/lib/db";
import { normalizeExamBoard } from "@/lib/curriculum";
import { parseWeakAreaMetadata } from "@/lib/weakAreas";
import { readSchoolWeekSettingsFromProfileJson } from "@/lib/academic-intelligence/schoolWeekSettings";
import { parseQuickLevelFinderBaselineDiagnostic } from "@/lib/academic-intelligence/quickLevelFinderBaseline";
import type { AcademicSourceData, AssessmentType } from "@/lib/academic-intelligence/types";

function parseMetadata(raw: string | null): {
  topic?: string | null;
  subtopic?: string | null;
  learningObjective?: string | null;
  skill?: string | null;
  examBoard?: string | null;
  keyStage?: string | null;
  yearGroup?: string | null;
} {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      topic: typeof parsed.topic === "string" ? parsed.topic : null,
      subtopic: typeof parsed.subtopic === "string" ? parsed.subtopic : null,
      learningObjective: typeof parsed.learningObjective === "string" ? parsed.learningObjective : null,
      skill: typeof parsed.skill === "string" ? parsed.skill : null,
      examBoard: normalizeExamBoard(typeof parsed.examBoard === "string" ? parsed.examBoard : null),
      keyStage: typeof parsed.keyStage === "string" ? parsed.keyStage : null,
      yearGroup: typeof parsed.yearGroup === "string" ? parsed.yearGroup : null,
    };
  } catch {
    return {};
  }
}

function assessmentTypeFromProgress(activityType: string): AssessmentType | null {
  const normalized = activityType.trim().toLowerCase();
  if (normalized.includes("prior")) return "prior_knowledge_check";
  if (normalized.includes("lesson")) return "lesson_check";
  if (normalized.includes("daily") || normalized.includes("quiz")) return "daily_quiz";
  if (normalized.includes("weekly") || normalized.includes("recap")) return "weekly_recap_quiz";
  if (normalized.includes("topic")) return "topic_test";
  if (normalized.includes("unit")) return "end_of_unit_assessment";
  if (normalized.includes("homework")) return "homework_check";
  if (normalized.includes("spelling")) return "spelling_test";
  if (normalized.includes("comprehension") || normalized.includes("reading")) return "reading_comprehension";
  if (normalized.includes("math")) return "maths_method_check";
  if (normalized.includes("speaking") || normalized.includes("listening") || normalized.includes("language")) return "language_speaking_listening";
  if (normalized.includes("mock")) return "mock_exam";
  if (normalized.includes("improve")) return "improve_my_answer";
  return null;
}

function pickTopicLabel(topic: string | null | undefined, skill: string | null | undefined): string {
  return topic?.trim() || skill?.trim() || "General";
}

export async function buildAcademicSourceForStudent(studentId: string): Promise<AcademicSourceData | null> {
  const child = await prisma.childProfile.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      name: true,
      yearGroup: true,
      studentProfile: { select: { keyStageLevel: true, aiLearningProfileJson: true } },
      assignments: {
        orderBy: { updatedAt: "desc" },
        take: 350,
        select: {
          id: true,
          status: true,
          contentId: true,
          createdAt: true,
          updatedAt: true,
          completedAt: true,
          content: {
            select: {
              contentType: true,
              topic: true,
              skillFocus: true,
              keyStage: true,
              yearGroup: true,
              metadataJson: true,
            },
          },
        },
      },
      attempts: {
        orderBy: { createdAt: "desc" },
        take: 800,
        select: {
          id: true,
          subject: true,
          keyStage: true,
          yearGroup: true,
          skillFocus: true,
          questionText: true,
          correctAnswer: true,
          answerGiven: true,
          correct: true,
          hintsUsed: true,
          responseTimeMs: true,
          createdAt: true,
        },
      },
      weakAreas: {
        orderBy: { lastDetectedAt: "desc" },
        take: 250,
        select: {
          id: true,
          subject: true,
          keyStage: true,
          yearGroup: true,
          skillFocus: true,
          weaknessType: true,
          accuracy: true,
          attemptsCount: true,
          status: true,
          metadataJson: true,
          lastDetectedAt: true,
        },
      },
      studentSkills: {
        take: 200,
        orderBy: { updatedAt: "desc" },
        select: {
          skill: true,
          accuracy: true,
          attempts: true,
          correct: true,
          status: true,
          updatedAt: true,
        },
      },
      coachInteractionLogs: {
        take: 300,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          subject: true,
          skillFocus: true,
          mode: true,
          hintLevel: true,
          createdAt: true,
        },
      },
      progressRecords: {
        take: 500,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          activityType: true,
          activityName: true,
          completed: true,
          correct: true,
          accuracy: true,
          score: true,
          createdAt: true,
        },
      },
    },
  });

  if (!child) return null;

  let examBoard: string | null = null;
  let keyStage = child.studentProfile?.keyStageLevel ?? null;
  const profileJson = child.studentProfile?.aiLearningProfileJson ?? null;
  const schoolWeekSettings = readSchoolWeekSettingsFromProfileJson(child.studentProfile?.aiLearningProfileJson ?? null);
  const quickLevelFinderBaseline = parseQuickLevelFinderBaselineDiagnostic(profileJson);
  try {
    const parsed = profileJson
      ? (JSON.parse(profileJson) as Record<string, unknown>)
      : null;
    examBoard = normalizeExamBoard(typeof parsed?.examBoard === "string" ? parsed.examBoard : null);
    keyStage = keyStage ?? (typeof parsed?.keyStage === "string" ? parsed.keyStage : null);
  } catch {
    examBoard = null;
  }

  const dictionarySignals = child.weakAreas.flatMap((item) => {
    const metadata = parseWeakAreaMetadata(item.metadataJson);
    return metadata.weakWords.map((word) => ({
      word,
      subject: item.subject,
      topic: pickTopicLabel(null, item.skillFocus),
      skill: item.skillFocus,
      weak: true,
      difficult: true,
      source: "weak_area_metadata",
    }));
  });

  const assessmentHistory = child.progressRecords
    .map((row) => {
      const assessmentType = assessmentTypeFromProgress(row.activityType);
      if (!assessmentType) return null;
      const score = typeof row.score === "number"
        ? Math.max(0, Math.min(100, row.score))
        : typeof row.accuracy === "number"
          ? Math.max(0, Math.min(100, row.accuracy))
          : row.correct === true
            ? 100
            : row.correct === false
              ? 0
              : 50;
      return {
        id: row.id,
        assessmentType,
        score,
        subject: "general",
        topic: row.activityName,
        skill: row.activityName,
        createdAt: row.createdAt.toISOString(),
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  return {
    studentId: child.id,
    studentName: child.name,
    keyStage,
    yearGroup: child.yearGroup,
    examBoard,
    assignments: child.assignments.map((item) => {
      const meta = parseMetadata(item.content.metadataJson);
      return {
        id: item.id,
        status: item.status,
        subject: item.content.contentType,
        topic: item.content.topic || meta.topic || pickTopicLabel(item.content.topic, item.content.skillFocus),
        subtopic: meta.subtopic,
        skill: item.content.skillFocus || meta.skill,
        learningObjective: meta.learningObjective,
        keyStage: item.content.keyStage ?? meta.keyStage ?? keyStage,
        yearGroup: item.content.yearGroup ?? meta.yearGroup ?? child.yearGroup,
        examBoard: meta.examBoard ?? examBoard,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        completedAt: item.completedAt?.toISOString() ?? null,
        contentId: item.contentId,
      };
    }),
    attempts: child.attempts.map((item) => ({
      id: item.id,
      subject: item.subject,
      topic: pickTopicLabel(null, item.skillFocus),
      skill: item.skillFocus,
      keyStage: item.keyStage ?? keyStage,
      yearGroup: item.yearGroup ?? child.yearGroup,
      examBoard,
      questionText: item.questionText,
      correctAnswer: item.correctAnswer,
      answerGiven: item.answerGiven,
      correct: item.correct,
      hintsUsed: item.hintsUsed,
      responseTimeMs: item.responseTimeMs,
      createdAt: item.createdAt.toISOString(),
      score: item.correct ? 100 : 0,
    })),
    weakAreas: child.weakAreas.map((item) => ({
      id: item.id,
      subject: item.subject,
      topic: pickTopicLabel(null, item.skillFocus),
      skill: item.skillFocus,
      keyStage: item.keyStage ?? keyStage,
      yearGroup: item.yearGroup ?? child.yearGroup,
      examBoard,
      weaknessType: item.weaknessType,
      accuracy: item.accuracy,
      attemptsCount: item.attemptsCount,
      status: item.status,
      misconception: normalizeValue(item.weaknessType).includes("misconception"),
      metadata: parseWeakAreaMetadata(item.metadataJson),
      lastDetectedAt: item.lastDetectedAt.toISOString(),
    })),
    studentSkills: child.studentSkills.map((item) => ({
      skill: item.skill,
      accuracy: item.accuracy,
      attempts: item.attempts,
      correct: item.correct,
      status: item.status,
      updatedAt: item.updatedAt.toISOString(),
    })),
    coachUsage: child.coachInteractionLogs.map((item) => ({
      id: item.id,
      subject: item.subject,
      skill: item.skillFocus,
      topic: pickTopicLabel(null, item.skillFocus),
      keyStage,
      yearGroup: child.yearGroup,
      examBoard,
      mode: item.mode,
      hintLevel: item.hintLevel,
      createdAt: item.createdAt.toISOString(),
    })),
    dictionarySignals,
    progressRecords: child.progressRecords.map((item) => ({
      id: item.id,
      subject: "general",
      topic: item.activityName,
      skill: item.activityName,
      keyStage,
      yearGroup: child.yearGroup,
      examBoard,
      activityType: item.activityType,
      activityName: item.activityName,
      completed: item.completed,
      correct: item.correct,
      accuracy: item.accuracy,
      score: item.score,
      createdAt: item.createdAt.toISOString(),
    })),
    assessmentHistory,
    quickLevelFinderBaseline,
    schoolWeekSettings,
    generatedAt: new Date().toISOString(),
  };
}

function normalizeValue(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}
