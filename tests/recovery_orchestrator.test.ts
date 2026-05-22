import assert from "node:assert/strict";
import test from "node:test";
import {
  applyOrchestrationDecision,
  buildRecoveryActionPlan,
  detectRecoveryTriggers,
  evaluateRecoveryGuardrails,
  resolvePolicyRules,
} from "../src/lib/recovery_orchestrator";

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