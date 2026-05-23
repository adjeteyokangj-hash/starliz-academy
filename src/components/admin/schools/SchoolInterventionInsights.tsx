"use client";

import { useState } from "react";
import { useDerivedSchoolMetrics, useSchoolDashboardRecord } from "@/components/admin/schools/school-dashboard-data";

type Props = {
  schoolId: string;
};

type RecoveryPlanStatus = "planned" | "teacher_approved" | "approved" | "rejected" | "rolled_back";

type RecoveryPlanView = {
  runId: string;
  status: RecoveryPlanStatus;
  targetConcept: string;
  triggers: Array<{ type: string; severity: "low" | "medium" | "high"; reason: string }>;
  blockedReasons: string[];
  warnings: string[];
  guardrailsPassed: boolean;
  estimatedComplexity: "low" | "medium" | "high";
  estimatedInterventionMinutes: number;
  recoveryPath: string[];
  actions: Array<{ id: string; title: string; description: string; etaMinutes: number }>;
  rollbackPlan: Array<{ actionId: string; instruction: string }>;
  approval: {
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
  execution: {
    executed: boolean;
    executedAtIso: string | null;
    executionEffects: {
      createdContentId: string | null;
      assignmentId: string | null;
      weakAreaId: string | null;
      revisionScheduled: boolean;
    };
  };
  explainability: { summary: string; evidence: string[] };
};

function interventionPriority(riskScore: number): "low" | "medium" | "high" {
  if (riskScore >= 70) return "high";
  if (riskScore >= 40) return "medium";
  return "low";
}

export default function SchoolInterventionInsights({ schoolId }: Props) {
  const { school, loading, error } = useSchoolDashboardRecord(schoolId);
  const metrics = useDerivedSchoolMetrics(school);
  const [targetConcept, setTargetConcept] = useState("equivalent fraction");
  const [studentId, setStudentId] = useState("");
  const [workflowNote, setWorkflowNote] = useState("");
  const [working, setWorking] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [plan, setPlan] = useState<RecoveryPlanView | null>(null);
  const [teacherApproverUserId, setTeacherApproverUserId] = useState("");

  if (loading) {
    return <div className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4 text-sm text-slate-300">Loading intervention intelligence...</div>;
  }

  if (error || !school) {
    return <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100">Unable to load intervention intelligence.</div>;
  }

  const openIncidents = school.safeguardingIncidents.filter((incident) => {
    const status = incident.status.toLowerCase();
    return status === "open" || status === "under_review" || status === "escalated";
  }).length;

  const highSeverityIncidents = school.safeguardingIncidents.filter((incident) => {
    const severity = incident.severity.toLowerCase();
    return severity === "critical" || severity === "high";
  }).length;

  const referenceTimestampMs = Math.max(
    ...school.students.map((student) => new Date(student.updatedAt).getTime()),
    ...school.activityTimeline.map((item) => new Date(item.createdAt).getTime()),
    ...school.safeguardingIncidents.map((incident) => new Date(incident.updatedAt).getTime()),
    0,
  );
  const staleCutoffMs = referenceTimestampMs - (1000 * 60 * 60 * 24 * 30);

  const staleStudentAssignments = school.students.filter((student) => {
    if (student.status !== "active") return false;
    return new Date(student.updatedAt).getTime() <= staleCutoffMs;
  }).length;

  const priority = interventionPriority(metrics.riskScore);

  async function callWorkflow(action: "plan" | "teacher_approve" | "admin_confirm" | "reject" | "rollback") {
    if (!targetConcept.trim() && action === "plan") {
      setWorkflowError("Target concept is required.");
      return;
    }

    if (!plan && action !== "plan") {
      setWorkflowError("Generate a plan before submitting approval decisions.");
      return;
    }

    setWorking(true);
    setWorkflowError(null);

    try {
      const body = action === "plan"
        ? {
            action,
            payload: {
              schoolId,
              studentId: studentId.trim() || null,
              targetConcept: targetConcept.trim(),
              currentInterventionMinutesWeek: metrics.interventionLoad * 8,
              signals: {
                baselineAccuracyPct: Math.max(0, Math.min(100, 100 - metrics.riskScore)),
                hintCount: Math.max(0, Math.round(metrics.interventionLoad / 2)),
                confidenceScore: Number(Math.max(0, Math.min(1, (100 - metrics.riskScore) / 100)).toFixed(2)),
                stalledDays: staleStudentAssignments > 0 ? 10 : 3,
              },
            },
          }
        : {
            action,
            payload: {
              plan,
              teacherApproverUserId: action === "teacher_approve" ? (teacherApproverUserId.trim() || null) : undefined,
              note: workflowNote.trim() || null,
            },
          };

      const response = await fetch("/api/admin/recovery-orchestrator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({ error: "Workflow request failed." }))) as { error?: string };
        throw new Error(payload.error ?? "Workflow request failed.");
      }

      const payload = (await response.json()) as { orchestration?: RecoveryPlanView; decision?: { reason?: string } | null };
      if (!payload.orchestration) {
        throw new Error("Recovery orchestration response was empty.");
      }
      setPlan(payload.orchestration);
      if (payload.decision?.reason) {
        setWorkflowNote(payload.decision.reason);
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Workflow request failed.";
      setWorkflowError(message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Intervention Load</p>
          <p className="mt-1 text-2xl font-black text-white">{metrics.interventionLoad}</p>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Open Incidents</p>
          <p className="mt-1 text-2xl font-black text-rose-200">{openIncidents}</p>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-400">High Severity Cases</p>
          <p className="mt-1 text-2xl font-black text-amber-200">{highSeverityIncidents}</p>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Priority</p>
          <p className="mt-1 text-2xl font-black text-cyan-200">{priority.toUpperCase()}</p>
        </article>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Intervention Triggers</h2>
          <ul className="mt-2 space-y-1 text-xs text-slate-300">
            <li>Students without classroom assignment: {metrics.studentsWithoutClassroom}</li>
            <li>Stale active student records (30d): {staleStudentAssignments}</li>
            <li>Critical safeguarding alerts: {school.safeguarding.criticalAlerts}</li>
          </ul>
        </article>

        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Recommended Immediate Actions</h2>
          <ul className="mt-2 space-y-1 text-xs text-slate-300">
            <li>Prioritise unresolved high-severity safeguarding incidents.</li>
            <li>Assign unplaced active students to classrooms before next cycle.</li>
            <li>Run targeted parent communication for flagged cohorts.</li>
          </ul>
        </article>
      </div>

      <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Adaptive Recovery Orchestrator</h2>
            <p className="mt-1 text-xs text-slate-300">
              Generate intervention plans, review guardrails, and run approval decisions with rollback support.
            </p>
          </div>
          <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-cyan-200">
            Teacher-supervised automation
          </span>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <label className="text-xs text-slate-300">
            Target Concept
            <input
              value={targetConcept}
              onChange={(event) => setTargetConcept(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
              placeholder="equivalent fraction"
            />
          </label>
          <label className="text-xs text-slate-300">
            Student Id (optional)
            <input
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
              placeholder="student_123"
            />
          </label>
          <label className="text-xs text-slate-300">
            Reviewer note
            <input
              value={workflowNote}
              onChange={(event) => setWorkflowNote(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
              placeholder="Approval rationale"
            />
          </label>
          <label className="text-xs text-slate-300 md:col-span-3">
            Teacher approver user id (optional override)
            <input
              value={teacherApproverUserId}
              onChange={(event) => setTeacherApproverUserId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
              placeholder="Uses current session when blank"
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={working}
            onClick={() => void callWorkflow("plan")}
            className="rounded-lg border border-cyan-500/50 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {working ? "Running..." : "Generate Plan"}
          </button>
          <button
            type="button"
            disabled={working || !plan || plan.status !== "planned"}
            onClick={() => void callWorkflow("teacher_approve")}
            className="rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-100 transition hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Teacher Approve
          </button>
          <button
            type="button"
            disabled={working || !plan || plan.status !== "teacher_approved"}
            onClick={() => void callWorkflow("admin_confirm")}
            className="rounded-lg border border-sky-500/50 bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-sky-100 transition hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Admin Confirm
          </button>
          <button
            type="button"
            disabled={working || !plan || (plan.status !== "planned" && plan.status !== "teacher_approved")}
            onClick={() => void callWorkflow("reject")}
            className="rounded-lg border border-amber-500/50 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reject
          </button>
          <button
            type="button"
            disabled={working || !plan || plan.status !== "approved"}
            onClick={() => void callWorkflow("rollback")}
            className="rounded-lg border border-rose-500/50 bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:border-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Rollback
          </button>
        </div>

        {workflowError ? (
          <p className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{workflowError}</p>
        ) : null}

        {plan ? (
          <div className="mt-4 space-y-3 text-xs text-slate-300">
            <div className="grid gap-2 md:grid-cols-4">
              <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-2">
                <p className="text-slate-400">Run</p>
                <p className="mt-1 font-semibold text-slate-100">{plan.runId}</p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-2">
                <p className="text-slate-400">Status</p>
                <p className="mt-1 font-semibold text-slate-100 uppercase">{plan.status}</p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-2">
                <p className="text-slate-400">Complexity</p>
                <p className="mt-1 font-semibold text-slate-100 uppercase">{plan.estimatedComplexity}</p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-2">
                <p className="text-slate-400">Minutes</p>
                <p className="mt-1 font-semibold text-slate-100">{plan.estimatedInterventionMinutes}</p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-2">
              <p className="font-semibold text-slate-100">Explainability</p>
              <p className="mt-1">{plan.explainability.summary}</p>
              <p className="mt-2 text-slate-400">Path: {plan.recoveryPath.join(" -> ")}</p>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-2">
                <p className="font-semibold text-slate-100">Triggers</p>
                <ul className="mt-1 space-y-1">
                  {plan.triggers.length ? plan.triggers.map((trigger) => (
                    <li key={`${trigger.type}-${trigger.reason}`}>{trigger.type} ({trigger.severity}): {trigger.reason}</li>
                  )) : <li>No triggers detected from current signals.</li>}
                </ul>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-2">
                <p className="font-semibold text-slate-100">Guardrails</p>
                <ul className="mt-1 space-y-1">
                  {plan.blockedReasons.length ? plan.blockedReasons.map((reason) => <li key={reason} className="text-rose-200">Blocked: {reason}</li>) : <li>No blocking guardrails.</li>}
                  {plan.warnings.map((warning) => <li key={warning} className="text-amber-200">Warning: {warning}</li>)}
                  <li className={plan.guardrailsPassed ? "text-emerald-200" : "text-rose-200"}>
                    Guardrails passed: {plan.guardrailsPassed ? "yes" : "no"}
                  </li>
                </ul>
              </div>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-2">
              <p className="font-semibold text-slate-100">Planned Actions</p>
              <ul className="mt-1 space-y-1">
                {plan.actions.map((action) => (
                  <li key={action.id}>{action.title} ({action.etaMinutes}m): {action.description}</li>
                ))}
              </ul>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-2">
                <p className="font-semibold text-slate-100">Approval Chain</p>
                <ul className="mt-1 space-y-1">
                  <li>Teacher approved: {plan.approval.teacherApproval.approved ? "yes" : "no"}</li>
                  <li>Teacher approver: {plan.approval.teacherApproval.approverUserId ?? "-"}</li>
                  <li>Admin confirmed: {plan.approval.adminApproval.approved ? "yes" : "no"}</li>
                  <li>Admin approver: {plan.approval.adminApproval.approverUserId ?? "-"}</li>
                </ul>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-2">
                <p className="font-semibold text-slate-100">Execution Replay</p>
                <ul className="mt-1 space-y-1">
                  <li>Executed: {plan.execution.executed ? "yes" : "no"}</li>
                  <li>Content id: {plan.execution.executionEffects.createdContentId ?? "-"}</li>
                  <li>Assignment id: {plan.execution.executionEffects.assignmentId ?? "-"}</li>
                  <li>Weak area id: {plan.execution.executionEffects.weakAreaId ?? "-"}</li>
                  <li>Revision scheduled: {plan.execution.executionEffects.revisionScheduled ? "yes" : "no"}</li>
                </ul>
              </div>
            </div>

            {plan.status === "rolled_back" ? (
              <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2">
                <p className="font-semibold text-rose-100">Rollback Instructions Executed</p>
                <ul className="mt-1 space-y-1 text-rose-50">
                  {plan.rollbackPlan.map((item) => (
                    <li key={item.actionId}>{item.instruction}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </article>
    </div>
  );
}
