import { buildCoachWordHelpResponse } from "@/lib/coachDictionary";

export type RecoveryTriggerType =
  | "assessment_failure"
  | "repeated_hints"
  | "low_confidence_trend"
  | "stalled_progression";

export type RecoveryTriggerSeverity = "low" | "medium" | "high";

export type RecoveryTrigger = {
  type: RecoveryTriggerType;
  severity: RecoveryTriggerSeverity;
  reason: string;
};

export type RecoveryPolicyRules = {
  minAssessmentAccuracyPct: number;
  repeatedHintThreshold: number;
  lowConfidenceThreshold: number;
  stalledDaysThreshold: number;
  maxInterventionMinutesPerWeek: number;
  cooldownHours: number;
};

export type RecoveryTenantPolicy = {
  teacherApprovalRoles: Array<"teacher" | "admin" | "owner">;
  guardrails: Partial<RecoveryPolicyRules>;
};

export type RecoverySignals = {
  baselineAccuracyPct?: number | null;
  hintCount?: number | null;
  confidenceScore?: number | null;
  stalledDays?: number | null;
};

export type RecoveryPlannerInput = {
  schoolId: string;
  studentId?: string | null;
  targetConcept: string;
  subject?: string | null;
  keyStage?: string | null;
  yearGroup?: string | null;
  nowIso?: string;
  currentInterventionMinutesWeek?: number | null;
  lastInterventionAtIso?: string | null;
  supportLevel?: number | null;
  signals?: RecoverySignals;
  rules?: Partial<RecoveryPolicyRules>;
  tenantPolicy?: RecoveryTenantPolicy;
};

export type PlannedRecoveryActionType =
  | "create_recovery_lesson"
  | "schedule_revision"
  | "adjust_difficulty_band"
  | "update_weak_area_engine"
  | "notify_teacher_dashboard"
  | "notify_parent_insight";

export type PlannedRecoveryAction = {
  id: string;
  type: PlannedRecoveryActionType;
  title: string;
  description: string;
  etaMinutes: number;
  rollbackInstruction: string;
};

export type RecoveryPlanStatus = "planned" | "teacher_approved" | "approved" | "rejected" | "rolled_back";

export type RecoveryPlanApprovalState = {
  teacherApproval: {
    approved: boolean;
    approvedAtIso: string | null;
    approverUserId: string | null;
    approverSchoolTeacherId: string | null;
    note: string | null;
  };
  adminApproval: {
    approved: boolean;
    approvedAtIso: string | null;
    approverUserId: string | null;
    note: string | null;
  };
};

export type RecoveryPlanExecutionState = {
  executed: boolean;
  executedAtIso: string | null;
  startedAtIso: string | null;
  attempts: number;
  durationMs: number | null;
  progressPercent: number;
  partialExecution: boolean;
  lastExecutionError: string | null;
  failureClassification: RecoveryFailureClassification | null;
  executionEffects: {
    createdContentId: string | null;
    assignmentId: string | null;
    weakAreaId: string | null;
    previousWeakAreaDifficulty: number | null;
    previousWeakAreaMetadataJson: string | null;
    revisionScheduled: boolean;
  };
};

export type RecoveryFailureCategory =
  | "assignment_failure"
  | "weak_area_failure"
  | "content_generation_failure"
  | "permission_failure"
  | "guardrail_failure"
  | "unknown_failure";

export type RecoveryFailureSeverity = "low" | "medium" | "high" | "critical";

export type RecoveryFailureClassification = {
  category: RecoveryFailureCategory;
  severity: RecoveryFailureSeverity;
  retryRecommended: boolean;
  operatorGuidance: string;
};

