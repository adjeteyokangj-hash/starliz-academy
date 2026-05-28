import { buildAssessmentRecommendations } from "@/lib/academic-intelligence/assessmentEngine";
import {
  buildCatchUpRecommendations,
  detectCatchUpTriggers,
  unresolvedAcademicGapsFromCatchUp,
} from "@/lib/academic-intelligence/catchUpPlanner";
import {
  buildTaskDueDateMap,
  buildTaskStatusMap,
} from "@/lib/academic-intelligence/catchUpTasks";
import { buildCurriculumIntelligenceGraph } from "@/lib/academic-intelligence/graph";
import { attachGraphMetadataToSchoolWeekPlan } from "@/lib/academic-intelligence/graph-context";
import { buildMasteryMap } from "@/lib/academic-intelligence/masteryMap";
import { buildLearningTwinProfile } from "@/lib/academic-intelligence/learningTwin";
import {
  DEFAULT_SCHOOL_WEEK_SETTINGS,
  sanitizeSchoolWeekSettings,
  stripSchoolWeekSensitiveFields,
} from "@/lib/academic-intelligence/schoolWeekSettings";
import type {
  AcademicAuditHistoryDraft,
  AcademicIntelligenceOutput,
  AcademicReportNote,
  AcademicSourceData,
  CatchUpTaskRecord,
  HomeworkTaskRecord,
  MasteryExpansionSummary,
  ParentAdminReviewAction,
  SchoolWeekModeBlock,
  SchoolWeekModeDayPlan,
  SchoolWeekModePlan,
  SchoolWeekSettings,
  SchoolWeekday,
} from "@/lib/academic-intelligence/types";

export function defaultReviewActions(): ParentAdminReviewAction[] {
  return [
    { action: "approve_catch_up", label: "Approve catch-up", persistenceSupported: true, message: "Schedules task for this week." },
    { action: "reschedule_catch_up", label: "Reschedule catch-up", persistenceSupported: true, message: "Moves task date/day safely." },
    { action: "convert_to_homework", label: "Convert to homework", persistenceSupported: true, message: "Marks task as active homework." },
    { action: "waive_catch_up", label: "Waive catch-up", persistenceSupported: true, message: "Waives task with optional note." },
    { action: "assign_assessment", label: "Assign assessment", persistenceSupported: false, message: "Assessment auto-assignment pending next phase." },
    { action: "mark_reviewed", label: "Mark reviewed", persistenceSupported: true, message: "Records parent/admin review action." },
    { action: "add_note", label: "Add note", persistenceSupported: true, message: "Persists contextual note for this task." },
  ];
}

function reportNotes(output: Pick<AcademicIntelligenceOutput,
  | "summary"
  | "curriculumCoverage"
  | "catchUpRecommendations"
  | "assessmentRecommendations"
  | "gcseReadiness"
>): AcademicReportNote[] {
  const completedCatchUps = output.catchUpRecommendations.filter((task) => task.status === "completed").length;
  const unresolvedCatchUps = output.catchUpRecommendations.filter((task) => task.status !== "completed" && task.status !== "waived").length;
  const weakTopic = output.catchUpRecommendations[0]?.topic ?? output.curriculumCoverage.find((row) => row.coverageStatus === "gap_detected")?.topic ?? "None";

  return [
    { category: "mastery_status", value: `${output.summary.needsCatchUpCount} topics need catch-up support.` },
    { category: "curriculum_coverage", value: `${output.summary.coveredCount}/${output.summary.totalTopics} topics are currently covered.` },
    { category: "catch_up_required", value: `${output.catchUpRecommendations.length} catch-up recommendations are active.` },
    { category: "catch_up_completed", value: `${completedCatchUps} catch-up tasks completed.` },
    { category: "unresolved_catch_up", value: `${unresolvedCatchUps} catch-up tasks unresolved.` },
    { category: "assessment_recommended", value: `${output.assessmentRecommendations.length} assessment recommendations generated.` },
    { category: "weak_topic", value: weakTopic },
    {
      category: "overdue_revision",
      value: `${output.curriculumCoverage.filter((row) => row.coverageStatus === "overdue_revision").length} topics due for revision.`,
    },
    {
      category: "gcse_readiness",
      value: output.gcseReadiness
        ? `${output.gcseReadiness.readinessStatus} (${output.gcseReadiness.coverageGapCount} GCSE coverage gaps).`
        : "Not applicable",
    },
    { category: "parent_admin_action", value: "Review, schedule, and support catch-up tasks weekly." },
  ];
}

