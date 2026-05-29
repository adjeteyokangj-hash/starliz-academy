import type { HeartbeatDecision, HeartbeatPrimaryAction } from "@/lib/academic-intelligence/types";

export type HeartbeatActionButton = {
  action: HeartbeatPrimaryAction;
  label: string;
  href: string;
};

export type HeartbeatDecisionViewModel = {
  action: string;
  urgency: string;
  riskLevel: string;
  confidence: string;
  actorRequired: string;
  suggestedNextStep: string;
  reasonsSummary: string;
  blockersSummary: string;
};

export function mapHeartbeatActionButton(input: {
  action: HeartbeatPrimaryAction;
  studentId: string;
  parentId?: string | null;
}): HeartbeatActionButton {
  const { action, studentId, parentId } = input;

  if (action === "review_placement") {
    return { action, label: "Review placement / Quick Level Finder", href: `/admin/students/${encodeURIComponent(studentId)}` };
  }
  if (action === "assign_catch_up") {
    return { action, label: "Open catch-up tasks / assignments", href: `/admin/assignments?studentId=${encodeURIComponent(studentId)}&context=catch_up` };
  }
  if (action === "generate_revision") {
    return { action, label: "Generate revision", href: `/admin/knowledge-graph?mode=academic_intelligence&studentId=${encodeURIComponent(studentId)}&tab=recommendations` };
  }
  if (action === "generate_assessment") {
    return { action, label: "Open assessment readiness", href: `/admin/knowledge-graph?mode=academic_intelligence&studentId=${encodeURIComponent(studentId)}&tab=recommendations` };
  }
  if (action === "trigger_tutor_intervention") {
    return { action, label: "Start tutor intervention", href: `/admin/students/${encodeURIComponent(studentId)}#weak-areas` };
  }
  if (action === "trigger_parent_alert") {
    return {
      action,
      label: "Contact parent / parent report",
      href: parentId ? `/admin/parents/${encodeURIComponent(parentId)}` : `/admin/reports?studentId=${encodeURIComponent(studentId)}&audience=parent`,
    };
  }
  if (action === "advance_student") {
    return { action, label: "Open subject progression", href: `/admin/students/${encodeURIComponent(studentId)}#subject-progression` };
  }

  if (action === "schedule_homework") {
    return { action, label: "Open catch-up tasks / assignments", href: `/admin/assignments?studentId=${encodeURIComponent(studentId)}&context=homework` };
  }
  if (action === "recommend_exam_preparation") {
    return { action, label: "Open assessment readiness", href: `/admin/knowledge-graph?mode=academic_intelligence&studentId=${encodeURIComponent(studentId)}&tab=recommendations` };
  }

  return { action, label: "Open subject progression", href: `/admin/students/${encodeURIComponent(studentId)}#subject-progression` };
}

export function toHeartbeatDecisionViewModel(decision: HeartbeatDecision | null | undefined): HeartbeatDecisionViewModel {
  if (!decision) {
    return {
      action: "not available",
      urgency: "-",
      riskLevel: "-",
      confidence: "-",
      actorRequired: "-",
      suggestedNextStep: "Run Academic Intelligence to compute the next best action.",
      reasonsSummary: "No decision reasons available yet.",
      blockersSummary: "No blockers available yet.",
    };
  }

  return {
    action: decision.primaryAction,
    urgency: decision.urgency,
    riskLevel: decision.riskLevel,
    confidence: `${decision.confidenceScore}%`,
    actorRequired: decision.actorRequired,
    suggestedNextStep: decision.suggestedNextStep,
    reasonsSummary: decision.reasons.slice(0, 2).join(" | ") || "-",
    blockersSummary: decision.blockers.slice(0, 2).join(" | ") || "None",
  };
}
