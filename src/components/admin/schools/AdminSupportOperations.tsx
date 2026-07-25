"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { AdminSupportOperations } from "@/lib/schools/admin-support-dashboard";

type TabKey = "live" | "tutors" | "cases" | "analytics";

type CasePayload = {
  caseId: string;
  childId: string;
  periodId: string | null;
  studentName: string;
  lessonTitle: string | null;
  subject: string | null;
  timeline: Array<{ at: string; kind: string; label: string; detail?: string | null; source: string }>;
  session: {
    sessionId: string;
    status: string;
    outcome: string | null;
    privateNotes: string | null;
    misconception: string | null;
    unresolvedReport: unknown;
    followUp: {
      status: string;
      ownerUserId: string | null;
      dueAt: string | null;
      adminNote: string | null;
    } | null;
    guidanceCount: number;
  } | null;
  queue: {
    queueEntryId: string;
    status: string;
    assignedTutorId: string | null;
  } | null;
};

type Props = { schoolId: string };

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-700/70 bg-slate-950/50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white tabular-nums">{value}</p>
    </div>
  );
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default function AdminSupportOperations({ schoolId }: Props) {
  const [ops, setOps] = useState<AdminSupportOperations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("live");
  const [caseData, setCaseData] = useState<CasePayload | null>(null);
  const [caseLoading, setCaseLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [forceOfflineTutorId, setForceOfflineTutorId] = useState<string | null>(null);
  const [forceReason, setForceReason] = useState("");
  const [closeActiveSession, setCloseActiveSession] = useState(false);

  const [reassignEntryId, setReassignEntryId] = useState<string | null>(null);
  const [reassignTargetId, setReassignTargetId] = useState("");
  const [reassignReason, setReassignReason] = useState("");

  const [closeSessionId, setCloseSessionId] = useState<string | null>(null);
  const [closeReason, setCloseReason] = useState("");

  const [followUpSessionId, setFollowUpSessionId] = useState<string | null>(null);
  const [followUpNote, setFollowUpNote] = useState("");
  const [followUpStatus, setFollowUpStatus] = useState<"open" | "in_progress" | "closed">("open");

  const [revealPrivateNotes, setRevealPrivateNotes] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/schools/${schoolId}/support`);
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error ?? "Failed to load support operations.");
        setOps(null);
        return;
      }
      setOps(json.operations as AdminSupportOperations);
    } catch {
      setError("Unable to reach support operations API.");
      setOps(null);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function openCase(caseId: string, withPrivateNotes = false) {
    setCaseLoading(true);
    setMessage(null);
    try {
      const qs = withPrivateNotes ? "?includePrivateNotes=1" : "";
      const res = await fetch(
        `/api/admin/schools/${schoolId}/support/cases/${encodeURIComponent(caseId)}${qs}`,
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(json?.error ?? "Failed to load case.");
        return;
      }
      setCaseData(json.case as CasePayload);
      setRevealPrivateNotes(withPrivateNotes);
    } finally {
      setCaseLoading(false);
    }
  }

  async function runForceOffline() {
    if (!forceOfflineTutorId) return;
    const res = await fetch(
      `/api/admin/schools/${schoolId}/support/tutors/${forceOfflineTutorId}/force-offline`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: forceReason, closeActiveSession }),
      },
    );
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setMessage(json?.error ?? "Force offline failed.");
      return;
    }
    setMessage("Tutor forced offline.");
    setForceOfflineTutorId(null);
    setForceReason("");
    setCloseActiveSession(false);
    await load();
  }

  async function runReassign() {
    if (!reassignEntryId || !reassignTargetId) return;
    const res = await fetch(
      `/api/admin/schools/${schoolId}/support/queue/${reassignEntryId}/reassign`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetSchoolTeacherId: reassignTargetId,
          reason: reassignReason || null,
        }),
      },
    );
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setMessage(json?.error ?? "Reassign failed.");
      return;
    }
    setMessage("Work reassigned.");
    setReassignEntryId(null);
    setReassignTargetId("");
    setReassignReason("");
    await load();
  }

  async function runCloseAbandoned() {
    if (!closeSessionId) return;
    const res = await fetch(
      `/api/admin/schools/${schoolId}/support/sessions/${closeSessionId}/close-abandoned`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: closeReason, outcome: "disconnected" }),
      },
    );
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setMessage(json?.error ?? "Close abandoned failed.");
      return;
    }
    setMessage("Abandoned session closed.");
    setCloseSessionId(null);
    setCloseReason("");
    await load();
  }

  async function runFollowUp() {
    if (!followUpSessionId) return;
    const res = await fetch(
      `/api/admin/schools/${schoolId}/support/sessions/${followUpSessionId}/follow-up`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: followUpStatus,
          adminNote: followUpNote || null,
        }),
      },
    );
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setMessage(json?.error ?? "Follow-up update failed.");
      return;
    }
    setMessage("Follow-up updated.");
    setFollowUpSessionId(null);
    setFollowUpNote("");
    await load();
    if (caseData?.session?.sessionId === followUpSessionId) {
      await openCase(caseData.caseId, revealPrivateNotes);
    }
  }

  async function runExport(sensitive: boolean) {
    const confirmed = window.confirm(
      sensitive
        ? "Export sensitive support data including private notes and unresolved prose? This is audited."
        : "Export support history (notes redacted)?",
    );
    if (!confirmed) return;
    const res = await fetch(
      `/api/admin/schools/${schoolId}/support/export${sensitive ? "?sensitive=1" : ""}`,
    );
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setMessage(json?.error ?? "Export failed.");
      return;
    }
    const blob = new Blob([JSON.stringify(json.export, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `support-export-${schoolId}${sensitive ? "-sensitive" : ""}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage(sensitive ? "Sensitive export downloaded (audited)." : "Export downloaded.");
  }

  const availableTutors = (ops?.tutors ?? []).filter((t) => t.status === "available");

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-wide text-white">Human Support Operations</h2>
            <p className="mt-1 text-xs text-slate-400">
              Oversight and intervention control only — Admin is never a tutor.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void runExport(false)}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500"
            >
              Export
            </button>
            <button
              type="button"
              onClick={() => void runExport(true)}
              className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/20"
            >
              Export sensitive
            </button>
            <Link
              href={`/admin/schools/${schoolId}/staff`}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500"
            >
              Staff / suspend
            </Link>
          </div>
        </div>

        {message ? <p className="mt-3 text-xs text-sky-200">{message}</p> : null}
        {error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}
        {loading && !ops ? <p className="mt-3 text-xs text-slate-400">Loading operations…</p> : null}

        {ops ? (
          <>
            <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-100">School Support Health</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <Metric label="AI recovery" value={ops.health.aiRecoveryPercent == null ? "—" : `${ops.health.aiRecoveryPercent}%`} />
                <Metric label="Human interventions" value={`${ops.health.humanInterventionsToday} today`} />
                <Metric label="Average wait" value={ops.health.averageWaitMinutes == null ? "—" : `${ops.health.averageWaitMinutes} min`} />
                <Metric label="Tutor coverage" value={ops.health.tutorCoverage} />
                <Metric label="Safeguarding" value={ops.health.safeguardingAlertsLabel} />
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
              <Metric label="Learning normally" value={ops.glance.learningNormally} />
              <Metric label="AI assisting" value={ops.glance.aiAssisting} />
              <Metric label="AI struggling" value={ops.glance.aiStruggling} />
              <Metric label="Teacher required" value={ops.glance.teacherRequired} />
              <Metric label="Human sessions" value={ops.glance.humanSessionsActive} />
              <Metric label="Available tutors" value={ops.glance.availableTutors} />
              <Metric label="Busy tutors" value={ops.glance.busyTutors} />
              <Metric label="Paused" value={ops.glance.pausedTutors} />
              <Metric label="Offline" value={ops.glance.offlineTutors} />
            </div>
          </>
        ) : null}
      </section>

      <section className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
        <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
          {([
            ["live", "Live Support"],
            ["tutors", "Tutors"],
            ["cases", "Open Cases"],
            ["analytics", "Analytics"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                tab === key
                  ? "bg-sky-500/20 text-sky-100 border border-sky-500/40"
                  : "border border-transparent text-slate-300 hover:bg-slate-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {!ops ? null : tab === "live" ? (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs text-slate-200">
              <thead className="text-slate-400">
                <tr>
                  <th className="py-2 pr-3 font-medium">Student</th>
                  <th className="py-2 pr-3 font-medium">Lesson</th>
                  <th className="py-2 pr-3 font-medium">AI status</th>
                  <th className="py-2 pr-3 font-medium">Tutor</th>
                  <th className="py-2 pr-3 font-medium">Time</th>
                  <th className="py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {ops.liveSupport.length === 0 ? (
                  <tr><td className="py-3 text-slate-400" colSpan={6}>No live support attention required.</td></tr>
                ) : ops.liveSupport.map((row) => (
                  <tr key={`${row.caseId}-${row.kind}`} className="border-t border-slate-800">
                    <td className="py-2 pr-3">{row.studentName}</td>
                    <td className="py-2 pr-3">{row.lessonTitle ?? "—"}</td>
                    <td className="py-2 pr-3">{row.aiStatus}</td>
                    <td className="py-2 pr-3">{row.tutorName ?? "—"}</td>
                    <td className="py-2 pr-3">{row.minutesOpen == null ? "—" : `${row.minutesOpen} mins`}</td>
                    <td className="py-2">
                      <button
                        type="button"
                        className="text-sky-300 hover:text-sky-200"
                        onClick={() => void openCase(row.caseId)}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : tab === "tutors" ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {ops.tutors.map((tutor) => (
              <div key={tutor.schoolTeacherId} className="rounded-lg border border-slate-700/70 bg-slate-900/40 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">{tutor.name}</p>
                    <p className="text-xs text-slate-400 capitalize">{tutor.status} · {tutor.role}</p>
                  </div>
                  <button
                    type="button"
                    className="rounded border border-amber-500/40 px-2 py-1 text-[11px] font-semibold text-amber-100 hover:bg-amber-500/10"
                    onClick={() => {
                      setForceOfflineTutorId(tutor.schoolTeacherId);
                      setForceReason("");
                      setCloseActiveSession(tutor.status === "busy");
                    }}
                  >
                    Force offline
                  </button>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-slate-300">
                  <div><dt className="text-slate-500">Sessions today</dt><dd>{tutor.sessionsCompletedToday}</dd></div>
                  <div><dt className="text-slate-500">Median</dt><dd>{tutor.rollingMedianMinutes == null ? "—" : `${tutor.rollingMedianMinutes} mins`}</dd></div>
                  <div><dt className="text-slate-500">Unresolved</dt><dd>{tutor.unresolvedToday}</dd></div>
                  <div><dt className="text-slate-500">Current student</dt><dd>{tutor.currentStudentName ?? "—"}</dd></div>
                </dl>
              </div>
            ))}
          </div>
        ) : tab === "cases" ? (
          <div className="mt-3 space-y-2">
            {ops.openCases.length === 0 ? (
              <p className="text-xs text-slate-400">No open cases.</p>
            ) : ops.openCases.map((row) => (
              <div key={`${row.caseId}-${row.attention}-${row.sessionId ?? row.queueEntryId}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-700/70 bg-slate-900/40 px-3 py-2">
                <div>
                  <p className="text-sm text-white">{row.studentName}</p>
                  <p className="text-xs text-slate-400">
                    {row.attention} · {row.lessonTitle ?? "Lesson"} · {row.tutorName ?? "No tutor"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="text-xs text-sky-300" onClick={() => void openCase(row.caseId)}>Open</button>
                  {row.queueEntryId && (row.status === "waiting" || row.status === "assigned" || row.status === "paused_ai_only") ? (
                    <button
                      type="button"
                      className="text-xs text-amber-200"
                      onClick={() => {
                        const entryId = row.queueEntryId!;
                        setReassignEntryId(entryId);
                        setReassignTargetId(availableTutors[0]?.schoolTeacherId ?? "");
                        setReassignReason("");
                      }}
                    >
                      Reassign
                    </button>
                  ) : null}
                  {row.sessionId && (row.status === "abandoned" || row.attention === "Disconnected" || row.status === "active") ? (
                    <button
                      type="button"
                      className="text-xs text-rose-200"
                      onClick={() => {
                        const sessionId = row.sessionId!;
                        setCloseSessionId(sessionId);
                        setCloseReason("");
                      }}
                    >
                      Close abandoned
                    </button>
                  ) : null}
                  {row.sessionId && (row.attention === "Unresolved" || row.attention === "Needs follow-up") ? (
                    <button
                      type="button"
                      className="text-xs text-emerald-200"
                      onClick={() => {
                        const sessionId = row.sessionId!;
                        setFollowUpSessionId(sessionId);
                        setFollowUpStatus("open");
                        setFollowUpNote("");
                      }}
                    >
                      Follow-up
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 space-y-3 text-xs text-slate-300">
            {!ops.analytics ? (
              <p className="text-slate-400">Analytics unavailable for this school window.</p>
            ) : (
              <>
                <p>
                  Window {ops.analytics.windowDays}d · {ops.analytics.studentCount} students · {ops.analytics.totalSignals} signals
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Metric label="Unresolved sessions" value={ops.analytics.unresolvedSessionCount} />
                  <Metric label="Needs monitoring" value={ops.analytics.needsMonitoringSessionCount} />
                  <Metric label="Escalated" value={ops.analytics.escalatedSessionCount} />
                </div>
                <div>
                  <h4 className="font-semibold text-white">By source</h4>
                  <ul className="mt-1 space-y-1">
                    {ops.analytics.bySource.map((row) => (
                      <li key={row.source}>{row.source}: {row.count}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-white">Subjects / skills needing support</h4>
                  <ul className="mt-1 space-y-1">
                    {ops.analytics.topSkills.map((skill) => (
                      <li key={`${skill.subject}-${skill.skillFocus}`}>
                        {skill.subject} · {skill.skillFocus} ({skill.signalCount})
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-white">Recent outcomes</h4>
                  <ul className="mt-1 space-y-1">
                    {ops.recentActivity.slice(0, 8).map((row) => (
                      <li key={row.sessionId}>
                        {row.studentName} · {row.lessonTitle ?? "Lesson"} · {row.tutorName ?? "—"} · {row.outcome ?? "—"}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {(caseData || caseLoading) ? (
        <section className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">Student case timeline</h3>
            <div className="flex gap-2">
              {!revealPrivateNotes && caseData ? (
                <button
                  type="button"
                  className="rounded border border-amber-500/40 px-2 py-1 text-[11px] text-amber-100"
                  onClick={() => {
                    const ok = window.confirm("View private tutor notes? This is audited.");
                    if (ok) void openCase(caseData.caseId, true);
                  }}
                >
                  Reveal private notes
                </button>
              ) : null}
              <button type="button" className="text-xs text-slate-400" onClick={() => setCaseData(null)}>Close</button>
            </div>
          </div>
          {caseLoading ? <p className="mt-2 text-xs text-slate-400">Loading case…</p> : null}
          {caseData ? (
            <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_280px]">
              <ol className="space-y-3 border-l border-slate-700 pl-4">
                {caseData.timeline.map((event, index) => (
                  <li key={`${event.at}-${event.kind}-${index}`} className="relative">
                    <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-sky-400" />
                    <p className="text-[11px] text-slate-500">{formatTime(event.at)}</p>
                    <p className="text-sm text-white">{event.label}</p>
                    {event.detail ? <p className="text-xs text-slate-400">{event.detail}</p> : null}
                  </li>
                ))}
              </ol>
              <div className="space-y-2 text-xs text-slate-300">
                <p><span className="text-slate-500">Student</span><br />{caseData.studentName}</p>
                <p><span className="text-slate-500">Lesson</span><br />{caseData.lessonTitle ?? caseData.subject ?? "—"}</p>
                <p><span className="text-slate-500">Queue</span><br />{caseData.queue?.status ?? "—"}</p>
                <p><span className="text-slate-500">Session</span><br />{caseData.session ? `${caseData.session.status} · ${caseData.session.outcome ?? "in progress"}` : "—"}</p>
                {caseData.session?.misconception ? (
                  <p><span className="text-slate-500">Misconception</span><br />{caseData.session.misconception}</p>
                ) : null}
                {revealPrivateNotes && caseData.session?.privateNotes ? (
                  <p><span className="text-slate-500">Private notes</span><br />{caseData.session.privateNotes}</p>
                ) : null}
                {caseData.session?.followUp ? (
                  <p><span className="text-slate-500">Follow-up</span><br />{caseData.session.followUp.status}{caseData.session.followUp.adminNote ? ` — ${caseData.session.followUp.adminNote}` : ""}</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {forceOfflineTutorId ? (
        <Modal title="Force tutor offline" onClose={() => setForceOfflineTutorId(null)}>
          <p className="text-xs text-slate-300">Protected action. Reason required. Active sessions must be closed explicitly.</p>
          <textarea
            className="mt-2 w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-white"
            rows={3}
            value={forceReason}
            onChange={(e) => setForceReason(e.target.value)}
            placeholder="Reason"
          />
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={closeActiveSession} onChange={(e) => setCloseActiveSession(e.target.checked)} />
            Close active session if busy (disconnected)
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="text-xs text-slate-400" onClick={() => setForceOfflineTutorId(null)}>Cancel</button>
            <button type="button" className="rounded bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-100" onClick={() => void runForceOffline()}>Confirm</button>
          </div>
        </Modal>
      ) : null}

      {reassignEntryId ? (
        <Modal title="Reassign unaccepted work" onClose={() => setReassignEntryId(null)}>
          <p className="text-xs text-slate-300">Operational action. Only waiting / assigned (not active sessions).</p>
          <select
            className="mt-2 w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-white"
            value={reassignTargetId}
            onChange={(e) => setReassignTargetId(e.target.value)}
          >
            <option value="">Select available tutor</option>
            {availableTutors.map((t) => (
              <option key={t.schoolTeacherId} value={t.schoolTeacherId}>{t.name}</option>
            ))}
          </select>
          <textarea
            className="mt-2 w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-white"
            rows={2}
            value={reassignReason}
            onChange={(e) => setReassignReason(e.target.value)}
            placeholder="Reason (recommended)"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="text-xs text-slate-400" onClick={() => setReassignEntryId(null)}>Cancel</button>
            <button type="button" className="rounded bg-sky-500/20 px-3 py-1.5 text-xs font-semibold text-sky-100" onClick={() => void runReassign()}>Confirm</button>
          </div>
        </Modal>
      ) : null}

      {closeSessionId ? (
        <Modal title="Close abandoned session" onClose={() => setCloseSessionId(null)}>
          <p className="text-xs text-slate-300">Closes the session, completes the queue entry, and returns the student to AI/lesson.</p>
          <textarea
            className="mt-2 w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-white"
            rows={3}
            value={closeReason}
            onChange={(e) => setCloseReason(e.target.value)}
            placeholder="Reason"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="text-xs text-slate-400" onClick={() => setCloseSessionId(null)}>Cancel</button>
            <button type="button" className="rounded bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-100" onClick={() => void runCloseAbandoned()}>Confirm</button>
          </div>
        </Modal>
      ) : null}

      {followUpSessionId ? (
        <Modal title="Unresolved follow-up" onClose={() => setFollowUpSessionId(null)}>
          <select
            className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-white"
            value={followUpStatus}
            onChange={(e) => setFollowUpStatus(e.target.value as "open" | "in_progress" | "closed")}
          >
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="closed">Closed</option>
          </select>
          <textarea
            className="mt-2 w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-white"
            rows={3}
            value={followUpNote}
            onChange={(e) => setFollowUpNote(e.target.value)}
            placeholder="Admin note"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="text-xs text-slate-400" onClick={() => setFollowUpSessionId(null)}>Cancel</button>
            <button type="button" className="rounded bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-100" onClick={() => void runFollowUp()}>Save</button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-950 p-4 shadow-xl">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <button type="button" className="text-xs text-slate-400" onClick={onClose}>Close</button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