function buildAuditDrafts(output: Pick<AcademicIntelligenceOutput, "studentId" | "catchUpRecommendations">): AcademicAuditHistoryDraft[] {
  return output.catchUpRecommendations.map((item) => ({
    recommendationId: item.id,
    studentId: output.studentId,
    triggerReason: item.sourceTrigger,
    sourceData: item.reason,
    recommendationDate: new Date().toISOString(),
    actionTaken: null,
    reviewedBy: null,
    reviewedAt: null,
    outcome: null,
    notes: null,
  }));
}

function nextActions(output: Pick<AcademicIntelligenceOutput, "catchUpRecommendations" | "assessmentRecommendations">): string[] {
  const actions: string[] = [];
  const topCatchUp = output.catchUpRecommendations[0];
  if (topCatchUp) actions.push(`Start catch-up: ${topCatchUp.title}`);
  const topAssessment = output.assessmentRecommendations[0];
  if (topAssessment) actions.push(`Assessment next: ${topAssessment.assessmentType} (${topAssessment.topic ?? topAssessment.subject})`);
  if (!actions.length) actions.push("Complete a lesson to build your learning map.");
  return actions;
}

function buildMasteryExpansionSummary(output: Pick<AcademicIntelligenceOutput, "masteryMap">): MasteryExpansionSummary {
  const needsCatchUpTopics = output.masteryMap.filter((row) => row.masteryStatus === "needs_catch_up").length;
  const nearlySecureTopics = output.masteryMap.filter((row) => row.masteryStatus === "nearly_secure").length;
  const masteredTopics = output.masteryMap.filter((row) => row.masteryStatus === "mastered").length;
  const overdueRevisionTopics = output.masteryMap.filter((row) => row.revisionOverdue || row.masteryStatus === "needs_revision").length;
  const highConfidenceTopics = output.masteryMap.filter((row) => row.confidenceScore >= 80).length;
  const priorityTopics = output.masteryMap
    .filter((row) => row.masteryStatus === "needs_catch_up" || row.masteryStatus === "needs_revision")
    .slice(0, 6)
    .map((row) => row.topic ?? row.skill ?? row.subject ?? "General topic");

  return {
    needsCatchUpTopics,
    nearlySecureTopics,
    masteredTopics,
    overdueRevisionTopics,
    highConfidenceTopics,
    priorityTopics,
  };
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map((value) => Number(value));
  const total = (h * 60) + m + minutes;
  const wrapped = ((total % (24 * 60)) + (24 * 60)) % (24 * 60);
  const nextHour = Math.floor(wrapped / 60).toString().padStart(2, "0");
  const nextMinute = (wrapped % 60).toString().padStart(2, "0");
  return `${nextHour}:${nextMinute}`;
}

function minutesBetween(start: string, end: string): number {
  const [startHour, startMinute] = start.split(":").map((value) => Number(value));
  const [endHour, endMinute] = end.split(":").map((value) => Number(value));
  const startTotal = (startHour * 60) + startMinute;
  const endTotal = (endHour * 60) + endMinute;
  if (endTotal <= startTotal) return 0;
  return endTotal - startTotal;
}

