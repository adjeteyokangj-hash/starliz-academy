import type {
  AcademicIntelligenceOutput,
  AcademicSourceData,
  CoachHeartbeatSignalSummary,
  HeartbeatDecision,
  HeartbeatDecisionActor,
  HeartbeatDecisionRisk,
  HeartbeatDecisionUrgency,
  HeartbeatPrimaryAction,
} from "@/lib/academic-intelligence/types";
import { summarizeCanonicalCatchUp } from "@/lib/canonical-completion-accessor";

type DecisionInput = {
  source: Pick<AcademicSourceData, "quickLevelFinderBaseline">;
  coachHeartbeatSignals?: CoachHeartbeatSignalSummary | null;
  output: Pick<
    AcademicIntelligenceOutput,
    | "summary"
    | "masteryMap"
    | "catchUpRecommendations"
    | "catchUpTasks"
    | "homeworkTasks"
    | "assessmentRecommendations"
    | "assessmentReadiness"
    | "examReadinessProfile"
    | "learningTwin"
    | "unresolvedAcademicGaps"
    | "nextRecommendedActions"
  >;
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function urgencyFromAction(action: HeartbeatPrimaryAction, input: {
  overdueCatchUpCount: number;
  unresolvedWeakAreaCount: number;
  repeatedStruggleCount: number;
}): HeartbeatDecisionUrgency {
  if (input.overdueCatchUpCount > 0) return "critical";
  if (action === "trigger_tutor_intervention" || action === "trigger_parent_alert") return "high";
  if (action === "assign_catch_up" || action === "generate_revision" || action === "generate_assessment") return "high";
  if (input.unresolvedWeakAreaCount > 0 || input.repeatedStruggleCount > 0) return "medium";
  return action === "advance_student" ? "low" : "medium";
}

function riskFromSignals(input: {
  overdueCatchUpCount: number;
  unresolvedWeakAreaCount: number;
  repeatedStruggleCount: number;
  qlfComplete: boolean;
  masteryStrong: boolean;
}): HeartbeatDecisionRisk {
  if (!input.qlfComplete) return "high";
  if (input.overdueCatchUpCount > 0) return "critical";
  if (input.unresolvedWeakAreaCount >= 2 || input.repeatedStruggleCount >= 2) return "high";
  if (input.masteryStrong) return "low";
  return "medium";
}

function actorForAction(action: HeartbeatPrimaryAction): HeartbeatDecisionActor {
  if (action === "trigger_parent_alert") return "parent";
  if (action === "trigger_tutor_intervention" || action === "review_placement") return "tutor";
  if (action === "generate_assessment" || action === "generate_revision" || action === "schedule_homework") return "system";
  if (action === "recommend_exam_preparation") return "admin";
  return "student";
}

function suggestedStep(action: HeartbeatPrimaryAction, fallback: string): string {
  if (action === "review_placement") return "Complete Quick Level Finder baseline before progression decisions.";
  if (action === "assign_catch_up") return "Start highest-priority catch-up task and complete it before new advancement.";
  if (action === "generate_revision") return "Generate targeted revision pack for weak topics and run a short follow-up check.";
  if (action === "generate_assessment") return "Generate an assessment for the top weak topic to validate readiness.";
  if (action === "trigger_tutor_intervention") return "Escalate to tutor with weak-area evidence and learning twin guidance.";
  if (action === "trigger_parent_alert") return "Alert parent with clear support plan and expected home follow-up.";
  if (action === "schedule_homework") return "Schedule and complete pending homework aligned to current weak topics.";
  if (action === "recommend_exam_preparation") return "Prioritise exam-preparation tasks from readiness blockers.";
  if (action === "advance_student") return "Advance to the next topic while monitoring confidence and assessment stability.";
  return fallback;
}

export function buildHeartbeatDecisionEngine(input: DecisionInput): HeartbeatDecision {
  const { source, output, coachHeartbeatSignals } = input;
  const qlfComplete = Boolean(source.quickLevelFinderBaseline?.completedAt);

  const unresolvedWeakAreaCount = output.masteryMap.filter((entry) => entry.weakAreaActive).length;
  const repeatedStruggleCount = output.masteryMap.filter((entry) => entry.repeatedMistakes >= 3 || entry.hintUsageRate >= 0.6 || entry.confidenceScore < 45).length;
  const catchUpCompletion = summarizeCanonicalCatchUp({
    recommendationStatuses: output.catchUpRecommendations.map((item) => item.status),
    taskStatuses: output.catchUpTasks.map((item) => item.status),
  });
  const activeCatchUpCount = catchUpCompletion.active;
  const overdueCatchUpCount = catchUpCompletion.overdue;
  const assessmentLow = output.assessmentReadiness === "not_ready" || output.assessmentReadiness === "needs_catch_up" || output.assessmentReadiness === "developing";
  const homeworkOverdueCount = output.homeworkTasks.filter((item) => item.status === "overdue").length;
  const homeworkPendingCount = output.homeworkTasks.filter((item) => item.status === "assigned" || item.status === "in_progress").length;
  const masteryStrong = output.summary.needsCatchUpCount === 0
    && output.summary.needsRevisionCount === 0
    && unresolvedWeakAreaCount === 0
    && output.summary.averageScore >= 75;
  const catchUpBlocked = activeCatchUpCount > 0 || overdueCatchUpCount > 0;
  const unresolvedBlockers = unresolvedWeakAreaCount > 0 || output.unresolvedAcademicGaps.length > 0;

  const reasons: string[] = [];
  const blockers: string[] = [];
  const evidence: string[] = [];
  const coachEvidence: string[] = [];
  const conflictSignals = qlfComplete && masteryStrong && (catchUpBlocked || assessmentLow || unresolvedBlockers);

  let primaryAction: HeartbeatPrimaryAction = "maintain_level";

  if (!qlfComplete) {
    const evidence = [
      "QLF baseline: not completed",
      `Mastery summary: catch-up ${output.summary.needsCatchUpCount}, revision ${output.summary.needsRevisionCount}, average ${output.summary.averageScore}%`,
      `Assessment readiness: ${output.assessmentReadiness}`,
      `Learning twin confidence: ${output.learningTwin.explanationDNA.confidenceBand}`,
    ];
    return {
      primaryAction: "review_placement",
      confidenceScore: 36,
      urgency: "high",
      reasons: ["Quick Level Finder baseline is not completed."],
      blockers: ["Placement confidence is missing."],
      evidence,
      actorRequired: "tutor",
      suggestedNextStep: "Complete Quick Level Finder baseline before progression decisions.",
      riskLevel: "high",
    };
  } else if (catchUpBlocked) {
    primaryAction = "assign_catch_up";
    reasons.push("Active or overdue catch-up tasks must be completed before progression.");
    blockers.push("Catch-up pipeline is still open.");
  } else if (repeatedStruggleCount >= 2 && unresolvedBlockers) {
    primaryAction = output.learningTwin.explanationDNA.coachSupportSignal === "active"
      ? "trigger_tutor_intervention"
      : "trigger_parent_alert";
    reasons.push("Repeated struggle and unresolved weak areas indicate intervention is required.");
    blockers.push("Stable independent progression is not yet demonstrated.");
  } else if (assessmentLow) {
    primaryAction = output.assessmentRecommendations.length > 0
      && output.assessmentReadiness === "nearly_ready"
      ? "generate_assessment"
      : "generate_revision";
    reasons.push("Assessment readiness is below secure level.");
    blockers.push("Readiness evidence is insufficient for safe advancement.");
  } else if (output.examReadinessProfile.band === "not_ready" && output.examReadinessProfile.blockers.length > 0) {
    primaryAction = "recommend_exam_preparation";
    reasons.push("Exam readiness profile indicates foundational blockers.");
  } else if ((homeworkOverdueCount > 0 || homeworkPendingCount > 0) && !masteryStrong) {
    primaryAction = "schedule_homework";
    reasons.push("Homework pipeline has pending work aligned to current topics.");
  } else if (masteryStrong && !unresolvedBlockers && !assessmentLow && !catchUpBlocked) {
    primaryAction = "advance_student";
    reasons.push("Mastery is strong and no active blockers were detected.");
  } else {
    primaryAction = "maintain_level";
    reasons.push("Signals are mixed; maintain level while gathering more learning evidence.");
  }

  if (conflictSignals) {
    primaryAction = "assign_catch_up";
    reasons.push("Signals conflict; safest path is to prioritise catch-up before advancement.");
    blockers.push("Conflicting mastery and readiness signals.");
  }

  // Safety rail: never advance while blockers are active.
  if (primaryAction === "advance_student" && (catchUpBlocked || unresolvedBlockers || assessmentLow)) {
    primaryAction = "assign_catch_up";
    reasons.push("Advancement blocked by active catch-up, weak-area, or readiness blockers.");
  }

  evidence.push(`QLF baseline: ${qlfComplete ? "completed" : "not completed"}`);
  evidence.push(`Mastery summary: catch-up ${output.summary.needsCatchUpCount}, revision ${output.summary.needsRevisionCount}, average ${output.summary.averageScore}%`);
  evidence.push(`Weak-area signals: ${unresolvedWeakAreaCount}`);
  evidence.push(`Catch-up active/overdue: ${activeCatchUpCount}/${overdueCatchUpCount}`);
  evidence.push(`Assessment readiness: ${output.assessmentReadiness}`);
  evidence.push(`Exam readiness: ${output.examReadinessProfile.band}`);
  evidence.push(`Learning twin confidence: ${output.learningTwin.explanationDNA.confidenceBand}`);
  if (output.nextRecommendedActions[0]) evidence.push(`Academic next action: ${output.nextRecommendedActions[0]}`);

  if (output.examReadinessProfile.blockers.length > 0) {
    blockers.push(...output.examReadinessProfile.blockers.slice(0, 2));
  }
  if (output.unresolvedAcademicGaps.length > 0) {
    blockers.push(...output.unresolvedAcademicGaps.slice(0, 2));
  }

  if (coachHeartbeatSignals && coachHeartbeatSignals.totalCoachSignals > 0) {
    const topSubject = coachHeartbeatSignals.topSubjects[0]?.value;
    const topSkill = coachHeartbeatSignals.topSkillTopics[0]?.value;
    if (topSubject || topSkill) {
      reasons.push(
        `Coach support used recently in ${topSubject ?? "core topics"}${topSkill ? ` ${topSkill}` : ""}.`,
      );
    } else {
      reasons.push("Coach support used recently on active learning topics.");
    }

    if (coachHeartbeatSignals.stillStrugglingCount > 0) {
      reasons.push("Student still struggled after Coach support.");
    }

    if (coachHeartbeatSignals.needsCatchUpCount > 0 || coachHeartbeatSignals.repeatedWeakAreaCount > 0) {
      reasons.push("Repeated Coach signals suggest catch-up may help.");
    }

    if (coachHeartbeatSignals.needsDifferentExplanationStyleCount > 0) {
      reasons.push("Coach signals suggest a different explanation style may help.");
    }

    if (coachHeartbeatSignals.hasTutorEscalationSignal) {
      blockers.push("Coach signals indicate repeated need for tutor support.");
    }

    coachEvidence.push(`Coach signals (${coachHeartbeatSignals.windowDays}d): ${coachHeartbeatSignals.totalCoachSignals} total`);
    coachEvidence.push(`Coach still-struggling signals: ${coachHeartbeatSignals.stillStrugglingCount}`);
    coachEvidence.push(`Coach catch-up signals: ${coachHeartbeatSignals.needsCatchUpCount}`);
    coachEvidence.push(`Coach tutor-support signals: ${coachHeartbeatSignals.needsLiveTutorSupportCount}`);
  }

  const uniqueReasons = [...new Set(reasons)].slice(0, 5);
  const uniqueBlockers = [...new Set(blockers)].slice(0, 5);
  const uniqueEvidence = [...new Set([...coachEvidence, ...evidence])].slice(0, 8);

  let confidenceScore = 72;
  if (!qlfComplete) confidenceScore -= 24;
  if (assessmentLow) confidenceScore -= 12;
  if (catchUpBlocked) confidenceScore -= 18;
  if (unresolvedBlockers) confidenceScore -= 10;
  if (repeatedStruggleCount >= 2) confidenceScore -= 10;
  if (masteryStrong) confidenceScore += 12;
  if (conflictSignals) confidenceScore -= 8;

  const urgency = urgencyFromAction(primaryAction, {
    overdueCatchUpCount,
    unresolvedWeakAreaCount,
    repeatedStruggleCount,
  });
  const riskLevel = riskFromSignals({
    overdueCatchUpCount,
    unresolvedWeakAreaCount,
    repeatedStruggleCount,
    qlfComplete,
    masteryStrong,
  });

  return {
    primaryAction,
    confidenceScore: clampScore(confidenceScore),
    urgency,
    reasons: uniqueReasons,
    blockers: uniqueBlockers,
    evidence: uniqueEvidence,
    actorRequired: actorForAction(primaryAction),
    suggestedNextStep: suggestedStep(primaryAction, output.nextRecommendedActions[0] ?? "Continue guided practice and monitor progress."),
    riskLevel,
  };
}
