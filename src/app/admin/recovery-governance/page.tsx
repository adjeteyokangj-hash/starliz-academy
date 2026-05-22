"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  startRecoveryGovernanceLiveBridge,
  type RecoveryGovernanceLiveEvent,
  type RecoveryGovernanceTransport,
} from "@/lib/recovery-governance-live-bridge";

type SchoolItem = {
  id: string;
  name: string;
  slug: string;
};

type RecoveryPolicy = {
  teacherApprovalRoles: Array<"teacher" | "admin" | "owner">;
  guardrails: {
    minAssessmentAccuracyPct?: number;
    repeatedHintThreshold?: number;
    lowConfidenceThreshold?: number;
    stalledDaysThreshold?: number;
    maxInterventionMinutesPerWeek?: number;
    cooldownHours?: number;
  };
};

type RecoveryFailureClassification = {
  category:
    | "assignment_failure"
    | "weak_area_failure"
    | "content_generation_failure"
    | "permission_failure"
    | "guardrail_failure"
    | "unknown_failure";
  severity: "low" | "medium" | "high" | "critical";
  retryRecommended: boolean;
  operatorGuidance: string;
};

type RecoveryHistoryRow = {
  runId: string;
  schoolId: string;
  action: string;
  createdAt: string;
  actorUserId: string | null;
  actorSchoolTeacherId: string | null;
  planStatus: string;
  note: string | null;
  plan: {
    runId: string;
    schoolId: string;
    status: string;
    createdAtIso: string;
    targetConcept: string;
    studentId: string | null;
    recoveryPath: string[];
    blockedReasons: string[];
    warnings: string[];
    rollbackPlan: Array<{ actionId: string; instruction: string }>;
    explainability: {
      summary: string;
      evidence: string[];
    };
    execution: {
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
  };
};

type RecoveryGovernanceMetrics = {
  totalRuns: number;
  approvalRate: number;
  rollbackRate: number;
  retryCount: number;
  averageExecutionDurationMs: number;
  guardrailBlockCount: number;
  partiallyExecutedRuns: number;
  mostActiveSchools: Array<{ schoolId: string; runCount: number }>;
};

type RecoveryTimelineEvent = {
  runId: string;
  schoolId: string;
  atIso: string;
  action: string;
  stage:
    | "plan_created"
    | "teacher_approved"
    | "admin_confirmed"
    | "execution_started"
    | "partial_failure"
    | "retry_executed"
    | "rollback_completed"
    | "guardrail_failed"
    | "unknown";
  actorUserId: string | null;
  actorSchoolTeacherId: string | null;
  note: string | null;
};

const STATUS_OPTIONS = ["", "planned", "teacher_approved", "approved", "rejected", "rolled_back"];

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return "-";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remSeconds = seconds % 60;
  return `${minutes}m ${remSeconds}s`;
}

