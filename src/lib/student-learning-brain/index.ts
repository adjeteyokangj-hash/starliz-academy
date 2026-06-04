import { prisma } from "@/lib/db";
import { buildAcademicIntelligence, toStudentSafeAcademicIntelligence } from "@/lib/academic-intelligence/academicIntelligence";
import { buildAcademicSourceForStudent } from "@/lib/academic-intelligence/data";
import { getCoachHeartbeatSignals } from "@/lib/academic-intelligence/coachHeartbeatSignals";
import { listCatchUpTasks, syncCatchUpTasks } from "@/lib/academic-intelligence/catchUpTasks";
import { listHomeworkTasks, syncHomeworkTasks } from "@/lib/academic-intelligence/homeworkTasks";
import {
  buildAcademicIntelligenceSnapshot,
  getOrRefreshAcademicIntelligenceSnapshot,
  upsertAcademicIntelligenceSnapshotJson,
} from "@/lib/academic-intelligence/snapshot";
import { extractLearningDnaFromProfileJson, buildParentLearningDnaSummary } from "@/lib/learning_dna";
import { listPersistedCertificateRecordsForStudent, mergePersistedAndLegacyCertificates } from "@/lib/certificate-records";
import { buildAssignedWorkSummary, buildSmartCoachSummary } from "@/lib/student-dashboard-summary";
import { parseQuickLevelFinderSession } from "@/lib/quick-level-finder";
import { deriveStudentLearningState, parseSelectedSubjectsFromProfileJson, parseSubjectFocus } from "@/lib/student-learning-state";
import { selectPlacementLessons } from "@/lib/placement-lesson-selector";
import { taskHrefForContentType } from "@/lib/assignments";
import { buildSubjectLevelProgression, progressionFriendlyLabel } from "@/lib/subject-level-progression";
import { buildLanguageReadinessBrain, type LanguageReadinessBrain } from "@/lib/student-learning-brain/languageReadinessBrain";
import { classifyStudentDataState, type StudentDataNormalisationResult } from "@/lib/student-learning-brain/studentDataNormalisation";
import type {
  AcademicIntelligenceOutput,
  AcademicSourceData,
  CatchUpTaskRecord,
  CoachHeartbeatSignalSummary,
  HomeworkTaskRecord,
} from "@/lib/academic-intelligence/types";

// Student Learning Brain is the canonical read layer for shared learning intelligence.
// Routes should consume Brain outputs or Brain view mappers instead of rebuilding intelligence reads.
// Add future learning intelligence modules here first, then expose them via role-safe view mappers.

type BrainOptions = {
  includeCoachSignals?: boolean;
  syncTasks?: boolean;
  actorUserId?: string;
  refreshDashboardSnapshot?: boolean;
};

type BrainEvidenceSummary = {
  assignments: { total: number; active: number; completed: number };
  progress: { total: number; completed: number; averageScore: number | null };
  attempts: { total: number; correct: number; accuracy: number | null };
  weakAreas: { total: number; active: number; top: string[] };
  skills: { total: number; mastered: number; weak: number; averageAccuracy: number | null };
  certificates: { issuedCount: number };
  homework: { total: number; active: number; completed: number; overdue: number };
};

export type StudentLearningBrain = {
  studentId: string;
  source: AcademicSourceData;
  academicIntelligence: AcademicIntelligenceOutput;
  studentSafeAcademicIntelligence: ReturnType<typeof toStudentSafeAcademicIntelligence>;
  quickLevelFinderBaseline: AcademicSourceData["quickLevelFinderBaseline"];
  heartbeatSummary: AcademicIntelligenceOutput["heartbeatDecision"];
  coachHeartbeatSignals: CoachHeartbeatSignalSummary | null;
  learningDnaSummary: Record<string, unknown> | null;
  evidenceSummary: BrainEvidenceSummary;
  dataState: StudentDataNormalisationResult;
  languageReadiness: LanguageReadinessBrain;
  generatedAt: string;
};