export type RecoveryOrchestrationPlan = {
  runId: string;
  schoolId: string;
  studentId: string | null;
  targetConcept: string;
  createdAtIso: string;
  status: RecoveryPlanStatus;
  triggers: RecoveryTrigger[];
  blockedReasons: string[];
  warnings: string[];
  guardrailsPassed: boolean;
  estimatedComplexity: "low" | "medium" | "high";
  estimatedInterventionMinutes: number;
  recoveryPath: string[];
  actions: PlannedRecoveryAction[];
  rollbackPlan: Array<{ actionId: string; instruction: string }>;
  approval: RecoveryPlanApprovalState;
  execution: RecoveryPlanExecutionState;
  explainability: {
    summary: string;
    evidence: string[];
  };
  policySnapshot: RecoveryTenantPolicy;
};

export type OrchestrationDecisionType = "teacher_approve" | "admin_confirm" | "approve" | "reject" | "rollback";

export type OrchestrationDecisionInput = {
  decision: OrchestrationDecisionType;
  actorUserId?: string | null;
  actorSchoolTeacherId?: string | null;
  note?: string | null;
  nowIso?: string | null;
};

export type OrchestrationDecisionResult = {
  previousStatus: RecoveryPlanStatus;
  status: RecoveryPlanStatus;
  decision: OrchestrationDecisionType;
  changed: boolean;
  reason: string;
  rollbackExecuted: boolean;
};

const DEFAULT_POLICY_RULES: RecoveryPolicyRules = {
  minAssessmentAccuracyPct: 65,
  repeatedHintThreshold: 3,
  lowConfidenceThreshold: 0.42,
  stalledDaysThreshold: 7,
  maxInterventionMinutesPerWeek: 60,
  cooldownHours: 24,
};

export const DEFAULT_TENANT_POLICY: RecoveryTenantPolicy = {
  teacherApprovalRoles: ["teacher", "admin", "owner"],
  guardrails: {},
};

