"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminSectionCard from "@/components/admin/AdminSectionCard";
import type { BrainCentreDetailPayload, BrainDiagnosticIssue } from "@/app/api/admin/brain-centre/[studentId]/route";

type Props = {
  params: Promise<{ studentId: string }>;
};

type ActionKey =
  | "refresh_snapshot"
  | "generate_catch_up_recommendation"
  | "generate_homework_recommendation"
  | "rerun_recommendation_sync_audit"
  | "mark_warning_reviewed";

const actions: Array<{ key: ActionKey; label: string }> = [
  { key: "refresh_snapshot", label: "Refresh Snapshot" },
  { key: "generate_catch_up_recommendation", label: "Generate Catch-Up Recommendation" },
  { key: "generate_homework_recommendation", label: "Generate Homework Recommendation" },
  { key: "rerun_recommendation_sync_audit", label: "Review current sync audit" },
  { key: "mark_warning_reviewed", label: "Log warning review" },
];

type GuidedAction = ActionKey | "open_qlf_baseline" | "open_attempts" | "open_weak_areas" | "open_snapshot_view" | "open_heartbeat" | "open_recommendation";

type DiagnosticPlaybook = {
  why: string;
  impact: string;
  actionLabel: string;
  action: GuidedAction | null;
};

function isActionKey(action: GuidedAction | null): action is ActionKey {
  return actions.some((item) => item.key === action);
}

function badgeClass(status: string): string {
  if (status === "critical" || status === "mismatch" || status === "blocked") return "border-rose-500/40 bg-rose-500/10 text-rose-100";
  if (status === "warning") return "border-amber-500/40 bg-amber-500/10 text-amber-100";
  if (status === "informational") return "border-sky-500/40 bg-sky-500/10 text-sky-100";
  return "border-emerald-500/40 bg-emerald-500/10 text-emerald-100";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleString();
}

function toFriendlyPhrase(value: string): string {
  return value.replaceAll("_", " ").replaceAll("-", " ");
}

function toTitleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function friendlyRecommendationLabel(raw: string): string {
  const normal = toFriendlyPhrase(raw).trim();
  return toTitleCase(normal);
}

function warningReviewLabel(status: BrainCentreDetailPayload["warningReview"]["status"]): string {
  if (status === "changed_since_review") return "Changed Since Review";
  if (status === "reviewed") return "Reviewed";
  return "Unreviewed";
}

function diagnosticPlaybook(issue: BrainDiagnosticIssue): DiagnosticPlaybook {
  switch (issue.code) {
    case "missing_snapshot":
      return {
        why: "Academic Intelligence snapshot is missing.",
        impact: "Brain cannot trust recommendation timing without a current snapshot.",
        actionLabel: "Refresh Snapshot",
        action: "refresh_snapshot",
      };
    case "stale_snapshot":
      return {
        why: "Academic snapshot is older than the freshness window.",
        impact: "Recommendations may be stale and based on old learning signals.",
        actionLabel: "Refresh Snapshot",
        action: "refresh_snapshot",
      };
    case "qlf_complete_activity_pending":
      return {
        why: issue.detail,
        impact: "Without a complete baseline, progression decisions are low-confidence.",
        actionLabel: "Open QLF baseline",
        action: "open_qlf_baseline",
      };
    case "recommendation_conflicts":
      return {
        why: issue.detail,
        impact: "Different engines are disagreeing, so the next step can be wrong.",
        actionLabel: "Review current sync audit",
        action: "rerun_recommendation_sync_audit",
      };
    case "heartbeat_conflicts":
      return {
        why: issue.detail,
        impact: "Student may remain in the wrong intervention path.",
        actionLabel: "Review HEART BEAT details",
        action: "open_heartbeat",
      };
    case "missing_weak_area_links":
      return {
        why: issue.detail,
        impact: "Catch-up pathways cannot target the weakest topics correctly.",
        actionLabel: "Generate Catch-Up Recommendation",
        action: "generate_catch_up_recommendation",
      };
    case "missing_student_skill_links":
      return {
        why: issue.detail,
        impact: "Skill-level confidence remains low for assignment decisions.",
        actionLabel: "Refresh Snapshot",
        action: "refresh_snapshot",
      };
    case "missing_learning_dna":
      return {
        why: issue.detail,
        impact: "Personalisation quality drops without learning profile context.",
        actionLabel: "Refresh Snapshot",
        action: "refresh_snapshot",
      };
    default:
      return {
        why: issue.detail,
        impact: "This can reduce recommendation confidence.",
        actionLabel: "Review this warning",
        action: null,
      };
  }
}