function avg(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function statusActive(status: string): boolean {
  return !["completed", "waived", "skipped", "archived"].includes(status.trim().toLowerCase());
}

function buildEvidenceSummary(input: {
  source: AcademicSourceData;
  homeworkTasks: HomeworkTaskRecord[];
  certificateCount: number;
}): BrainEvidenceSummary {
  const progressScores = input.source.progressRecords
    .map((row) => typeof row.accuracy === "number" ? row.accuracy : typeof row.score === "number" ? row.score : null)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const correctAttempts = input.source.attempts.filter((row) => row.correct).length;
  const skillScores = input.source.studentSkills
    .map((row) => row.accuracy)
    .filter((value) => Number.isFinite(value));

  return {
    assignments: {
      total: input.source.assignments.length,
      active: input.source.assignments.filter((row) => statusActive(row.status)).length,
      completed: input.source.assignments.filter((row) => row.status === "completed").length,
    },
    progress: {
      total: input.source.progressRecords.length,
      completed: input.source.progressRecords.filter((row) => row.completed).length,
      averageScore: avg(progressScores),
    },
    attempts: {
      total: input.source.attempts.length,
      correct: correctAttempts,
      accuracy: input.source.attempts.length ? Math.round((correctAttempts / input.source.attempts.length) * 100) : null,
    },
    weakAreas: {
      total: input.source.weakAreas.length,
      active: input.source.weakAreas.filter((row) => row.status === "active").length,
      top: input.source.weakAreas.slice(0, 5).map((row) => row.skill ?? row.topic ?? row.subject),
    },
    skills: {
      total: input.source.studentSkills.length,
      mastered: input.source.studentSkills.filter((row) => row.status === "mastered").length,
      weak: input.source.studentSkills.filter((row) => row.status === "weak").length,
      averageAccuracy: avg(skillScores),
    },
    certificates: {
      issuedCount: input.certificateCount,
    },
    homework: {
      total: input.homeworkTasks.length,
      active: input.homeworkTasks.filter((row) => row.status === "assigned" || row.status === "in_progress").length,
      completed: input.homeworkTasks.filter((row) => row.status === "completed").length,
      overdue: input.homeworkTasks.filter((row) => row.status === "overdue").length,
    },
  };
}

async function readCertificateCount(studentId: string, profileJson: string | null | undefined): Promise<number> {
  const persisted = await listPersistedCertificateRecordsForStudent(studentId);
  return mergePersistedAndLegacyCertificates({ persisted, profileJson }).length;
}

export function buildStudentLearningBrainFromSource(input: {
  source: AcademicSourceData;
  academicIntelligence?: AcademicIntelligenceOutput;
  catchUpTasks?: CatchUpTaskRecord[];
  homeworkTasks?: HomeworkTaskRecord[];
  coachHeartbeatSignals?: CoachHeartbeatSignalSummary | null;
  learningDnaSummary?: Record<string, unknown> | null;
  certificateCount?: number;
}): StudentLearningBrain {
  const academicIntelligence = input.academicIntelligence ?? buildAcademicIntelligence(input.source, {
    existingCatchUpTasks: input.catchUpTasks,
    existingHomeworkTasks: input.homeworkTasks,
    coachHeartbeatSignals: input.coachHeartbeatSignals,
  });
  const homeworkTasks = input.homeworkTasks ?? academicIntelligence.homeworkTasks ?? [];
  const languageReadiness = buildLanguageReadinessBrain({
    source: input.source,
    heartbeatDecision: academicIntelligence.heartbeatDecision,
  });

  return {
    studentId: input.source.studentId,
    source: input.source,
    academicIntelligence,
    studentSafeAcademicIntelligence: toStudentSafeAcademicIntelligence(academicIntelligence),
    quickLevelFinderBaseline: input.source.quickLevelFinderBaseline ?? null,
    heartbeatSummary: academicIntelligence.heartbeatDecision,
    coachHeartbeatSignals: input.coachHeartbeatSignals ?? academicIntelligence.coachHeartbeatSignals ?? null,
    learningDnaSummary: input.learningDnaSummary ?? null,
    evidenceSummary: buildEvidenceSummary({
      source: input.source,
      homeworkTasks,
      certificateCount: input.certificateCount ?? 0,
    }),
    dataState: classifyStudentDataState({
      attemptsCount: input.source.attempts.length,
      progressRecordsCount: input.source.progressRecords.length,
      assignmentsCount: input.source.assignments.length,
      weakAreasCount: input.source.weakAreas.length,
      sessionCount: input.source.attempts.length || input.source.progressRecords.length,
      hasQuickLevelFinderCompleted: Boolean(input.source.quickLevelFinderBaseline),
      hasQuickLevelFinderSession: Boolean(input.source.quickLevelFinderBaseline),
      hasQuickLevelFinderPlacementSignal: Boolean(input.source.quickLevelFinderBaseline),
      hasAcademicSnapshot: false,
      hasLearningDna: Boolean(input.learningDnaSummary),
      createdAt: null,
    }),
    languageReadiness,
    generatedAt: academicIntelligence.generatedAt,
  };
}

export async function getStudentLearningBrain(studentId: string, options: BrainOptions = {}): Promise<StudentLearningBrain | null> {
  const source = await buildAcademicSourceForStudent(studentId);
  if (!source) return null;

  const [profile, existingCatchUpTasks, existingHomeworkTasks, coachHeartbeatSignals] = await Promise.all([
    prisma.studentProfile.findUnique({
      where: { childId: studentId },
      select: { aiLearningProfileJson: true },
    }),
    listCatchUpTasks(studentId),
    listHomeworkTasks(studentId),
    options.includeCoachSignals ? getCoachHeartbeatSignals(studentId) : Promise.resolve(null),
  ]);

  let output = buildAcademicIntelligence(source, {
    existingCatchUpTasks,
    existingHomeworkTasks,
    coachHeartbeatSignals,
  });
  let catchUpTasks = existingCatchUpTasks;
  let homeworkTasks = existingHomeworkTasks;

  if (options.syncTasks) {
    [catchUpTasks, homeworkTasks] = await Promise.all([
      syncCatchUpTasks({
        studentId,
        recommendations: output.catchUpRecommendations,
        schoolWeekModePlan: output.schoolWeekModePlan,
        actorUserId: options.actorUserId,
      }),
      syncHomeworkTasks({
        studentId,
        schoolWeekModePlan: output.schoolWeekModePlan,
        actorUserId: options.actorUserId,
      }),
    ]);
    output = buildAcademicIntelligence(source, {
      existingCatchUpTasks: catchUpTasks,
      existingHomeworkTasks: homeworkTasks,
      coachHeartbeatSignals,
    });
  }

  if (options.refreshDashboardSnapshot) {
    const snapshot = buildAcademicIntelligenceSnapshot(output, "manual_refresh");
    await prisma.studentProfile.upsert({
      where: { childId: studentId },
      create: {
        childId: studentId,
        aiLearningProfileJson: upsertAcademicIntelligenceSnapshotJson(null, snapshot),
      },
      update: {
        aiLearningProfileJson: upsertAcademicIntelligenceSnapshotJson(profile?.aiLearningProfileJson ?? null, snapshot),
      },
    });
  }

  const learningDna = extractLearningDnaFromProfileJson(profile?.aiLearningProfileJson ?? null);
  return buildStudentLearningBrainFromSource({
    source,
    academicIntelligence: output,
    catchUpTasks,
    homeworkTasks,
    coachHeartbeatSignals,
    learningDnaSummary: learningDna ? buildParentLearningDnaSummary(learningDna) : null,
    certificateCount: await readCertificateCount(studentId, profile?.aiLearningProfileJson ?? null),
  });
}

// Role-specific mappers keep route responses consistent and prevent duplicated shaping logic.
export async function getStudentLearningBrainForDashboard(studentId: string, options: { forceRefresh?: boolean } = {}) {
  const [brain, dashboardAssignments, dashboardSkills] = await Promise.all([
    getStudentLearningBrain(studentId, { includeCoachSignals: false }),
    prisma.assignment.findMany({
      where: {
        studentId,
        content: {
          NOT: {
            createdBy: "auto_lesson_engine",
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: {
        id: true,
        status: true,
        contentId: true,
        updatedAt: true,
        content: {
          select: {
            contentType: true,
            topic: true,
            skillFocus: true,
            level: true,
          },
        },
      },
    }),
    prisma.studentSkill.findMany({
      where: { studentId },
      orderBy: { accuracy: "asc" },
      take: 8,
      select: {
        skill: true,
        status: true,
        accuracy: true,
      },
    }),
  ]);
  if (!brain) return null;
  const snapshotResult = await getOrRefreshAcademicIntelligenceSnapshot({
    studentId,
    forceRefresh: options.forceRefresh,
    reason: options.forceRefresh ? "manual_refresh" : undefined,
  });
  return toStudentDashboardBrainView(brain, snapshotResult, {
    assignments: dashboardAssignments.map((assignment) => ({
      id: assignment.id,
      status: assignment.status,
      subject: assignment.content.contentType,
      contentId: assignment.contentId,
      title: assignment.content.topic || assignment.content.skillFocus || assignment.content.contentType,
      skillFocus: assignment.content.skillFocus,
      difficulty: assignment.content.level,
      href: taskHrefForContentType(assignment.content.contentType, assignment.id),
      updatedAt: assignment.updatedAt.toISOString(),
    })),
    skills: dashboardSkills,
  });
}

export function toStudentDashboardBrainView(
  brain: StudentLearningBrain,
  snapshotResult?: Awaited<ReturnType<typeof getOrRefreshAcademicIntelligenceSnapshot>>,
  overrides?: {
    assignments?: Array<{
      id: string;
      status: string;
      subject: string;
      contentId: string | null;
      title: string;
      skillFocus: string | null;
      difficulty: number | null;
      href: string;
      updatedAt: string;
    }>;
    skills?: Array<{ skill: string; status: string; accuracy: number }>;
  },
) {
  const mappedAssignments = overrides?.assignments ?? brain.source.assignments.slice(0, 8).map((assignment) => ({
    id: assignment.id,
    status: assignment.status,
    subject: assignment.subject,
    contentId: assignment.contentId ?? null,
    title: assignment.topic || assignment.skill || assignment.subject,
    skillFocus: assignment.skill ?? null,
    difficulty: null,
    href: taskHrefForContentType(assignment.subject, assignment.id),
    updatedAt: assignment.updatedAt,
  }));
  const assignedWork = buildAssignedWorkSummary(mappedAssignments);
  const skills = overrides?.skills ?? brain.source.studentSkills.slice(0, 8).map((row) => ({
    skill: row.skill,
    status: row.status,
    accuracy: row.accuracy,
  }));
  const snapshot = snapshotResult?.snapshot ?? null;
  const smartCoach = buildSmartCoachSummary({
    skills,
    bestExplanationStyle: snapshot?.learningTwinSummary.bestExplanationStyle ?? brain.academicIntelligence.learningTwin.explanationDNA.bestExplanationStyle,
    hasLearningTwinData: snapshot?.learningTwinSummary.hasEnoughData ?? brain.academicIntelligence.learningTwin.hasEnoughData,
  });

  return {
    assignments: mappedAssignments,
    skills,
    assignedWork,
    smartCoach,
    catchUpSummary: snapshot?.smartCatchUpSummary ?? brain.evidenceSummary.homework,
    masterMapSummary: snapshot?.masterMapSummary ?? brain.academicIntelligence.summary,
    certificateProgressSummary: {
      issuedCount: brain.evidenceSummary.certificates.issuedCount,
      friendlyLabel: brain.evidenceSummary.certificates.issuedCount > 0 ? "Certificates issued" : "Keep learning",
    },
    examReadinessSummary: snapshot?.examReadinessSummary ?? brain.academicIntelligence.examReadinessProfile,
    progressionRecommendationSummary: snapshot?.progressionRecommendationSummary ?? null,
    heartbeatSummary: brain.heartbeatSummary,
    quickLevelFinderBaseline: brain.quickLevelFinderBaseline,
    languageReadiness: brain.languageReadiness,
    snapshot: {
      available: Boolean(snapshot),
      refreshed: snapshotResult?.refreshed ?? false,
      lastCalculatedAt: snapshot?.lastCalculatedAt ?? null,
      refreshReason: snapshot?.refreshReason ?? null,
    },
  };
}

export function toParentLearningBrainView(brain: StudentLearningBrain) {
  return {
    studentId: brain.studentId,
    summary: brain.studentSafeAcademicIntelligence.summary,
    catchUpRecommendations: brain.studentSafeAcademicIntelligence.catchUpRecommendations,
    catchUpTasks: brain.studentSafeAcademicIntelligence.catchUpTasks,
    homeworkTasks: brain.studentSafeAcademicIntelligence.homeworkTasks,
    quickLevelFinderBaseline: brain.quickLevelFinderBaseline,
    heartbeatSummary: brain.heartbeatSummary,
    learningDna: brain.learningDnaSummary,
    weakAreas: brain.evidenceSummary.weakAreas,
    evidenceSummary: brain.evidenceSummary,
    dataState: brain.dataState,
    languageReadiness: brain.languageReadiness,
    generatedAt: brain.generatedAt,
  };
}

export function toAdminLearningBrainView(brain: StudentLearningBrain) {
  return {
    studentId: brain.studentId,
    academicIntelligence: brain.academicIntelligence,
    quickLevelFinderBaseline: brain.quickLevelFinderBaseline,
    heartbeatSummary: brain.heartbeatSummary,
    coachHeartbeatSignals: brain.coachHeartbeatSignals,
    learningDnaSummary: brain.learningDnaSummary,
    evidenceSummary: brain.evidenceSummary,
    dataState: brain.dataState,
    languageReadiness: brain.languageReadiness,
    generatedAt: brain.generatedAt,
  };
}

export function toBrainBackedStudentLearningState(
  brain: StudentLearningBrain,
  input: {
    selectedSubjects?: string[];
    placementResponses?: number;
    speechSamples?: number;
  } = {},
) {
  const selectedSubjects = input.selectedSubjects ?? [];
  const skillRows = brain.source.studentSkills;
  const skillAttempts = skillRows.reduce((sum, row) => sum + (row.attempts ?? 0), 0);
  const masteredSkills = skillRows.filter((row) => row.status === "mastered").length;
  const spellingAttempts = skillRows
    .filter((row) => row.skill.toLowerCase().includes("spell"))
    .reduce((sum, row) => sum + (row.attempts ?? 0), 0);
  const readingAttempts = skillRows
    .filter((row) => row.skill.toLowerCase().includes("read"))
    .reduce((sum, row) => sum + (row.attempts ?? 0), 0);

  return deriveStudentLearningState({
    assignmentCount: brain.evidenceSummary.assignments.total,
    selectedSubjects,
    skillAttempts,
    progressEvents: brain.evidenceSummary.progress.completed,
    weakAreaCount: brain.evidenceSummary.weakAreas.active,
    masteredSkills,
    spellingAttempts,
    readingAttempts,
    speechSamples: input.speechSamples ?? 0,
    placementResponses: input.placementResponses ?? (brain.quickLevelFinderBaseline ? 1 : 0),
    placementCompleted: Boolean(brain.quickLevelFinderBaseline),
  });
}

// Progression decision view is a Brain-backed read for display/recommendation consumers.
// Keep approval, mutation, and audit workflows outside this read layer.
export async function getProgressionDecisionBrainView(input: {
  studentId: string;
  parentId?: string;
}) {
  const student = await prisma.childProfile.findFirst({
    where: {
      id: input.studentId,
      archived: false,
      ...(input.parentId ? { parentId: input.parentId } : {}),
    },
    select: {
      id: true,
      name: true,
      yearGroup: true,
      studentProfile: {
        select: {
          keyStageLevel: true,
          subjectFocus: true,
          aiLearningProfileJson: true,
        },
      },
    },
  });
  if (!student) return null;

  const profileJson = student.studentProfile?.aiLearningProfileJson ?? null;
  const selectedSubjects = parseSelectedSubjectsFromProfileJson(profileJson).length
    ? parseSelectedSubjectsFromProfileJson(profileJson)
    : parseSubjectFocus(student.studentProfile?.subjectFocus ?? null);
  const quick = parseQuickLevelFinderSession(profileJson);

  const [attempts, assignments, weakAreas, studentSkills, progressRecords, contentRows, brain] = await Promise.all([
    prisma.attempt.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: "desc" },
      take: 800,
      select: { subject: true, skillFocus: true, correct: true },
    }),
    prisma.assignment.findMany({
      where: { studentId: student.id, ...(input.parentId ? { student: { parentId: input.parentId } } : {}) },
      orderBy: { updatedAt: "desc" },
      take: 400,
      select: {
        updatedAt: true,
        status: true,
        contentId: true,
        content: { select: { contentType: true, topic: true, skillFocus: true, metadataJson: true } },
      },
    }),
    prisma.weakArea.findMany({
      where: { studentId: student.id },
      orderBy: { updatedAt: "desc" },
      take: 300,
      select: { subject: true, skillFocus: true, status: true },
    }),
    prisma.studentSkill.findMany({
      where: { studentId: student.id },
      orderBy: { updatedAt: "desc" },
      take: 250,
      select: { skill: true, status: true, accuracy: true, attempts: true },
    }),
    prisma.progressRecord.findMany({
      where: { childId: student.id },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { activityType: true, activityName: true, score: true, accuracy: true, completed: true },
    }),
    prisma.aIContentCache.findMany({
      where: { status: { not: "rejected" }, ...(student.yearGroup ? { yearGroup: student.yearGroup } : {}) },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: {
        id: true,
        contentType: true,
        level: true,
        status: true,
        topic: true,
        skillFocus: true,
        yearGroup: true,
        keyStage: true,
        metadataJson: true,
      },
    }),
    getStudentLearningBrain(student.id, { includeCoachSignals: true }),
  ]);

  const placementLessons = quick && quick.status === "completed"
    ? selectPlacementLessons({
      studentId: student.id,
      selectedSubjects,
      placementLevels: quick.levels,
      availableContent: contentRows,
      existingAssignments: assignments.map((assignment) => ({
        id: assignment.contentId,
        contentId: assignment.contentId,
        status: assignment.status,
        href: taskHrefForContentType(assignment.content.contentType, undefined),
      })),
      yearGroup: student.yearGroup,
      keyStage: student.studentProfile?.keyStageLevel ?? null,
    })
    : { recommendations: [], grouped: [], contentGaps: [] };

  const progression = quick && quick.status === "completed" && selectedSubjects.length
    ? buildSubjectLevelProgression({
      studentId: student.id,
      yearGroup: student.yearGroup,
      keyStage: student.studentProfile?.keyStageLevel ?? null,
      selectedSubjects,
      placementLevels: quick.levels,
      attempts,
      assignments: assignments.map((row) => ({
        status: row.status,
        contentType: row.content.contentType,
        topic: row.content.topic,
        skillFocus: row.content.skillFocus,
        metadataJson: row.content.metadataJson,
      })),
      weakAreas,
      studentSkills,
      progressRecords,
      placementRecommendations: placementLessons.recommendations,
    })
    : null;

  return {
    student,
    selectedSubjects,
    quick,
    placementLessons,
    progression,
    attempts,
    assignments,
    weakAreas,
    studentSkills,
    progressRecords,
    heartbeatSummary: brain?.heartbeatSummary ?? null,
    quickLevelFinderBaseline: brain?.quickLevelFinderBaseline ?? null,
    evidenceSummary: brain?.evidenceSummary ?? null,
    languageReadiness: brain?.languageReadiness ?? null,
    summary: progression
      ? {
        total: progression.recommendations.length,
        needsSupport: progression.recommendations.filter((row) => row.status === "needs_support").length,
        readyToAdvance: progression.recommendations.filter((row) => row.status === "ready_to_advance").length,
        reviewNeeded: progression.recommendations.filter((row) => row.status === "review_needed").length,
        friendlyHeadline: progression.recommendations[0] ? progressionFriendlyLabel(progression.recommendations[0].status) : "Keep practising",
      }
      : null,
  };
}
