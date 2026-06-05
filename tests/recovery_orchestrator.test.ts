import assert from "node:assert/strict";
import test from "node:test";
import {
  applyOrchestrationDecision,
  buildRecoveryActionPlan,
  classifyRecoveryFailure,
  detectRecoveryTriggers,
  evaluateRecoveryGuardrails,
  resolvePolicyRules,
} from "../src/lib/recovery_orchestrator";
import { resolveRecoveryCurriculumTarget } from "../src/lib/recovery_orchestrator_runtime";

test("detectRecoveryTriggers emits expected trigger types", () => {
  const rules = resolvePolicyRules();
  const triggers = detectRecoveryTriggers(
    {
      baselineAccuracyPct: 42,
      hintCount: 4,
      confidenceScore: 0.31,
      stalledDays: 11,
    },
    rules,
  );

  const types = new Set(triggers.map((item) => item.type));
  assert.equal(types.has("assessment_failure"), true);
  assert.equal(types.has("repeated_hints"), true);
  assert.equal(types.has("low_confidence_trend"), true);
  assert.equal(types.has("stalled_progression"), true);
});

test("evaluateRecoveryGuardrails blocks excessive weekly load", () => {
  const rules = resolvePolicyRules({ maxInterventionMinutesPerWeek: 45 });
  const guardrails = evaluateRecoveryGuardrails({
    nowIso: "2026-05-22T12:00:00.000Z",
    currentInterventionMinutesWeek: 36,
    estimatedInterventionMinutes: 14,
    rules,
  });

  assert.equal(guardrails.guardrailsPassed, false);
  assert.equal(guardrails.blockedReasons.length, 1);
  assert.match(guardrails.blockedReasons[0], /exceeds weekly cap/i);
});

test("evaluateRecoveryGuardrails blocks when cooldown has not cleared", () => {
  const rules = resolvePolicyRules({ cooldownHours: 24 });
  const guardrails = evaluateRecoveryGuardrails({
    nowIso: "2026-05-22T12:00:00.000Z",
    lastInterventionAtIso: "2026-05-22T06:30:00.000Z",
    currentInterventionMinutesWeek: 10,
    estimatedInterventionMinutes: 10,
    rules,
  });

  assert.equal(guardrails.guardrailsPassed, false);
  assert.equal(guardrails.blockedReasons.some((entry) => /Cooldown active/i.test(entry)), true);
});

test("applyOrchestrationDecision blocks admin confirmation when teacher approval is missing", () => {
  const plan = buildRecoveryActionPlan({
    runId: "aro-test-1",
    schoolId: "school-1",
    targetConcept: "equivalent fraction",
    createdAtIso: "2026-05-22T12:00:00.000Z",
    triggers: [],
    estimatedComplexity: "medium",
    estimatedInterventionMinutes: 18,
    recoveryPath: ["fraction", "equivalent fraction"],
    blockedReasons: ["Projected intervention load exceeds cap."],
    warnings: [],
    guardrailsPassed: false,
  });

  const result = applyOrchestrationDecision(plan, { decision: "admin_confirm" });
  assert.equal(result.plan.status, "planned");
  assert.equal(result.result.changed, false);
  assert.match(result.result.reason, /requires prior teacher approval/i);
});

test("applyOrchestrationDecision supports teacher approve then admin confirm then rollback", () => {
  const plan = buildRecoveryActionPlan({
    runId: "aro-test-2",
    schoolId: "school-1",
    targetConcept: "equivalent fraction",
    createdAtIso: "2026-05-22T12:00:00.000Z",
    triggers: [],
    estimatedComplexity: "medium",
    estimatedInterventionMinutes: 18,
    recoveryPath: ["fraction", "equivalent fraction"],
    blockedReasons: [],
    warnings: [],
    guardrailsPassed: true,
  });

  const teacherApproved = applyOrchestrationDecision(plan, { decision: "teacher_approve", actorUserId: "teacher-1", actorSchoolTeacherId: "st-1" });
  assert.equal(teacherApproved.plan.status, "teacher_approved");
  assert.equal(teacherApproved.result.changed, true);
  assert.equal(teacherApproved.plan.approval.teacherApproval.approved, true);

  const approved = applyOrchestrationDecision(teacherApproved.plan, { decision: "admin_confirm", actorUserId: "admin-1" });
  assert.equal(approved.plan.status, "approved");
  assert.equal(approved.result.changed, true);
  assert.equal(approved.plan.approval.adminApproval.approved, true);

  const rolledBack = applyOrchestrationDecision(approved.plan, { decision: "rollback", actorUserId: "admin-1" });
  assert.equal(rolledBack.plan.status, "rolled_back");
  assert.equal(rolledBack.result.changed, true);
  assert.equal(rolledBack.result.rollbackExecuted, true);
});