function buildSchoolWeekModePlan(input: {
  output: Pick<AcademicIntelligenceOutput,
  | "catchUpRecommendations"
  | "assessmentRecommendations"
  | "masteryMap"
  | "examReadinessProfile"
  >;
  settings?: SchoolWeekSettings;
}): SchoolWeekModePlan {
  const settings = sanitizeSchoolWeekSettings(input.settings, DEFAULT_SCHOOL_WEEK_SETTINGS);
  const safeSettings = stripSchoolWeekSensitiveFields(settings);
  const allDays: SchoolWeekday[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const enabledDays = settings.activeDays.length ? settings.activeDays : allDays;

  const catchUpPool = settings.includeCatchUpTasks
    ? input.output.catchUpRecommendations.filter((item) => item.status !== "completed" && item.status !== "waived").slice(0, 8)
    : [];
  const assessmentPool = input.output.assessmentRecommendations.slice(0, 5);
  const masteryPool = input.output.masteryMap
    .filter((item) => item.masteryStatus === "nearly_secure" || item.masteryStatus === "mastered")
    .slice(0, 8);

  const selectedSubjects = settings.weeklySubjectSelection.length
    ? settings.weeklySubjectSelection.map((item) => item.trim().toLowerCase())
    : [];

  let catchUpIndex = 0;
  let assessmentIndex = 0;
  let masteryIndex = 0;

  const daySummaries: SchoolWeekModeDayPlan[] = [];
  const dailySchedules: SchoolWeekModePlan["dailySchedules"] = [];

  for (const day of allDays) {
    if (!enabledDays.includes(day) || !settings.enabled) {
      daySummaries.push({
        day,
        focus: "Recovery day",
        activityType: "revision",
        estimatedMinutes: 0,
        routeTarget: null,
        recommendationId: null,
      });
      dailySchedules.push({ day, totalMinutes: 0, blocks: [] });
      continue;
    }

    const blocks: SchoolWeekModeBlock[] = [];
    let cursor = settings.startTime;
    let blockCounter = 0;
    const availableMinutes = minutesBetween(settings.startTime, settings.endTime);
    let remainingMinutes = availableMinutes;

    const pushBlock = (block: Omit<SchoolWeekModeBlock, "blockId" | "day" | "startTime" | "endTime">) => {
      if (remainingMinutes < block.estimatedMinutes || block.estimatedMinutes <= 0) return false;
      const startTime = cursor;
      const endTime = addMinutes(startTime, block.estimatedMinutes);
      blocks.push({
        blockId: `${day}-${blockCounter}`,
        day,
        startTime,
        endTime,
        ...block,
      });
      blockCounter += 1;
      cursor = endTime;
      remainingMinutes -= block.estimatedMinutes;
      return true;
    };

    pushBlock({
      title: "Check-in",
      activityType: "check_in",
      subject: null,
      topic: null,
      estimatedMinutes: 10,
      routeTarget: "/student/dashboard",
      recommendationId: null,
      friendlyLabel: "Start with a short check-in and a clear goal.",
    });

    let filledSubjects = 0;
    while (filledSubjects < settings.dailySubjectLimit && remainingMinutes >= settings.lessonBlockMinutes) {
      const catchUp = catchUpPool[catchUpIndex];
      const mastery = masteryPool[masteryIndex];
      const assessment = assessmentPool[assessmentIndex];

      const pickCatchUp = Boolean(catchUp && (filledSubjects % 2 === 0 || !mastery));
      const pickAssessment = Boolean(assessment && (filledSubjects === settings.dailySubjectLimit - 1));

      if (pickCatchUp && catchUp) {
        catchUpIndex += 1;
        if (selectedSubjects.length > 0 && !selectedSubjects.includes(catchUp.subject.trim().toLowerCase())) {
          continue;
        }
        if (!pushBlock({
          title: catchUp.title,
          activityType: "catch_up",
          subject: catchUp.subject,
          topic: catchUp.topic,
          estimatedMinutes: Math.min(Math.max(catchUp.estimatedMinutes, 20), settings.lessonBlockMinutes),
          routeTarget: catchUp.routeTarget ?? "/student/dashboard",
          recommendationId: catchUp.id,
          friendlyLabel: "Target the toughest gap first while energy is high.",
        })) break;
      } else if (pickAssessment && assessment) {
        assessmentIndex += 1;
        if (!pushBlock({
          title: `Assessment: ${assessment.topic ?? assessment.subject}`,
          activityType: "quiz",
          subject: assessment.subject,
          topic: assessment.topic,
          estimatedMinutes: Math.min(Math.max(assessment.estimatedMinutes, 20), settings.lessonBlockMinutes),
          routeTarget: assessment.routeTarget ?? "/student/dashboard",
          recommendationId: null,
          friendlyLabel: "Finish with an assessment to lock in confidence.",
        })) break;
      } else if (mastery) {
        masteryIndex += 1;
        if (!pushBlock({
          title: `Mastery: ${mastery.topic ?? mastery.subject}`,
          activityType: "subject",
          subject: mastery.subject,
          topic: mastery.topic,
          estimatedMinutes: settings.lessonBlockMinutes,
          routeTarget: "/student/dashboard",
          recommendationId: null,
          friendlyLabel: "Build fluency with focused mastery practice.",
        })) break;
      } else {
        break;
      }
      filledSubjects += 1;

      if (filledSubjects < settings.dailySubjectLimit && remainingMinutes >= settings.shortBreakMinutes) {
        pushBlock({
          title: "Short break",
          activityType: "break",
          subject: null,
          topic: null,
          estimatedMinutes: settings.shortBreakMinutes,
          routeTarget: null,
          recommendationId: null,
          friendlyLabel: "Reset with water and movement before the next block.",
        });
      }
    }

    if (remainingMinutes >= settings.lunchMinutes) {
      pushBlock({
        title: "Lunch",
        activityType: "lunch",
        subject: null,
        topic: null,
        estimatedMinutes: settings.lunchMinutes,
        routeTarget: null,
        recommendationId: null,
        friendlyLabel: "Refuel and rest before continuing.",
      });
    }

    if (settings.includeRevisionBlocks && remainingMinutes >= 20) {
      pushBlock({
        title: "Revision sprint",
        activityType: "revision",
        subject: null,
        topic: null,
        estimatedMinutes: Math.min(25, remainingMinutes),
        routeTarget: "/student/dashboard",
        recommendationId: null,
        friendlyLabel: "Revisit earlier topics to strengthen long-term memory.",
      });
    }

    if (settings.includeHomeworkBlock && remainingMinutes >= 15) {
      pushBlock({
        title: "Homework focus",
        activityType: "homework",
        subject: null,
        topic: null,
        estimatedMinutes: Math.min(20, remainingMinutes),
        routeTarget: "/student/dashboard",
        recommendationId: null,
        friendlyLabel: "Complete assigned tasks while learning is still fresh.",
      });
    }

    if (settings.includeWellbeingBlock && remainingMinutes >= 10) {
      pushBlock({
        title: "Wellbeing pause",
        activityType: "wellbeing",
        subject: null,
        topic: null,
        estimatedMinutes: Math.min(10, remainingMinutes),
        routeTarget: null,
        recommendationId: null,
        friendlyLabel: "Breathe, stretch, and reset focus.",
      });
    }

    if (settings.includeEndOfDaySummary && remainingMinutes >= 10) {
      pushBlock({
        title: "End-of-day summary",
        activityType: "summary",
        subject: null,
        topic: null,
        estimatedMinutes: Math.min(10, remainingMinutes),
        routeTarget: "/student/dashboard",
        recommendationId: null,
        friendlyLabel: "Reflect on wins and set tomorrow's first target.",
      });
    }

    const primary = blocks.find((item) => item.recommendationId) ?? blocks.find((item) => item.activityType !== "break" && item.activityType !== "lunch") ?? null;
    const totalMinutes = blocks.reduce((sum, item) => sum + item.estimatedMinutes, 0);
    daySummaries.push({
      day,
      focus: primary?.title ?? "Recovery day",
      activityType: primary?.activityType === "catch_up"
        ? "catch_up"
        : primary?.activityType === "quiz"
          ? "assessment"
          : primary?.activityType === "revision"
            ? "revision"
            : "mastery",
      estimatedMinutes: totalMinutes,
      routeTarget: primary?.routeTarget ?? "/student/dashboard",
      recommendationId: primary?.recommendationId ?? null,
    });

    dailySchedules.push({ day, totalMinutes, blocks });
  }

  const totalEstimatedMinutes = daySummaries.reduce((sum, day) => sum + day.estimatedMinutes, 0);
  const strategy = input.output.examReadinessProfile.band === "ready"
    ? "Balanced weekly cycle: maintain mastery and run exam-style checks."
    : input.output.examReadinessProfile.band === "nearly_ready"
      ? "Catch-up first, then assessment consolidation later in the week."
      : "Foundation-first week: short guided catch-up blocks each day.";

  return {
    enabled: settings.enabled,
    strategy,
    totalEstimatedMinutes,
    days: daySummaries,
    dailySchedules,
    settings: safeSettings,
  };
}

export function buildAcademicIntelligence(
  data: AcademicSourceData,
  options?: {
    existingCatchUpTasks?: CatchUpTaskRecord[];
    existingHomeworkTasks?: HomeworkTaskRecord[];
  },
): AcademicIntelligenceOutput {
  const generatedAt = data.generatedAt ?? new Date().toISOString();
  const masteryBuilt = buildMasteryMap(data);
  const existingTasks = options?.existingCatchUpTasks ?? [];
  const existingHomeworkTasks = options?.existingHomeworkTasks ?? [];

  const triggers = detectCatchUpTriggers({
    masteryMap: masteryBuilt.masteryMap,
    coverageMap: masteryBuilt.curriculumCoverage,
    nowIso: generatedAt,
  });

  const assessmentBuilt = buildAssessmentRecommendations({
    masteryMap: masteryBuilt.masteryMap,
    coverageMap: masteryBuilt.curriculumCoverage,
    catchUpTriggers: triggers,
  });

  const allTriggers = [...triggers, ...assessmentBuilt.assessmentLinkedCatchUpTriggers];
  const catchUpRecommendations = buildCatchUpRecommendations({
    triggers: allTriggers,
    existingStatuses: buildTaskStatusMap(existingTasks),
    existingDueDates: buildTaskDueDateMap(existingTasks),
  });

  const output: AcademicIntelligenceOutput = {
    studentId: data.studentId,
    summary: masteryBuilt.summary,
    learningTwin: buildLearningTwinProfile({
      source: data,
      summary: masteryBuilt.summary,
      catchUpTasks: existingTasks,
    }),
    masteryMap: masteryBuilt.masteryMap,
    masteryExpansion: {
      needsCatchUpTopics: 0,
      nearlySecureTopics: 0,
      masteredTopics: 0,
      overdueRevisionTopics: 0,
      highConfidenceTopics: 0,
      priorityTopics: [],
    },
    curriculumCoverage: masteryBuilt.curriculumCoverage,
    catchUpTriggers: allTriggers,
    catchUpRecommendations,
    catchUpTasks: existingTasks,
    homeworkTasks: existingHomeworkTasks,
    assessmentRecommendations: assessmentBuilt.recommendations,
    assessmentReadiness: assessmentBuilt.readinessStatus,
    examReadinessProfile: assessmentBuilt.examReadinessProfile,
    gcseReadiness: assessmentBuilt.gcseReadiness,
    schoolWeekModePlan: {
      enabled: false,
      strategy: "",
      totalEstimatedMinutes: 0,
      days: [],
      dailySchedules: [],
      settings: stripSchoolWeekSensitiveFields(DEFAULT_SCHOOL_WEEK_SETTINGS),
    },
    reviewActions: defaultReviewActions(),
    reportNotes: [],
    unresolvedAcademicGaps: [],
    nextRecommendedActions: [],
    curriculumIntelligenceGraph: {
      version: "v1",
      generatedAt,
      studentId: data.studentId,
      nodes: [],
      edges: [],
      recommendationLayer: [],
      masteryOverlay: [],
      weakAreaTrace: [],
      heartbeat: {
        sourceOfTruth: "academic_intelligence",
        generatedAt,
        systemStates: [],
      },
      aiGenerationContext: {
        masteryGapTopics: [],
        prerequisiteConcepts: [],
        weakAreaTopics: [],
        recommendationFocus: [],
        catchUpRouteTargets: [],
        examReadinessBand: "not_ready",
        examReadinessBlockers: [],
        learningTwinSignals: [],
        bestExplanationStyle: "step_by_step_explanation",
        recommendedApproach: "",
      },
      schoolPlanningContext: {
        strategy: "",
        activeDayCount: 0,
        blockMetadata: [],
        recommendationIds: [],
        homeworkTaskIds: [],
        revisionTopicKeys: [],
      },
      reportSummary: {
        recommendationReasons: [],
        parentSummary: "",
        adminSummary: "",
        reportSignals: [],
      },
      contentGovernance: {
        ageSuitability: {
          keyStage: null,
          yearGroup: null,
          status: "review",
        },
        curriculumAlignment: {
          coveredTopicCount: 0,
          gapTopicCount: 0,
          status: "review",
        },
        sensitiveContent: {
          status: "clear",
          flaggedTags: [],
        },
        approvalStatus: {
          requiredStatuses: ["reviewed", "published"],
          recommendedDefault: "reviewed",
          status: "review_required",
        },
        auditTrailTags: [],
      },
      mediaPlan: {
        supportedAssetTypes: [],
        references: [],
        summary: "",
      },
    },
    auditHistoryDraft: [],
    generatedAt,
  };

  output.reportNotes = reportNotes(output);
  output.masteryExpansion = buildMasteryExpansionSummary(output);
  output.schoolWeekModePlan = buildSchoolWeekModePlan({ output, settings: data.schoolWeekSettings });
  output.catchUpTasks = output.catchUpTasks.length
    ? output.catchUpTasks
    : output.catchUpRecommendations.map((recommendation) => ({
      taskId: `catch-up-${recommendation.id}`,
      studentId: output.studentId,
      recommendationId: recommendation.id,
      title: recommendation.title,
      subject: recommendation.subject,
      topic: recommendation.topic,
      skill: recommendation.skill,
      status: recommendation.status,
      priority: recommendation.priority,
      estimatedMinutes: recommendation.estimatedMinutes,
      dueDate: recommendation.dueDate,
      scheduledDay: output.schoolWeekModePlan.days.find((day) => day.recommendationId === recommendation.id)?.day ?? null,
      routeTarget: recommendation.routeTarget ?? null,
      sourceTrigger: recommendation.sourceTrigger,
      note: null,
      metadata: undefined,
      createdAt: output.generatedAt,
      updatedAt: output.generatedAt,
    }));
  output.curriculumIntelligenceGraph = buildCurriculumIntelligenceGraph({
    source: data,
    output,
  });
  output.schoolWeekModePlan = attachGraphMetadataToSchoolWeekPlan(
    output.schoolWeekModePlan,
    output.curriculumIntelligenceGraph.schoolPlanningContext,
  );
  output.unresolvedAcademicGaps = unresolvedAcademicGapsFromCatchUp(output);
  output.nextRecommendedActions = nextActions(output);
  output.auditHistoryDraft = buildAuditDrafts(output);

  return output;
}

export function toStudentSafeAcademicIntelligence(output: AcademicIntelligenceOutput): Pick<
  AcademicIntelligenceOutput,
  | "studentId"
  | "summary"
  | "learningTwin"
  | "masteryExpansion"
  | "curriculumCoverage"
  | "catchUpRecommendations"
  | "catchUpTasks"
  | "homeworkTasks"
  | "assessmentRecommendations"
  | "examReadinessProfile"
  | "schoolWeekModePlan"
  | "nextRecommendedActions"
  | "curriculumIntelligenceGraph"
  | "generatedAt"
> {
  return {
    studentId: output.studentId,
    summary: output.summary,
    learningTwin: output.learningTwin,
    masteryExpansion: output.masteryExpansion,
    curriculumCoverage: output.curriculumCoverage,
    catchUpRecommendations: output.catchUpRecommendations.map((item) => ({
      ...item,
      reason: item.studentFriendlyReason,
    })),
    catchUpTasks: output.catchUpTasks,
    homeworkTasks: output.homeworkTasks,
    assessmentRecommendations: output.assessmentRecommendations.map((item) => ({
      ...item,
      reason: item.reason,
    })),
    examReadinessProfile: output.examReadinessProfile,
    schoolWeekModePlan: output.schoolWeekModePlan,
    nextRecommendedActions: output.nextRecommendedActions,
    curriculumIntelligenceGraph: output.curriculumIntelligenceGraph,
    generatedAt: output.generatedAt,
  };
}
