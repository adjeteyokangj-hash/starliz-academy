import { buildAssessmentRecommendations } from "@/lib/academic-intelligence/assessmentEngine";
import {
  buildCatchUpRecommendations,
  detectCatchUpTriggers,
  unresolvedAcademicGapsFromCatchUp,
} from "@/lib/academic-intelligence/catchUpPlanner";
import { buildMasteryMap } from "@/lib/academic-intelligence/masteryMap";
import type {
  AcademicAuditHistoryDraft,
  AcademicIntelligenceOutput,
  AcademicReportNote,
  AcademicSourceData,
  MasteryExpansionSummary,
  ParentAdminReviewAction,
  SchoolWeekModeDayPlan,
  SchoolWeekModePlan,
} from "@/lib/academic-intelligence/types";

export function defaultReviewActions(): ParentAdminReviewAction[] {
  return [
    { action: "approve_catch_up", label: "Approve catch-up", persistenceSupported: false, message: "Requires persistence setup" },
    { action: "reschedule_catch_up", label: "Reschedule catch-up", persistenceSupported: false, message: "Requires persistence setup" },
    { action: "convert_to_homework", label: "Convert to homework", persistenceSupported: false, message: "Requires persistence setup" },
    { action: "waive_catch_up", label: "Waive catch-up", persistenceSupported: false, message: "Requires persistence setup" },
    { action: "assign_assessment", label: "Assign assessment", persistenceSupported: false, message: "Requires persistence setup" },
    { action: "mark_reviewed", label: "Mark reviewed", persistenceSupported: false, message: "Requires persistence setup" },
    { action: "add_note", label: "Add note", persistenceSupported: false, message: "Requires persistence setup" },
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

function buildSchoolWeekModePlan(output: Pick<AcademicIntelligenceOutput,
  | "catchUpRecommendations"
  | "assessmentRecommendations"
  | "examReadinessProfile"
>): SchoolWeekModePlan {
  const days: Array<SchoolWeekModeDayPlan["day"]> = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

  const catchUpPool = output.catchUpRecommendations.slice(0, 3);
  const assessmentPool = output.assessmentRecommendations.slice(0, 2);
  const combined = [
    ...catchUpPool.map((item) => ({
      focus: item.title,
      activityType: "catch_up" as const,
      estimatedMinutes: item.estimatedMinutes,
      routeTarget: item.routeTarget ?? null,
      recommendationId: item.id,
    })),
    ...assessmentPool.map((item, index) => ({
      focus: `Assessment: ${item.topic ?? item.subject}`,
      activityType: "assessment" as const,
      estimatedMinutes: item.estimatedMinutes,
      routeTarget: item.routeTarget ?? "/student/dashboard",
      recommendationId: `assessment-${index}`,
    })),
  ];

  const fallback = {
    focus: "Mastery maintenance practice",
    activityType: "mastery" as const,
    estimatedMinutes: 20,
    routeTarget: "/student/dashboard",
    recommendationId: null,
  };

  const dayPlans: SchoolWeekModeDayPlan[] = days.map((day, index) => {
    const selected = combined[index] ?? fallback;
    return {
      day,
      ...selected,
    };
  });

  const totalEstimatedMinutes = dayPlans.reduce((sum, day) => sum + day.estimatedMinutes, 0);
  const strategy = output.examReadinessProfile.band === "ready"
    ? "Balanced weekly cycle: maintain mastery and run exam-style checks."
    : output.examReadinessProfile.band === "nearly_ready"
      ? "Catch-up first, then assessment consolidation later in the week."
      : "Foundation-first week: short guided catch-up blocks each day.";

  return {
    enabled: true,
    strategy,
    totalEstimatedMinutes,
    days: dayPlans,
  };
}

export function buildAcademicIntelligence(data: AcademicSourceData): AcademicIntelligenceOutput {
  const generatedAt = data.generatedAt ?? new Date().toISOString();
  const masteryBuilt = buildMasteryMap(data);

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
  const catchUpRecommendations = buildCatchUpRecommendations({ triggers: allTriggers });

  const output: AcademicIntelligenceOutput = {
    studentId: data.studentId,
    summary: masteryBuilt.summary,
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
    assessmentRecommendations: assessmentBuilt.recommendations,
    assessmentReadiness: assessmentBuilt.readinessStatus,
    examReadinessProfile: assessmentBuilt.examReadinessProfile,
    gcseReadiness: assessmentBuilt.gcseReadiness,
    schoolWeekModePlan: {
      enabled: false,
      strategy: "",
      totalEstimatedMinutes: 0,
      days: [],
    },
    reviewActions: defaultReviewActions(),
    reportNotes: [],
    unresolvedAcademicGaps: [],
    nextRecommendedActions: [],
    auditHistoryDraft: [],
    generatedAt,
  };

  output.reportNotes = reportNotes(output);
  output.masteryExpansion = buildMasteryExpansionSummary(output);
  output.schoolWeekModePlan = buildSchoolWeekModePlan(output);
  output.unresolvedAcademicGaps = unresolvedAcademicGapsFromCatchUp(output);
  output.nextRecommendedActions = nextActions(output);
  output.auditHistoryDraft = buildAuditDrafts(output);

  return output;
}

export function toStudentSafeAcademicIntelligence(output: AcademicIntelligenceOutput): Pick<
  AcademicIntelligenceOutput,
  | "studentId"
  | "summary"
  | "masteryExpansion"
  | "catchUpRecommendations"
  | "assessmentRecommendations"
  | "examReadinessProfile"
  | "schoolWeekModePlan"
  | "nextRecommendedActions"
  | "generatedAt"
> {
  return {
    studentId: output.studentId,
    summary: output.summary,
    masteryExpansion: output.masteryExpansion,
    catchUpRecommendations: output.catchUpRecommendations.map((item) => ({
      ...item,
      reason: item.studentFriendlyReason,
    })),
    assessmentRecommendations: output.assessmentRecommendations.map((item) => ({
      ...item,
      reason: item.reason,
    })),
    examReadinessProfile: output.examReadinessProfile,
    schoolWeekModePlan: output.schoolWeekModePlan,
    nextRecommendedActions: output.nextRecommendedActions,
    generatedAt: output.generatedAt,
  };
}
