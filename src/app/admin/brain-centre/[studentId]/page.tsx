"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminSectionCard from "@/components/admin/AdminSectionCard";
import type { BrainCentreDetailPayload } from "@/app/api/admin/brain-centre/[studentId]/route";

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
  { key: "rerun_recommendation_sync_audit", label: "Re-run Recommendation Sync Audit" },
  { key: "mark_warning_reviewed", label: "Mark Warning Reviewed" },
];

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

function DetailList({ items }: { items: string[] }) {
  if (!items.length) return <p className="text-xs text-slate-500">None recorded.</p>;
  return (
    <ul className="space-y-1 text-xs text-slate-300">
      {items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
    </ul>
  );
}

export default function AdminBrainCentreStudentPage({ params }: Props) {
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

  return (
    <AdminSectionCard
      title="Brain Investigation"
      eyebrow="Stage 2-6"
      action={<Link href="/admin/brain-centre" className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200">Back to Brain Centre</Link>}
    >
      {loading ? <p className="text-sm text-slate-400">Loading investigation...</p> : null}
      {error ? <div className="mb-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{error}</div> : null}
      {message ? <div className="mb-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{message}</div> : null}

      {payload ? (
        <div className="space-y-4">
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

          <div className="grid gap-3 xl:grid-cols-2">
            <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
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
              <h2 className="text-sm font-bold text-white">Recommendation Sync Details</h2>
              <p className="mt-2 text-xs text-slate-300">Source: {payload.recommendationSync.canonicalDecision.sourceEngine}</p>
              <p className="mt-1 text-xs text-slate-300">Canonical: {payload.recommendationSync.canonicalDecision.intent}: {payload.recommendationSync.canonicalDecision.target.label}</p>
              <p className="mt-1 text-xs text-slate-200">Action: {payload.recommendationSync.action}</p>
              <div className="mt-3 space-y-2">
                {payload.recommendationSync.mismatches.length ? payload.recommendationSync.mismatches.map((mismatch, index) => (
                  <div key={`${mismatch.engine}-${index}`} className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">
                    {mismatch.label}: {mismatch.actual} expected {mismatch.expected}
                  </div>
                )) : <p className="text-xs text-slate-500">No mismatches.</p>}
              </div>
            </section>
          </div>

          <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
            <h2 className="text-sm font-bold text-white">Action Centre</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {actions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  onClick={() => void runAction(action.key)}
                  disabled={busyAction !== null}
                  className="rounded-lg border border-indigo-400/40 bg-indigo-500/10 px-3 py-2 text-xs font-bold text-indigo-100 disabled:opacity-50"
                >
                  {busyAction === action.key ? "Running..." : action.label}
                </button>
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

          <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
            <h2 className="text-sm font-bold text-white">Evidence Chain</h2>
            <div className="mt-3 grid gap-2 lg:grid-cols-7">
              {payload.evidenceChain.map((item) => (
                <div key={item.stage} className={`rounded-lg border p-2 ${badgeClass(item.status)}`}>
                  <p className="text-xs font-black">{item.stage}</p>
                  <p className="mt-1 text-[11px] opacity-90">{item.summary}</p>
                  <p className="mt-1 text-[11px] opacity-70">{formatDate(item.timestamp)}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
            <h2 className="text-sm font-bold text-white">Brain Diagnostics</h2>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {payload.diagnostics.issues.length ? payload.diagnostics.issues.map((issue) => (
                <div key={issue.code} className={`rounded-lg border p-3 ${badgeClass(issue.severity)}`}>
                  <p className="text-xs font-black">{issue.label}</p>
                  <p className="mt-1 text-[11px] opacity-90">{issue.detail}</p>
                </div>
              )) : <p className="text-xs text-slate-500">No diagnostics issues.</p>}
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