function DetailList({ items }: { items: string[] }) {
  if (!items.length) return <p className="text-xs text-slate-500">None recorded.</p>;
  return (
    <ul className="space-y-1 text-xs text-slate-300">
      {items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
    </ul>
  );
}

export default function AdminBrainCentreStudentPage({ params }: Props) {
  const router = useRouter();
  const heartbeatSectionRef = useRef<HTMLElement | null>(null);
  const recommendationSectionRef = useRef<HTMLElement | null>(null);
  const evidenceSectionRef = useRef<HTMLElement | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [payload, setPayload] = useState<BrainCentreDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<ActionKey | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    params.then((resolved) => {
      if (!cancelled) setStudentId(resolved.studentId);
    });
    return () => {
      cancelled = true;
    };
  }, [params]);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    fetch(`/api/admin/brain-centre/${encodeURIComponent(studentId)}`)
      .then((response) => {
        if (response.status === 401) {
          window.location.replace(`/admin/login?next=/admin/brain-centre/${encodeURIComponent(studentId)}`);
          return null;
        }
        if (!response.ok) throw new Error("Unable to load Brain investigation.");
        return response.json() as Promise<BrainCentreDetailPayload>;
      })
      .then((nextPayload) => {
        if (!cancelled && nextPayload) {
          setPayload(nextPayload);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load Brain investigation.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  async function runAction(action: ActionKey) {
    if (!studentId) return;
    setBusyAction(action);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/admin/brain-centre/${encodeURIComponent(studentId)}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Action failed.");
      }
      setMessage(`${actions.find((item) => item.key === action)?.label ?? "Action"} completed.`);
      const refreshed = await fetch(`/api/admin/brain-centre/${encodeURIComponent(studentId)}`);
      if (refreshed.ok) setPayload(await refreshed.json() as BrainCentreDetailPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusyAction(null);
    }
  }

  const heartbeatSignals = useMemo(() => {
    if (!payload) return [];
    return [...payload.heartbeat.reasons, ...payload.heartbeat.blockers, ...payload.heartbeat.evidence].slice(0, 10);
  }, [payload]);

  const runGuidedAction = async (action: GuidedAction | null) => {
    if (!payload) return;
    if (!action) {
      setMessage("No direct fix available yet.");
      return;
    }
    const studentProfilePath = `/admin/students/${encodeURIComponent(payload.student.id)}`;
    if (action === "open_qlf_baseline") {
      setError(null);
      setMessage("Opening QLF baseline on the student profile.");
      router.push(`${studentProfilePath}?focus=qlf-baseline#qlf-baseline`);
      return;
    }
    if (action === "open_attempts") {
      setError(null);
      setMessage("Opening attempts on the student profile.");
      router.push(`${studentProfilePath}?focus=attempts#attempts`);
      return;
    }
    if (action === "open_weak_areas") {
      setError(null);
      setMessage("Opening weak areas on the student profile.");
      router.push(`${studentProfilePath}?focus=weak-areas#weak-areas`);
      return;
    }
    if (action === "open_snapshot_view") {
      evidenceSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setError(null);
      setMessage("Opened snapshot evidence details.");
      return;
    }
    if (action === "open_heartbeat") {
      heartbeatSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setError(null);
      setMessage("Opened HEART BEAT details.");
      return;
    }
    if (action === "open_recommendation") {
      recommendationSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setError(null);
      setMessage("Opened Recommendation Sync details.");
      return;
    }
    await runAction(action);
  };

  const mainIssue = useMemo(() => {
    if (!payload) return null;
    if (!payload.qlfBaseline) {
      return {
        label: "QLF baseline missing",
        actionLabel: "Open QLF baseline",
        action: "open_qlf_baseline" as GuidedAction,
      };
    }
    const topIssue = payload.diagnostics.issues[0];
    if (!topIssue) {
      return {
        label: "No active warning",
        actionLabel: "Refresh Snapshot",
        action: "refresh_snapshot" as GuidedAction,
      };
    }
    const playbook = diagnosticPlaybook(topIssue);
    return {
      label: topIssue.label,
      actionLabel: playbook.actionLabel,
      action: playbook.action,
    };
  }, [payload]);

  const prioritizedActions = useMemo(() => {
    if (!payload) return [] as Array<{ key: GuidedAction; label: string; reason: string }>;
    const plan: Array<{ key: GuidedAction; label: string; reason: string }> = [];
    if (!payload.qlfBaseline) {
      plan.push({ key: "open_qlf_baseline", label: "Complete or re-run Quick Level Finder baseline", reason: "Baseline is missing, so all downstream confidence is lower." });
    }
    if (payload.brainHealth.snapshotStatus !== "fresh") {
      plan.push({ key: "refresh_snapshot", label: "Refresh Snapshot", reason: "Snapshot must be fresh before trusting recommendations." });
    }
    if (payload.recommendationSync.mismatches.length > 0) {
      plan.push({ key: "rerun_recommendation_sync_audit", label: "Review current sync audit", reason: "Engines disagree on the next action and need review." });
    }
    plan.push({ key: "generate_catch_up_recommendation", label: "Generate Catch-Up Recommendation", reason: "Create targeted recovery tasks after baseline and sync checks." });
    plan.push({ key: "generate_homework_recommendation", label: "Generate Homework Recommendation", reason: "Follow up with reinforcement tasks for home learning." });
    plan.push({ key: "mark_warning_reviewed", label: "Log warning review", reason: "Record that this warning has been reviewed." });
    const seen = new Set<GuidedAction>();
    return plan.filter((step) => {
      if (seen.has(step.key)) return false;
      seen.add(step.key);
      return true;
    });
  }, [payload]);

  const mainAction = mainIssue?.action ?? null;
  const mainActionBusy = isActionKey(mainAction) && busyAction === mainAction;
  const mainButtonLabel = mainAction
    ? mainActionBusy
      ? "Running..."
      : mainIssue?.actionLabel ?? "Review details"
    : "No direct fix available yet";

  return (
    <AdminSectionCard
      title="Brain Investigation"
      eyebrow="Stage 2-6"
      action={<Link href="/admin/brain-centre" className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200">Back to Brain Centre</Link>}
    >
      {loading ? <p className="text-sm text-slate-400">Loading investigation...</p> : null}
      <div aria-live="polite" aria-atomic="true">
        {error ? <div className="mb-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{error}</div> : null}
        {message ? <div className="mb-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{message}</div> : null}
      </div>

      {payload ? (
        <div className="space-y-4">
          <section className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-indigo-200">Top Summary</p>
            <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-6">
              <div>
                <p className="text-[11px] uppercase text-indigo-200/80">Student</p>
                <p className="text-sm font-bold text-white">{payload.student.name}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase text-indigo-200/80">Brain Health</p>
                <p className="text-sm font-bold text-white">{toTitleCase(payload.brainHealth.status)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase text-indigo-200/80">Main Issue</p>
                <p className="text-sm font-bold text-white">{mainIssue?.label ?? "No active warning"}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase text-indigo-200/80">Main Action</p>
                <p className="text-sm font-bold text-white">{mainIssue?.actionLabel ?? "Review details"}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase text-indigo-200/80">Risk</p>
                <p className="text-sm font-bold text-white">{toTitleCase(payload.heartbeat.riskLevel)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase text-indigo-200/80">Review Status</p>
                <span className={`mt-1 inline-flex rounded-full border px-2 py-1 text-xs font-bold ${badgeClass(payload.warningReview.status)}`}>
                  {warningReviewLabel(payload.warningReview.status)}
                </span>
              </div>
            </div>
            {payload.warningReview.status === "reviewed" || payload.warningReview.status === "changed_since_review" ? (
              <p className="mt-3 text-xs text-indigo-100">
                Last reviewed {formatDate(payload.warningReview.reviewedAt)}
                {payload.warningReview.reviewedBy ? ` by ${payload.warningReview.reviewedBy}` : ""}
                {payload.warningReview.note ? `: ${payload.warningReview.note}` : ""}
                {payload.warningReview.signalChanged ? " Signal changed since that review." : ""}
              </p>
            ) : (
              <p className="mt-3 text-xs text-indigo-100">This warning is active and has not been reviewed yet.</p>
            )}
            <button
              type="button"
              onClick={() => void runGuidedAction(mainAction)}
              disabled={!mainAction || busyAction !== null}
              className="mt-4 inline-flex rounded-lg border border-indigo-300/50 bg-indigo-500 px-4 py-2 text-sm font-black text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mainButtonLabel}
            </button>
          </section>

          <div className="grid gap-3 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-xs uppercase text-slate-500">Student</p>
              <p className="mt-1 font-black text-white">{payload.student.name}</p>
              <p className="font-mono text-xs text-slate-500">{payload.student.id}</p>
            </div>
            <div className={`rounded-lg border p-3 ${badgeClass(payload.brainHealth.status)}`}>
              <p className="text-xs uppercase opacity-80">Brain Health</p>
              <p className="mt-1 text-2xl font-black">{payload.brainHealth.status}</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-xs uppercase text-slate-500">Brain Health Score</p>
              <p className="mt-1 text-2xl font-black text-white">{payload.brainHealth.score}</p>
            </div>
            <div className={`rounded-lg border p-3 ${badgeClass(payload.recommendationSync.status)}`}>
              <p className="text-xs uppercase opacity-80">Recommendation Sync</p>
              <p className="mt-1 text-2xl font-black">{payload.recommendationSync.status}</p>
            </div>
          </div>

          <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
            <h2 className="text-sm font-bold text-white">Brain Diagnostics (Main Action Area)</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {payload.diagnostics.issues.length ? payload.diagnostics.issues.map((issue) => {
                const playbook = diagnosticPlaybook(issue);
                return (
                  <article key={issue.code} className={`rounded-lg border p-3 ${badgeClass(issue.severity)}`}>
                    <p className="text-sm font-black text-white">{issue.label}</p>
                    <p className="mt-2 text-xs text-slate-100">Why: {playbook.why}</p>
                    <p className="mt-1 text-xs text-slate-200">Impact: {playbook.impact}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-100">Action: {playbook.actionLabel}</p>
                    <button
                      type="button"
                      onClick={() => void runGuidedAction(playbook.action)}
                      disabled={!playbook.action || busyAction !== null}
                      className="mt-3 rounded-lg border border-indigo-300/50 bg-indigo-500/90 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {playbook.actionLabel}
                    </button>
                  </article>
                );
              }) : <p className="text-xs text-slate-500">No diagnostics issues.</p>}
            </div>
          </section>

          <div className="grid gap-3 xl:grid-cols-3">
            <section ref={heartbeatSectionRef} className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <h2 className="text-sm font-bold text-white">HEART BEAT Details</h2>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className={`rounded-full border px-2 py-1 ${badgeClass(payload.heartbeat.riskLevel)}`}>Risk: {payload.heartbeat.riskLevel}</span>
                <span className={`rounded-full border px-2 py-1 ${badgeClass(payload.heartbeat.urgency)}`}>Urgency: {payload.heartbeat.urgency}</span>
                <span className="rounded-full border border-slate-700 px-2 py-1 text-slate-300">Action: {payload.heartbeat.primaryAction}</span>
              </div>
              <p className="mt-3 text-xs text-slate-200">Recommended action: {payload.heartbeat.suggestedNextStep}</p>
              <div className="mt-3">
                <p className="mb-1 text-xs font-bold uppercase text-slate-500">Signals involved</p>
                <DetailList items={heartbeatSignals} />
              </div>
            </section>

            <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <h2 className="text-sm font-bold text-white">Coach/Tutor Audit</h2>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className={`rounded-full border px-2 py-1 ${badgeClass(payload.coachTutorAudit.status)}`}>{payload.coachTutorAudit.status}</span>
                <span className="rounded-full border border-slate-700 px-2 py-1 text-slate-300">Intent: {payload.coachTutorAudit.intent}</span>
                <span className="rounded-full border border-slate-700 px-2 py-1 text-slate-300">Target: {payload.coachTutorAudit.target.label}</span>
              </div>
              <p className="mt-3 text-xs text-slate-200">{payload.coachTutorAudit.reason}</p>
              <p className="mt-2 text-xs text-slate-300">Action: {payload.coachTutorAudit.adminAction}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-300">
                <span>Help: {payload.coachTutorAudit.recentCoachHelpCount}</span>
                <span>Still struggling: {payload.coachTutorAudit.stillStrugglingCount}</span>
                <span>Catch-up: {payload.coachTutorAudit.needsCatchUpCount}</span>
                <span>Live tutor: {payload.coachTutorAudit.liveTutorSupportCount}</span>
                <span>Style: {payload.coachTutorAudit.differentExplanationStyleCount}</span>
                <span>Skipped: {payload.coachTutorAudit.unresolvedTutorSkippedCount}</span>
              </div>
            </section>

            <section ref={recommendationSectionRef} className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <h2 className="text-sm font-bold text-white">Recommendation Sync Details</h2>
              <p className="mt-2 text-xs text-slate-300">Source: {payload.recommendationSync.canonicalDecision.sourceEngine}</p>
              <p className="mt-1 text-xs text-slate-300">Canonical: {payload.recommendationSync.canonicalDecision.intent}: {payload.recommendationSync.canonicalDecision.target.label}</p>
              <p className="mt-1 text-xs text-slate-200">Action: {payload.recommendationSync.action}</p>
              <div className="mt-3 space-y-2">
                {payload.recommendationSync.mismatches.length ? payload.recommendationSync.mismatches.map((mismatch, index) => (
                  <article key={`${mismatch.engine}-${index}`} className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                    <p className="text-sm font-black text-amber-50">{mismatch.label} mismatch</p>
                    <p className="mt-1">Expected: {friendlyRecommendationLabel(mismatch.expected)}</p>
                    <p className="mt-1">Current: {friendlyRecommendationLabel(mismatch.actual)}</p>
                    <p className="mt-1">Reason: {mismatch.reason}</p>
                    <p className="mt-1 font-semibold">Recommended action: Review current sync audit</p>
                    <button
                      type="button"
                      onClick={() => void runGuidedAction("rerun_recommendation_sync_audit")}
                      disabled={busyAction !== null}
                      className="mt-2 rounded-lg border border-amber-200/40 bg-amber-400/20 px-3 py-2 text-xs font-bold text-amber-50 hover:bg-amber-400/30 disabled:opacity-50"
                    >
                      Review sync audit
                    </button>
                  </article>
                )) : <p className="text-xs text-slate-500">No mismatches.</p>}
              </div>
            </section>
          </div>

          <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
            <h2 className="text-sm font-bold text-white">Action Centre</h2>
            <p className="mt-2 text-xs text-slate-300">Follow these steps in order. The first one is the next best action.</p>
            <div className="mt-3 grid gap-2">
              {prioritizedActions.map((step, index) => (
                <div key={step.key} className={`rounded-lg border p-3 ${index === 0 ? "border-indigo-400/50 bg-indigo-500/10" : "border-slate-800 bg-slate-900/40"}`}>
                  <p className="text-xs font-bold text-white">{index + 1}. {step.label}</p>
                  <p className="mt-1 text-xs text-slate-300">{step.reason}</p>
                  <button
                    type="button"
                    onClick={() => void runGuidedAction(step.key)}
                    disabled={busyAction !== null}
                    className="mt-2 rounded-lg border border-indigo-400/40 bg-indigo-500/10 px-3 py-2 text-xs font-bold text-indigo-100 disabled:opacity-50"
                  >
                    {busyAction === step.key ? "Running..." : index === 0 ? "Do this now" : "Run action"}
                  </button>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-3 xl:grid-cols-3">
            <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <h2 className="text-sm font-bold text-white">Learning DNA</h2>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-xs text-slate-300">{JSON.stringify(payload.learningDnaSummary ?? {}, null, 2)}</pre>
            </section>
            <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <h2 className="text-sm font-bold text-white">QLF Baseline</h2>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-xs text-slate-300">{JSON.stringify(payload.qlfBaseline ?? {}, null, 2)}</pre>
            </section>
            <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <h2 className="text-sm font-bold text-white">Academic Intelligence</h2>
              <p className="mt-2 text-xs text-slate-300">Assessment readiness: {payload.academicSummary.assessmentReadiness}</p>
              <p className="mt-1 text-xs text-slate-300">Exam readiness: {payload.academicSummary.examReadiness.band}</p>
              <p className="mt-1 text-xs text-slate-300">Next: {payload.academicSummary.nextRecommendedActions[0] ?? "-"}</p>
            </section>
          </div>

          <section ref={evidenceSectionRef} className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
            <h2 className="text-sm font-bold text-white">Evidence Chain</h2>
            <div className="mt-3 grid gap-2 lg:grid-cols-8">
              {payload.evidenceChain.map((item) => {
                const stage = item.stage.toLowerCase();
                let action: GuidedAction | null = null;
                let actionLabel = "No source view available yet";
                if (stage === "attempt") {
                  action = "open_attempts";
                  actionLabel = "Open attempts";
                } else if (stage === "weakarea") {
                  action = "open_weak_areas";
                  actionLabel = "Open weak areas";
                } else if (stage === "snapshot") {
                  action = "refresh_snapshot";
                  actionLabel = "Refresh snapshot";
                } else if (stage === "heart beat") {
                  action = "open_heartbeat";
                  actionLabel = "Open HEART BEAT details";
                } else if (stage === "recommendation") {
                  action = "open_recommendation";
                  actionLabel = "Open sync mismatch";
                }
                return (
                <div key={item.stage} className={`rounded-lg border p-2 ${badgeClass(item.status)}`}>
                  <p className="text-xs font-black">{item.stage}</p>
                  <p className="mt-1 text-[11px] opacity-90">{item.summary}</p>
                  <p className="mt-1 text-[11px] opacity-70">{formatDate(item.timestamp)}</p>
                  {action ? (
                    <button
                      type="button"
                      onClick={() => void runGuidedAction(action)}
                      className="mt-2 rounded border border-white/30 px-2 py-1 text-[11px] font-bold text-white/90 hover:bg-white/10"
                    >
                      {actionLabel}
                    </button>
                  ) : (
                    <p className="mt-2 text-[11px] text-slate-300">No source view available yet</p>
                  )}
                </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
            <h2 className="text-sm font-bold text-white">Recommendation Control Room</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="uppercase text-slate-500">
                  <tr><th className="px-2 py-2">Engine</th><th className="px-2 py-2">Current Recommendation</th><th className="px-2 py-2">Source</th><th className="px-2 py-2">Sync</th></tr>
                </thead>
                <tbody>
                  {payload.recommendationControlRoom.map((row) => (
                    <tr key={row.engine} className="border-t border-slate-800 text-slate-300">
                      <td className="px-2 py-2 font-bold text-white">{row.engine}</td>
                      <td className="px-2 py-2">{row.currentRecommendation}</td>
                      <td className="px-2 py-2">{row.recommendationSource}</td>
                      <td className="px-2 py-2"><span className={`rounded-full border px-2 py-1 ${badgeClass(row.syncStatus)}`}>{row.syncStatus}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-3 xl:grid-cols-2">
            <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <h2 className="text-sm font-bold text-white">Weak Areas</h2>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-xs text-slate-300">{JSON.stringify(payload.weakAreas, null, 2)}</pre>
            </section>
            <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <h2 className="text-sm font-bold text-white">Student Skills</h2>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-xs text-slate-300">{JSON.stringify(payload.studentSkills, null, 2)}</pre>
            </section>
          </div>

          <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
            <h2 className="text-sm font-bold text-white">Brain Timeline</h2>
            <div className="mt-3 space-y-2">
              {payload.timeline.map((event, index) => (
                <div key={`${event.type}-${event.at}-${index}`} className="grid gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-xs text-slate-300 md:grid-cols-[11rem_12rem_minmax(0,1fr)]">
                  <span className="text-slate-500">{formatDate(event.at)}</span>
                  <span className="font-bold text-white">{event.label}</span>
                  <span>{event.detail}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </AdminSectionCard>
  );
}