export default function RecoveryGovernancePage() {
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [runId, setRunId] = useState("");
  const [status, setStatus] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [rows, setRows] = useState<RecoveryHistoryRow[]>([]);
  const [timeline, setTimeline] = useState<RecoveryTimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [limit] = useState(25);
  const [total, setTotal] = useState(0);
  const [metrics, setMetrics] = useState<RecoveryGovernanceMetrics | null>(null);
  const [policy, setPolicy] = useState<RecoveryPolicy>({
    teacherApprovalRoles: ["teacher", "admin", "owner"],
    guardrails: {},
  });
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [policyMessage, setPolicyMessage] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const [liveTransport, setLiveTransport] = useState<RecoveryGovernanceTransport | null>(null);
  const [liveEvents, setLiveEvents] = useState<RecoveryGovernanceLiveEvent[]>([]);
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<string | null>(null);
  const lastLiveSinceIsoRef = useRef<string>(new Date().toISOString());

  useEffect(() => {
    let active = true;
    async function loadSchools() {
      try {
        const response = await fetch("/api/admin/schools", { credentials: "include", cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { schools?: Array<{ id: string; name: string; slug: string }> };
        if (!active) return;
        const list = (payload.schools ?? []).map((item) => ({ id: item.id, name: item.name, slug: item.slug }));
        setSchools(list);
        if (!schoolId && list.length > 0) {
          setSchoolId(list[0].id);
        }
      } catch {
        if (active) setError("Unable to load school list.");
      }
    }

    void loadSchools();
    return () => {
      active = false;
    };
  }, [schoolId]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (schoolId) params.set("schoolId", schoolId);
    if (runId.trim()) params.set("runId", runId.trim());
    if (status) params.set("status", status);
    if (actorUserId.trim()) params.set("actorUserId", actorUserId.trim());
    params.set("offset", String(offset));
    params.set("limit", String(limit));
    params.set("includeMetrics", "true");
    if (schoolId) params.set("includePolicy", "true");
    return params.toString();
  }, [schoolId, runId, status, actorUserId, offset, limit]);

  async function loadHistory() {
    if (!schoolId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/recovery-orchestrator?${queryString}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({ error: "Unable to load recovery governance history." }))) as { error?: string };
        throw new Error(payload.error ?? "Unable to load recovery governance history.");
      }

      const payload = (await response.json()) as {
        items?: RecoveryHistoryRow[];
        total?: number;
        policy?: RecoveryPolicy | null;
        metrics?: RecoveryGovernanceMetrics | null;
      };
      setRows(payload.items ?? []);
      setTotal(payload.total ?? 0);
      setMetrics(payload.metrics ?? null);
      if (payload.policy) {
        setPolicy(payload.policy);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load recovery governance history.");
    } finally {
      setLoading(false);
    }
  }

  async function loadTimeline(runValue: string) {
    if (!schoolId || !runValue) {
      setTimeline([]);
      return;
    }

    try {
      const params = new URLSearchParams({
        schoolId,
        runId: runValue,
        includeTimeline: "true",
        limit: "200",
        offset: "0",
      });
      const response = await fetch(`/api/admin/recovery-orchestrator?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        setTimeline([]);
        return;
      }
      const payload = (await response.json()) as { timeline?: RecoveryTimelineEvent[] };
      setTimeline(payload.timeline ?? []);
    } catch {
      setTimeline([]);
    }
  }

  useEffect(() => {
    void loadHistory();
  }, [queryString]);

  useEffect(() => {
    if (!selectedRunId) {
      setTimeline([]);
      return;
    }
    void loadTimeline(selectedRunId);
  }, [selectedRunId, schoolId]);

  useEffect(() => {
    if (!schoolId) return;

    const params = new URLSearchParams();
    params.set("transport", "sse");
    params.set("schoolId", schoolId);
    params.set("sinceIso", lastLiveSinceIsoRef.current);
    if (status) params.set("status", status);
    if (actorUserId.trim()) params.set("actorUserId", actorUserId.trim());

    const pollingParams = new URLSearchParams();
    pollingParams.set("transport", "polling");
    pollingParams.set("schoolId", schoolId);
    pollingParams.set("sinceIso", lastLiveSinceIsoRef.current);
    if (status) pollingParams.set("status", status);
    if (actorUserId.trim()) pollingParams.set("actorUserId", actorUserId.trim());

    const stop = startRecoveryGovernanceLiveBridge({
      sseUrl: `/api/admin/recovery-orchestrator?${params.toString()}`,
      pollingUrl: `/api/admin/recovery-orchestrator?${pollingParams.toString()}`,
      pollingIntervalMs: 10000,
      onUpdate: ({ transport, envelope }) => {
        setLiveTransport(transport);
        setLiveUpdatedAt(envelope.generatedAt);
        if (!envelope.events.length) return;
        lastLiveSinceIsoRef.current = envelope.events[envelope.events.length - 1].createdAt;
        setLiveEvents((current) => [...envelope.events.slice(-8), ...current].slice(0, 30));
        void loadHistory();
        if (selectedRunId) {
          const selectedUpdated = envelope.events.some((entry) => entry.runId === selectedRunId);
          if (selectedUpdated) {
            void loadTimeline(selectedRunId);
          }
        }
      },
      onStatus: ({ transport, state }) => {
        if (state === "connected") {
          setLiveTransport(transport);
        }
      },
    });

    return () => {
      stop();
    };
  }, [schoolId, status, actorUserId, selectedRunId]);

  const selectedRow = useMemo(
    () => rows.find((row) => row.runId === selectedRunId) ?? null,
    [rows, selectedRunId],
  );

  async function savePolicy() {
    if (!schoolId) return;
    setSavingPolicy(true);
    setPolicyMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/recovery-orchestrator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "update_policy",
          payload: {
            schoolId,
            teacherApprovalRoles: policy.teacherApprovalRoles,
            guardrails: policy.guardrails,
            note: "Updated from governance panel",
          },
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({ error: "Unable to update policy." }))) as { error?: string };
        throw new Error(payload.error ?? "Unable to update policy.");
      }

      setPolicyMessage("Policy saved.");
      await loadHistory();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update policy.");
    } finally {
      setSavingPolicy(false);
    }
  }

  async function retryExecution(row: RecoveryHistoryRow) {
    setError(null);
    try {
      const response = await fetch("/api/admin/recovery-orchestrator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "retry_execution",
          payload: {
            plan: {
              ...row.plan,
              runId: row.runId,
              schoolId: row.schoolId,
              status: row.planStatus,
            },
            note: `Retry requested from governance panel for run ${row.runId}`,
          },
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({ error: "Retry failed." }))) as { error?: string };
        throw new Error(payload.error ?? "Retry failed.");
      }
      await loadHistory();
      await loadTimeline(row.runId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Retry failed.");
    }
  }

  async function downloadExport(exportType: "orchestration_history" | "rollback_history" | "retry_activity" | "school_policy_settings") {
    setExporting(exportType);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("exportType", exportType);
      if (schoolId) params.set("schoolId", schoolId);
      if (runId.trim()) params.set("runId", runId.trim());
      if (status) params.set("status", status);
      if (actorUserId.trim()) params.set("actorUserId", actorUserId.trim());
      params.set("limit", "500");
      params.set("offset", "0");

      const response = await fetch(`/api/admin/recovery-orchestrator?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({ error: "Export failed." }))) as { error?: string };
        throw new Error(payload.error ?? "Export failed.");
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("content-disposition") ?? "";
      const match = /filename=\"?([^\";]+)\"?/i.exec(contentDisposition);
      const filename = match?.[1] ?? `${exportType}.csv`;
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Export failed.");
    } finally {
      setExporting(null);
    }
  }

  function toggleRole(role: "teacher" | "admin" | "owner") {
    setPolicy((current) => {
      const hasRole = current.teacherApprovalRoles.includes(role);
      const nextRoles = hasRole
        ? current.teacherApprovalRoles.filter((item) => item !== role)
        : [...current.teacherApprovalRoles, role];
      return {
        ...current,
        teacherApprovalRoles: nextRoles.length ? nextRoles : ["teacher"],
      };
    });
  }

  const activeSchoolLabel = useMemo(() => {
    if (!metrics?.mostActiveSchools?.length) return "-";
    const top = metrics.mostActiveSchools[0];
    const school = schools.find((item) => item.id === top.schoolId);
    return `${school?.name ?? top.schoolId} (${top.runCount})`;
  }, [metrics?.mostActiveSchools, schools]);

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 text-slate-100">
      <section className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.15em] text-cyan-300">Recovery Governance</p>
            <h1 className="mt-1 text-2xl font-black text-white">Orchestration Governance Replay</h1>
            <p className="mt-1 text-sm text-slate-300">Live operations, failure intelligence, retry controls, rollback history, and policy governance.</p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-300">
            <p>Live transport: <span className="font-semibold text-cyan-200">{liveTransport ?? "-"}</span></p>
            <p>Updated: <span className="font-semibold text-slate-200">{liveUpdatedAt ? new Date(liveUpdatedAt).toLocaleString() : "-"}</span></p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <label className="text-xs text-slate-300">
            School
            <select value={schoolId} onChange={(event) => { setSchoolId(event.target.value); setOffset(0); }} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-xs text-white">
              {schools.map((school) => (
                <option key={school.id} value={school.id}>{school.name}</option>
              ))}
            </select>
          </label>

          <label className="text-xs text-slate-300">
            Run Id
            <input value={runId} onChange={(event) => { setRunId(event.target.value); setOffset(0); }} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-xs text-white" placeholder="aro-..." />
          </label>

          <label className="text-xs text-slate-300">
            Status
            <select value={status} onChange={(event) => { setStatus(event.target.value); setOffset(0); }} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-xs text-white">
              {STATUS_OPTIONS.map((item) => (
                <option key={item || "all"} value={item}>{item || "all"}</option>
              ))}
            </select>
          </label>

          <label className="text-xs text-slate-300">
            Actor User Id
            <input value={actorUserId} onChange={(event) => { setActorUserId(event.target.value); setOffset(0); }} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-xs text-white" placeholder="admin or teacher user id" />
          </label>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
          <p className="text-[11px] uppercase tracking-[0.15em] text-slate-400">Total Runs</p>
          <p className="mt-1 text-2xl font-black text-white">{metrics?.totalRuns ?? 0}</p>
          <p className="text-[11px] text-slate-400">Most active: {activeSchoolLabel}</p>
        </article>
        <article className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
          <p className="text-[11px] uppercase tracking-[0.15em] text-slate-400">Approval Rate</p>
          <p className="mt-1 text-2xl font-black text-emerald-200">{metrics?.approvalRate ?? 0}%</p>
          <p className="text-[11px] text-slate-400">Rollback rate: {metrics?.rollbackRate ?? 0}%</p>
        </article>
        <article className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
          <p className="text-[11px] uppercase tracking-[0.15em] text-slate-400">Retries</p>
          <p className="mt-1 text-2xl font-black text-amber-200">{metrics?.retryCount ?? 0}</p>
          <p className="text-[11px] text-slate-400">Partial runs: {metrics?.partiallyExecutedRuns ?? 0}</p>
        </article>
        <article className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
          <p className="text-[11px] uppercase tracking-[0.15em] text-slate-400">Execution Duration</p>
          <p className="mt-1 text-2xl font-black text-cyan-200">{formatDuration(metrics?.averageExecutionDurationMs ?? 0)}</p>
          <p className="text-[11px] text-slate-400">Guardrail blocks: {metrics?.guardrailBlockCount ?? 0}</p>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-white">Governance Exports</h2>
          <p className="text-xs text-slate-400">CSV snapshots for history, rollback, retry, and policy settings.</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => void downloadExport("orchestration_history")} disabled={exporting !== null} className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 disabled:opacity-50">{exporting === "orchestration_history" ? "Exporting..." : "Export Orchestration"}</button>
          <button type="button" onClick={() => void downloadExport("rollback_history")} disabled={exporting !== null} className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 disabled:opacity-50">{exporting === "rollback_history" ? "Exporting..." : "Export Rollback"}</button>
          <button type="button" onClick={() => void downloadExport("retry_activity")} disabled={exporting !== null} className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 disabled:opacity-50">{exporting === "retry_activity" ? "Exporting..." : "Export Retries"}</button>
          <button type="button" onClick={() => void downloadExport("school_policy_settings")} disabled={exporting !== null} className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 disabled:opacity-50">{exporting === "school_policy_settings" ? "Exporting..." : "Export Policies"}</button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-5">
        <h2 className="text-lg font-semibold text-white">Tenant Policy</h2>
        <p className="mt-1 text-xs text-slate-300">Configure teacher approval role scope and guardrail thresholds per school.</p>

        <div className="mt-3 flex flex-wrap gap-2">
          {(["teacher", "admin", "owner"] as const).map((role) => (
            <button key={role} type="button" onClick={() => toggleRole(role)} className={[
              "rounded-lg border px-3 py-1.5 text-xs font-semibold",
              policy.teacherApprovalRoles.includes(role)
                ? "border-cyan-500/60 bg-cyan-500/15 text-cyan-100"
                : "border-slate-600 bg-slate-950 text-slate-300",
            ].join(" ")}>{role}</button>
          ))}
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <label className="text-xs text-slate-300">Min assessment accuracy %
            <input type="number" value={policy.guardrails.minAssessmentAccuracyPct ?? ""} onChange={(event) => setPolicy((current) => ({ ...current, guardrails: { ...current.guardrails, minAssessmentAccuracyPct: event.target.value ? Number(event.target.value) : undefined } }))} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-xs text-white" />
          </label>
          <label className="text-xs text-slate-300">Hint threshold
            <input type="number" value={policy.guardrails.repeatedHintThreshold ?? ""} onChange={(event) => setPolicy((current) => ({ ...current, guardrails: { ...current.guardrails, repeatedHintThreshold: event.target.value ? Number(event.target.value) : undefined } }))} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-xs text-white" />
          </label>
          <label className="text-xs text-slate-300">Low confidence threshold
            <input type="number" step="0.01" value={policy.guardrails.lowConfidenceThreshold ?? ""} onChange={(event) => setPolicy((current) => ({ ...current, guardrails: { ...current.guardrails, lowConfidenceThreshold: event.target.value ? Number(event.target.value) : undefined } }))} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-xs text-white" />
          </label>
          <label className="text-xs text-slate-300">Stalled days threshold
            <input type="number" value={policy.guardrails.stalledDaysThreshold ?? ""} onChange={(event) => setPolicy((current) => ({ ...current, guardrails: { ...current.guardrails, stalledDaysThreshold: event.target.value ? Number(event.target.value) : undefined } }))} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-xs text-white" />
          </label>
          <label className="text-xs text-slate-300">Max intervention mins/week
            <input type="number" value={policy.guardrails.maxInterventionMinutesPerWeek ?? ""} onChange={(event) => setPolicy((current) => ({ ...current, guardrails: { ...current.guardrails, maxInterventionMinutesPerWeek: event.target.value ? Number(event.target.value) : undefined } }))} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-xs text-white" />
          </label>
          <label className="text-xs text-slate-300">Cooldown hours
            <input type="number" value={policy.guardrails.cooldownHours ?? ""} onChange={(event) => setPolicy((current) => ({ ...current, guardrails: { ...current.guardrails, cooldownHours: event.target.value ? Number(event.target.value) : undefined } }))} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-xs text-white" />
          </label>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={() => void savePolicy()} disabled={savingPolicy || !schoolId} className="rounded-lg border border-cyan-500/50 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-100 disabled:opacity-50">
            {savingPolicy ? "Saving..." : "Save Policy"}
          </button>
          {policyMessage ? <p className="text-xs text-emerald-200">{policyMessage}</p> : null}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-white">Orchestration History</h2>
          <p className="text-xs text-slate-400">{loading ? "Loading..." : `${rows.length} rows`}</p>
        </div>

        {error ? <p className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{error}</p> : null}

        {liveEvents.length ? (
          <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-[11px] text-slate-300">
            <p className="font-semibold text-cyan-200">Live Incident Feed</p>
            <ul className="mt-2 space-y-1">
              {liveEvents.slice(0, 6).map((entry) => (
                <li key={`${entry.runId}-${entry.createdAt}-${entry.eventType}`}>{new Date(entry.createdAt).toLocaleTimeString()} · {entry.eventType} · {entry.runId} · {entry.status} · progress {entry.progressPercent}%</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th className="px-2 py-2">Run</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Target</th>
                <th className="px-2 py-2">Actor</th>
                <th className="px-2 py-2">Execution</th>
                <th className="px-2 py-2">Created</th>
                <th className="px-2 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.runId}-${row.createdAt}-${row.action}`} className="border-b border-slate-800/70 text-slate-200">
                  <td className="px-2 py-2 align-top">
                    <p className="font-semibold">{row.runId}</p>
                    <p className="text-[11px] text-slate-400">{row.action}</p>
                  </td>
                  <td className="px-2 py-2 align-top uppercase">{row.planStatus}</td>
                  <td className="px-2 py-2 align-top">
                    <p>{row.plan.targetConcept}</p>
                    <p className="text-[11px] text-slate-400">student: {row.plan.studentId ?? "-"}</p>
                  </td>
                  <td className="px-2 py-2 align-top">
                    <p>{row.actorUserId ?? "-"}</p>
                    <p className="text-[11px] text-slate-400">teacherLink: {row.actorSchoolTeacherId ?? "-"}</p>
                  </td>
                  <td className="px-2 py-2 align-top">
                    <p>{row.plan.execution.executed ? "executed" : "pending/partial"}</p>
                    <p className="text-[11px] text-amber-200">{row.plan.execution.lastExecutionError ?? "-"}</p>
                    <p className="text-[11px] text-slate-400">progress {row.plan.execution.progressPercent ?? 0}%</p>
                  </td>
                  <td className="px-2 py-2 align-top">{new Date(row.createdAt).toLocaleString()}</td>
                  <td className="px-2 py-2 align-top">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => setSelectedRunId((current) => current === row.runId ? null : row.runId)}
                        className="rounded-md border border-cyan-500/50 bg-cyan-500/15 px-2 py-1 text-[11px] font-semibold text-cyan-100"
                      >
                        {selectedRunId === row.runId ? "Hide" : "Details"}
                      </button>
                      {row.planStatus === "approved" && !row.plan.execution.executed ? (
                        <button type="button" onClick={() => void retryExecution(row)} className="rounded-md border border-amber-500/50 bg-amber-500/15 px-2 py-1 text-[11px] font-semibold text-amber-100">
                          Retry
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-end gap-2">
          <button type="button" disabled={offset === 0} onClick={() => setOffset((current) => Math.max(0, current - limit))} className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 disabled:opacity-40">
            Previous
          </button>
          <p className="text-xs text-slate-400">offset {offset} / total {total}</p>
          <button type="button" disabled={offset + limit >= total} onClick={() => setOffset((current) => current + limit)} className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 disabled:opacity-40">
            Next
          </button>
        </div>
      </section>

      {selectedRow ? (
        <section className="rounded-2xl border border-cyan-500/40 bg-slate-900/95 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-cyan-300">Run Detail</p>
              <h3 className="mt-1 text-lg font-black text-white">{selectedRow.runId}</h3>
              <p className="mt-1 text-xs text-slate-300">{selectedRow.plan.targetConcept} · {selectedRow.plan.status.toUpperCase()} · {new Date(selectedRow.createdAt).toLocaleString()}</p>
            </div>
            <button type="button" onClick={() => setSelectedRunId(null)} className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-1.5 text-xs text-slate-200">
              Close
            </button>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <article className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
              <p className="text-xs font-semibold text-slate-100">Explainability</p>
              <p className="mt-1 text-xs text-slate-300">{selectedRow.plan.explainability.summary}</p>
              <ul className="mt-2 space-y-1 text-[11px] text-slate-400">
                {selectedRow.plan.explainability.evidence.length
                  ? selectedRow.plan.explainability.evidence.map((entry) => <li key={entry}>- {entry}</li>)
                  : <li>- No evidence entries</li>}
              </ul>
            </article>

            <article className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
              <p className="text-xs font-semibold text-slate-100">Execution Effects</p>
              <ul className="mt-2 space-y-1 text-[11px] text-slate-300">
                <li>Executed: {selectedRow.plan.execution.executed ? "yes" : "no"}</li>
                <li>Executed at: {selectedRow.plan.execution.executedAtIso ? new Date(selectedRow.plan.execution.executedAtIso).toLocaleString() : "-"}</li>
                <li>Duration: {formatDuration(selectedRow.plan.execution.durationMs ?? 0)}</li>
                <li>Attempts: {selectedRow.plan.execution.attempts ?? 0}</li>
                <li>Progress: {selectedRow.plan.execution.progressPercent ?? 0}%</li>
                <li>Content id: {selectedRow.plan.execution.executionEffects.createdContentId ?? "-"}</li>
                <li>Assignment id: {selectedRow.plan.execution.executionEffects.assignmentId ?? "-"}</li>
                <li>Weak area id: {selectedRow.plan.execution.executionEffects.weakAreaId ?? "-"}</li>
                <li>Revision scheduled: {selectedRow.plan.execution.executionEffects.revisionScheduled ? "yes" : "no"}</li>
                <li>Last execution error: {selectedRow.plan.execution.lastExecutionError ?? "-"}</li>
              </ul>
            </article>

            <article className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
              <p className="text-xs font-semibold text-slate-100">Failure Classification</p>
              {selectedRow.plan.execution.failureClassification ? (
                <ul className="mt-2 space-y-1 text-[11px] text-slate-300">
                  <li>Category: {selectedRow.plan.execution.failureClassification.category}</li>
                  <li>Severity: {selectedRow.plan.execution.failureClassification.severity}</li>
                  <li>Retry Recommended: {selectedRow.plan.execution.failureClassification.retryRecommended ? "yes" : "no"}</li>
                  <li>Guidance: {selectedRow.plan.execution.failureClassification.operatorGuidance}</li>
                </ul>
              ) : (
                <p className="mt-2 text-[11px] text-slate-300">No failure classification for this run.</p>
              )}
            </article>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <article className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
              <p className="text-xs font-semibold text-slate-100">Rollback Instructions</p>
              <ul className="mt-2 space-y-1 text-[11px] text-slate-300">
                {selectedRow.plan.rollbackPlan.length
                  ? selectedRow.plan.rollbackPlan.map((item) => (
                    <li key={item.actionId}>{item.actionId}: {item.instruction}</li>
                  ))
                  : <li>No rollback actions recorded.</li>}
              </ul>
            </article>

            <article className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
              <p className="text-xs font-semibold text-slate-100">Recovery Path + Guardrails</p>
              <p className="mt-1 text-[11px] text-slate-300">Path: {selectedRow.plan.recoveryPath.length ? selectedRow.plan.recoveryPath.join(" -> ") : "-"}</p>
              <ul className="mt-2 space-y-1 text-[11px] text-slate-300">
                {selectedRow.plan.blockedReasons.length ? selectedRow.plan.blockedReasons.map((entry) => <li key={entry}>Blocked: {entry}</li>) : <li>No blocked reasons.</li>}
                {selectedRow.plan.warnings.length ? selectedRow.plan.warnings.map((entry) => <li key={entry}>Warning: {entry}</li>) : <li>No warnings.</li>}
              </ul>
            </article>
          </div>

          <article className="mt-3 rounded-xl border border-slate-700 bg-slate-950/60 p-3">
            <p className="text-xs font-semibold text-slate-100">Incident Timeline</p>
            <p className="mt-1 text-[11px] text-slate-400">{"plan created -> teacher approved -> admin confirmed -> execution -> retry/rollback/guardrail outcomes"}</p>
            <ul className="mt-2 space-y-1 text-[11px] text-slate-300">
              {timeline.length
                ? timeline.map((event) => (
                  <li key={`${event.runId}-${event.atIso}-${event.stage}`}>
                    {new Date(event.atIso).toLocaleString()} · {event.stage} · {event.action} · actor {event.actorUserId ?? "-"}
                    {event.note ? ` · ${event.note}` : ""}
                  </li>
                ))
                : <li>No timeline events for this run.</li>}
            </ul>
          </article>
        </section>
      ) : null}
    </main>
  );
}