test("rollback instructions are generated for every planned action", () => {
  const plan = buildRecoveryActionPlan({
    runId: "aro-test-3",
    schoolId: "school-1",
    targetConcept: "equivalent fraction",
    createdAtIso: "2026-05-22T12:00:00.000Z",
    triggers: [],
    estimatedComplexity: "low",
    estimatedInterventionMinutes: 10,
    recoveryPath: ["equivalent fraction"],
    blockedReasons: [],
    warnings: [],
    guardrailsPassed: true,
  });

  assert.equal(plan.actions.length > 0, true);
  assert.equal(plan.rollbackPlan.length, plan.actions.length);
});

test("classifyRecoveryFailure maps known categories with retry guidance", () => {
  const assignmentFailure = classifyRecoveryFailure("Assignment write failed for student.");
  assert.equal(assignmentFailure.category, "assignment_failure");
  assert.equal(assignmentFailure.retryRecommended, true);

  const permissionFailure = classifyRecoveryFailure("User forbidden by permission policy.");
  assert.equal(permissionFailure.category, "permission_failure");
  assert.equal(permissionFailure.retryRecommended, false);

  const guardrailFailure = classifyRecoveryFailure("Guardrail blocked due to cooldown active.");
  assert.equal(guardrailFailure.category, "guardrail_failure");
  assert.equal(guardrailFailure.severity, "medium");
});

test("admin confirm guardrail block persists failure classification", () => {
  const plan = buildRecoveryActionPlan({
    runId: "aro-test-4",
    schoolId: "school-1",
    targetConcept: "equivalent fraction",
    createdAtIso: "2026-05-22T12:00:00.000Z",
    triggers: [],
    estimatedComplexity: "medium",
    estimatedInterventionMinutes: 20,
    recoveryPath: ["fraction", "equivalent fraction"],
    blockedReasons: ["Cooldown active"],
    warnings: [],
    guardrailsPassed: false,
  });

  const teacherApproved = applyOrchestrationDecision(plan, {
    decision: "teacher_approve",
    actorUserId: "teacher-1",
    actorSchoolTeacherId: "st-1",
  });
  const result = applyOrchestrationDecision(teacherApproved.plan, {
    decision: "admin_confirm",
    actorUserId: "admin-1",
  });

  assert.equal(result.result.changed, false);
  assert.equal(result.plan.execution.failureClassification?.category, "guardrail_failure");
});

test("recovery target uses Year 2 Grammar weakness for Year 4 student", () => {
  const target = resolveRecoveryCurriculumTarget({
    studentYearGroup: "Year 4",
    studentKeyStage: "KS2",
    weakAreaMetadata: {
      targetLearningYearGroup: "Year 2",
      strand: "grammar",
    },
  });

  assert.equal(target.yearGroup, "Year 2");
  assert.equal(target.keyStage, "KS1");
  assert.equal(target.studentYearGroup, "Year 4");
});

test("recovery target uses Year 3 Maths weakness for Year 6 student", () => {
  const target = resolveRecoveryCurriculumTarget({
    studentYearGroup: "Year 6",
    studentKeyStage: "KS2",
    weakAreaMetadata: {
      targetLearningYearGroup: "Year 3",
      subject: "maths",
    },
  });

  assert.equal(target.yearGroup, "Year 3");
  assert.equal(target.keyStage, "KS2");
  assert.equal(target.studentYearGroup, "Year 6");
});

test("recovery target falls back to student year when no evidence exists", () => {
  const target = resolveRecoveryCurriculumTarget({
    studentYearGroup: "Year 5",
    studentKeyStage: "KS2",
    weakAreaMetadata: {},
  });

  assert.equal(target.yearGroup, "Year 5");
  assert.equal(target.keyStage, "KS2");
});