const FAILURE_CLASSIFICATION_GUIDANCE: Record<RecoveryFailureCategory, { severity: RecoveryFailureSeverity; retryRecommended: boolean; operatorGuidance: string }> = {
  assignment_failure: {
    severity: "high",
    retryRecommended: true,
    operatorGuidance: "Check assignment service health and student eligibility, then retry execution.",
  },
  weak_area_failure: {
    severity: "medium",
    retryRecommended: true,
    operatorGuidance: "Verify weak-area record integrity for the learner and retry after correcting data issues.",
  },
  content_generation_failure: {
    severity: "high",
    retryRecommended: true,
    operatorGuidance: "Confirm AI content generation dependencies and moderation state, then retry.",
  },
  permission_failure: {
    severity: "critical",
    retryRecommended: false,
    operatorGuidance: "Review role/permission policy and actor scope before attempting execution again.",
  },
  guardrail_failure: {
    severity: "medium",
    retryRecommended: false,
    operatorGuidance: "Adjust intervention load/cooldown policy or wait for guardrails to clear before confirming.",
  },
  unknown_failure: {
    severity: "medium",
    retryRecommended: true,
    operatorGuidance: "Inspect run evidence and logs, then retry if no hard policy blocks remain.",
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function detectFailureCategory(message: string): RecoveryFailureCategory {
  const normalized = message.toLowerCase();
  if (normalized.includes("guardrail") || normalized.includes("cooldown") || normalized.includes("weekly cap")) return "guardrail_failure";
  if (normalized.includes("permission") || normalized.includes("forbidden") || normalized.includes("unauthor") || normalized.includes("not allowed")) return "permission_failure";
  if (normalized.includes("assign") || normalized.includes("assignment")) return "assignment_failure";
  if (normalized.includes("weak area") || normalized.includes("weak-area") || normalized.includes("weakarea")) return "weak_area_failure";
  if (normalized.includes("content") || normalized.includes("aicontent") || normalized.includes("generation")) return "content_generation_failure";
  return "unknown_failure";
}

export function classifyRecoveryFailure(message: string): RecoveryFailureClassification {
  const category = detectFailureCategory(message);
  const guidance = FAILURE_CLASSIFICATION_GUIDANCE[category];
  return {
    category,
    severity: guidance.severity,
    retryRecommended: guidance.retryRecommended,
    operatorGuidance: guidance.operatorGuidance,
  };
}

function toNowIso(value?: string): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function normalizeConcept(value: string): string {
  return String(value ?? "").trim();
}

function minutesUntilCooldownClear(nowIso: string, lastInterventionAtIso: string, cooldownHours: number): number {
  const now = new Date(nowIso).getTime();
  const last = new Date(lastInterventionAtIso).getTime();
  if (Number.isNaN(now) || Number.isNaN(last)) return 0;
  const cooldownMs = cooldownHours * 60 * 60 * 1000;
  const remaining = last + cooldownMs - now;
  return remaining > 0 ? Math.ceil(remaining / 60000) : 0;
}

export function resolvePolicyRules(rules?: Partial<RecoveryPolicyRules>): RecoveryPolicyRules {
  return {
    minAssessmentAccuracyPct: clamp(Math.floor(rules?.minAssessmentAccuracyPct ?? DEFAULT_POLICY_RULES.minAssessmentAccuracyPct), 10, 95),
    repeatedHintThreshold: clamp(Math.floor(rules?.repeatedHintThreshold ?? DEFAULT_POLICY_RULES.repeatedHintThreshold), 1, 20),
    lowConfidenceThreshold: clamp(Number(rules?.lowConfidenceThreshold ?? DEFAULT_POLICY_RULES.lowConfidenceThreshold), 0.05, 0.95),
    stalledDaysThreshold: clamp(Math.floor(rules?.stalledDaysThreshold ?? DEFAULT_POLICY_RULES.stalledDaysThreshold), 1, 60),
    maxInterventionMinutesPerWeek: clamp(Math.floor(rules?.maxInterventionMinutesPerWeek ?? DEFAULT_POLICY_RULES.maxInterventionMinutesPerWeek), 10, 240),
    cooldownHours: clamp(Math.floor(rules?.cooldownHours ?? DEFAULT_POLICY_RULES.cooldownHours), 1, 168),
  };
}

export function detectRecoveryTriggers(signals: RecoverySignals | undefined, rules: RecoveryPolicyRules): RecoveryTrigger[] {
  const triggers: RecoveryTrigger[] = [];

  if (typeof signals?.baselineAccuracyPct === "number" && signals.baselineAccuracyPct < rules.minAssessmentAccuracyPct) {
    triggers.push({
      type: "assessment_failure",
      severity: signals.baselineAccuracyPct < rules.minAssessmentAccuracyPct - 20 ? "high" : "medium",
      reason: `Assessment accuracy ${Math.round(signals.baselineAccuracyPct)}% is below threshold ${rules.minAssessmentAccuracyPct}%.`,
    });
  }

  if (typeof signals?.hintCount === "number" && signals.hintCount >= rules.repeatedHintThreshold) {
    triggers.push({
      type: "repeated_hints",
      severity: signals.hintCount >= rules.repeatedHintThreshold + 2 ? "high" : "medium",
      reason: `Hint usage ${Math.round(signals.hintCount)} reached threshold ${rules.repeatedHintThreshold}.`,
    });
  }

  if (typeof signals?.confidenceScore === "number" && signals.confidenceScore <= rules.lowConfidenceThreshold) {
    triggers.push({
      type: "low_confidence_trend",
      severity: signals.confidenceScore <= rules.lowConfidenceThreshold / 2 ? "high" : "medium",
      reason: `Confidence score ${signals.confidenceScore.toFixed(2)} is below threshold ${rules.lowConfidenceThreshold.toFixed(2)}.`,
    });
  }

  if (typeof signals?.stalledDays === "number" && signals.stalledDays >= rules.stalledDaysThreshold) {
    triggers.push({
      type: "stalled_progression",
      severity: signals.stalledDays >= rules.stalledDaysThreshold * 2 ? "high" : "low",
      reason: `Progression stalled for ${Math.round(signals.stalledDays)} days (threshold ${rules.stalledDaysThreshold}).`,
    });
  }

  return triggers;
}

export function evaluateRecoveryGuardrails(input: {
  nowIso: string;
  lastInterventionAtIso?: string | null;
  currentInterventionMinutesWeek: number;
  estimatedInterventionMinutes: number;
  rules: RecoveryPolicyRules;
}): { blockedReasons: string[]; warnings: string[]; guardrailsPassed: boolean } {
  const blockedReasons: string[] = [];
  const warnings: string[] = [];

  const weeklyProjected = input.currentInterventionMinutesWeek + input.estimatedInterventionMinutes;
  if (weeklyProjected > input.rules.maxInterventionMinutesPerWeek) {
    blockedReasons.push(
      `Projected intervention load ${weeklyProjected}m exceeds weekly cap ${input.rules.maxInterventionMinutesPerWeek}m.`,
    );
  }

  if (input.lastInterventionAtIso) {
    const cooldownRemaining = minutesUntilCooldownClear(input.nowIso, input.lastInterventionAtIso, input.rules.cooldownHours);
    if (cooldownRemaining > 0) {
      blockedReasons.push(`Cooldown active. Next orchestration allowed in ${cooldownRemaining} minutes.`);
    }
  }

  if (input.estimatedInterventionMinutes >= Math.floor(input.rules.maxInterventionMinutesPerWeek * 0.6)) {
    warnings.push("Intervention estimate is high for a single orchestration. Teacher review is recommended.");
  }

  return {
    blockedReasons,
    warnings,
    guardrailsPassed: blockedReasons.length === 0,
  };
}

function makeActions(targetConcept: string, path: string[], estimatedMinutes: number): PlannedRecoveryAction[] {
  const normalizedTarget = normalizeConcept(targetConcept);
  const supportConcept = path[0] ?? normalizedTarget;
  const pacingMinutes = Math.max(5, Math.round(estimatedMinutes * 0.35));

  return [
    {
      id: "action-create-recovery-lesson",
      type: "create_recovery_lesson",
      title: "Create recovery lesson",
      description: `Generate a focused lesson starting from ${supportConcept} and bridging to ${normalizedTarget}.`,
      etaMinutes: pacingMinutes,
      rollbackInstruction: "Archive generated recovery lesson and revert assignment status.",
    },
    {
      id: "action-schedule-revision",
      type: "schedule_revision",
      title: "Schedule revision timing",
      description: "Schedule two revision checkpoints for spaced recall recovery.",
      etaMinutes: 3,
      rollbackInstruction: "Remove scheduled revision checkpoints from learner timeline.",
    },
    {
      id: "action-adjust-difficulty",
      type: "adjust_difficulty_band",
      title: "Adjust lesson difficulty",
      description: "Temporarily lower difficulty band until prerequisite confidence recovers.",
      etaMinutes: 2,
      rollbackInstruction: "Restore previous learner difficulty band.",
    },
    {
      id: "action-update-weak-area",
      type: "update_weak_area_engine",
      title: "Update weak-area engine",
      description: "Write concept signals so future attempts include targeted support hints.",
      etaMinutes: 1,
      rollbackInstruction: "Revert weak-area signal update for this orchestration run.",
    },
    {
      id: "action-notify-teacher",
      type: "notify_teacher_dashboard",
      title: "Notify teacher dashboard",
      description: "Create teacher-facing intervention card with evidence and next actions.",
      etaMinutes: 1,
      rollbackInstruction: "Dismiss teacher intervention card created by this run.",
    },
    {
      id: "action-notify-parent",
      type: "notify_parent_insight",
      title: "Update parent insight layer",
      description: "Prepare parent-safe insight summary explaining the recovery focus.",
      etaMinutes: 1,
      rollbackInstruction: "Withdraw this run from parent insight queue.",
    },
  ];
}

function buildExplainability(targetConcept: string, triggers: RecoveryTrigger[], path: string[], complexity: "low" | "medium" | "high"): {
  summary: string;
  evidence: string[];
} {
  const summary = path.length > 1
    ? `${targetConcept} is blocked by prerequisite weakness in ${path.slice(0, -1).join(" -> ")}.`
    : `${targetConcept} needs focused revision with direct support.`;

  const evidence = [
    ...triggers.map((trigger) => `${trigger.type}: ${trigger.reason}`),
    `recovery_path: ${path.join(" -> ") || targetConcept}`,
    `estimated_complexity: ${complexity}`,
  ];

  return { summary, evidence };
}

export function buildRecoveryActionPlan(input: {
  runId: string;
  schoolId: string;
  studentId?: string | null;
  targetConcept: string;
  createdAtIso: string;
  triggers: RecoveryTrigger[];
  estimatedComplexity: "low" | "medium" | "high";
  estimatedInterventionMinutes: number;
  recoveryPath: string[];
  blockedReasons: string[];
  warnings: string[];
  guardrailsPassed: boolean;
  policySnapshot?: RecoveryTenantPolicy;
}): RecoveryOrchestrationPlan {
  const actions = makeActions(input.targetConcept, input.recoveryPath, input.estimatedInterventionMinutes);
  const rollbackPlan = actions.map((action) => ({ actionId: action.id, instruction: action.rollbackInstruction }));
  const explainability = buildExplainability(input.targetConcept, input.triggers, input.recoveryPath, input.estimatedComplexity);

  return {
    runId: input.runId,
    schoolId: input.schoolId,
    studentId: input.studentId ?? null,
    targetConcept: input.targetConcept,
    createdAtIso: input.createdAtIso,
    status: "planned",
    triggers: input.triggers,
    blockedReasons: input.blockedReasons,
    warnings: input.warnings,
    guardrailsPassed: input.guardrailsPassed,
    estimatedComplexity: input.estimatedComplexity,
    estimatedInterventionMinutes: input.estimatedInterventionMinutes,
    recoveryPath: input.recoveryPath,
    actions,
    rollbackPlan,
    approval: {
      teacherApproval: {
        approved: false,
        approvedAtIso: null,
        approverUserId: null,
        approverSchoolTeacherId: null,
        note: null,
      },
      adminApproval: {
        approved: false,
        approvedAtIso: null,
        approverUserId: null,
        note: null,
      },
    },
    execution: {
      executed: false,
      executedAtIso: null,
      startedAtIso: null,
      attempts: 0,
      durationMs: null,
      progressPercent: 0,
      partialExecution: false,
      lastExecutionError: null,
      failureClassification: null,
      executionEffects: {
        createdContentId: null,
        assignmentId: null,
        weakAreaId: null,
        previousWeakAreaDifficulty: null,
        previousWeakAreaMetadataJson: null,
        revisionScheduled: false,
      },
    },
    explainability,
    policySnapshot: input.policySnapshot ?? DEFAULT_TENANT_POLICY,
  };
}

export async function planAdaptiveRecovery(input: RecoveryPlannerInput): Promise<RecoveryOrchestrationPlan> {
  const resolvedTenantPolicy = input.tenantPolicy ?? DEFAULT_TENANT_POLICY;
  const rules = resolvePolicyRules({
    ...resolvedTenantPolicy.guardrails,
    ...input.rules,
  });
  const nowIso = toNowIso(input.nowIso);
  const targetConcept = normalizeConcept(input.targetConcept);
  if (!targetConcept) {
    throw new Error("Target concept is required for orchestration.");
  }

  const coach = await buildCoachWordHelpResponse({
    word: targetConcept,
    subject: input.subject,
    keyStage: input.keyStage,
    yearGroup: input.yearGroup,
    supportLevel: input.supportLevel ?? 2,
  });

  const triggers = detectRecoveryTriggers(input.signals, rules);
  const estimatedInterventionMinutes = coach.recoveryPlan.estimatedInterventionMinutes;
  const guardrails = evaluateRecoveryGuardrails({
    nowIso,
    lastInterventionAtIso: input.lastInterventionAtIso,
    currentInterventionMinutesWeek: Math.max(0, Math.floor(input.currentInterventionMinutesWeek ?? 0)),
    estimatedInterventionMinutes,
    rules,
  });

  return buildRecoveryActionPlan({
    runId: `aro-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    schoolId: input.schoolId,
    studentId: input.studentId ?? null,
    targetConcept,
    createdAtIso: nowIso,
    triggers,
    estimatedComplexity: coach.recoveryPlan.estimatedComplexity,
    estimatedInterventionMinutes,
    recoveryPath: coach.recoveryPlan.shortestRecoveryPath.length ? coach.recoveryPlan.shortestRecoveryPath : [targetConcept],
    blockedReasons: guardrails.blockedReasons,
    warnings: guardrails.warnings,
    guardrailsPassed: guardrails.guardrailsPassed,
    policySnapshot: resolvedTenantPolicy,
  });
}

export function applyOrchestrationDecision(
  plan: RecoveryOrchestrationPlan,
  input: OrchestrationDecisionInput,
): { plan: RecoveryOrchestrationPlan; result: OrchestrationDecisionResult } {
  const previousStatus = plan.status;
  let nextStatus = previousStatus;
  const nowIso = input.nowIso ? new Date(input.nowIso).toISOString() : new Date().toISOString();
  const approval = {
    teacherApproval: { ...plan.approval.teacherApproval },
    adminApproval: { ...plan.approval.adminApproval },
  };
  let changed = false;
  let reason = "No status transition applied.";
  let rollbackExecuted = false;
  const execution = { ...plan.execution };

  if (input.decision === "teacher_approve") {
    if (previousStatus === "planned") {
      nextStatus = "teacher_approved";
      changed = true;
      approval.teacherApproval.approved = true;
      approval.teacherApproval.approvedAtIso = nowIso;
      approval.teacherApproval.approverUserId = input.actorUserId ?? null;
      approval.teacherApproval.approverSchoolTeacherId = input.actorSchoolTeacherId ?? null;
      approval.teacherApproval.note = input.note ?? null;
      reason = "Plan approved by teacher reviewer and queued for admin confirmation.";
    } else {
      reason = `Teacher approval is only allowed from planned status. Current status is ${previousStatus}.`;
    }
  }

  if (input.decision === "approve" || input.decision === "admin_confirm") {
    if (previousStatus === "teacher_approved" && plan.guardrailsPassed && plan.approval.teacherApproval.approved) {
      nextStatus = "approved";
      changed = true;
      approval.adminApproval.approved = true;
      approval.adminApproval.approvedAtIso = nowIso;
      approval.adminApproval.approverUserId = input.actorUserId ?? null;
      approval.adminApproval.note = input.note ?? null;
      reason = "Plan confirmed by admin and ready for execution.";
    } else if (!plan.approval.teacherApproval.approved) {
      reason = "Admin confirmation requires prior teacher approval.";
    } else if (!plan.guardrailsPassed) {
      reason = "Plan cannot be confirmed because one or more guardrails are blocking execution.";
      execution.lastExecutionError = reason;
      execution.failureClassification = classifyRecoveryFailure(reason);
    } else {
      reason = `Plan is already ${previousStatus}.`;
    }
  }

  if (input.decision === "reject") {
    if (previousStatus === "planned" || previousStatus === "teacher_approved") {
      nextStatus = "rejected";
      changed = true;
      reason = "Plan rejected by reviewer.";
    } else {
      reason = `Only planned runs can be rejected. Current status is ${previousStatus}.`;
    }
  }

  if (input.decision === "rollback") {
    if (previousStatus === "approved") {
      nextStatus = "rolled_back";
      changed = true;
      rollbackExecuted = true;
      reason = "Approved orchestration has been rolled back.";
    } else {
      reason = `Rollback requires approved status. Current status is ${previousStatus}.`;
    }
  }

  return {
    plan: {
      ...plan,
      status: nextStatus,
      approval,
      execution,
    },
    result: {
      previousStatus,
      status: nextStatus,
      decision: input.decision,
      changed,
      reason,
      rollbackExecuted,
    },
  };
}