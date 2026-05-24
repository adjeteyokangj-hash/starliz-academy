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
  ParentAdminReviewAction,
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
    curriculumCoverage: masteryBuilt.curriculumCoverage,
    catchUpTriggers: allTriggers,
    catchUpRecommendations,
    assessmentRecommendations: assessmentBuilt.recommendations,
    assessmentReadiness: assessmentBuilt.readinessStatus,
    gcseReadiness: assessmentBuilt.gcseReadiness,
    reviewActions: defaultReviewActions(),
    reportNotes: [],
    unresolvedAcademicGaps: [],
    nextRecommendedActions: [],
    auditHistoryDraft: [],
    generatedAt,
  };

  output.reportNotes = reportNotes(output);
  output.unresolvedAcademicGaps = unresolvedAcademicGapsFromCatchUp(output);
  output.nextRecommendedActions = nextActions(output);
  output.auditHistoryDraft = buildAuditDrafts(output);

  return output;
}

export function toStudentSafeAcademicIntelligence(output: AcademicIntelligenceOutput): Pick<
  AcademicIntelligenceOutput,
  | "studentId"
  | "summary"
  | "catchUpRecommendations"
  | "assessmentRecommendations"
  | "nextRecommendedActions"
  | "generatedAt"
> {
  return {
    studentId: output.studentId,
    summary: output.summary,
    catchUpRecommendations: output.catchUpRecommendations.map((item) => ({
      ...item,
      reason: item.studentFriendlyReason,
    })),
    assessmentRecommendations: output.assessmentRecommendations.map((item) => ({
      ...item,
      reason: item.reason,
    })),
    nextRecommendedActions: output.nextRecommendedActions,
    generatedAt: output.generatedAt,
  };
}
