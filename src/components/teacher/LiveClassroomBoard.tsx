"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LiveClassroomBoard, LiveStudentCard } from "@/lib/schools/live-classroom";

const POLL_MS = 10_000;

const GLANCE_STYLES: Record<LiveStudentCard["glanceSignal"], string> = {
  NORMAL: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-100",
  AI_ASSISTING: "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100",
  AI_STRUGGLING: "border-orange-500/50 bg-orange-500/15 text-orange-900 dark:text-orange-100",
  TEACHER_REQUIRED: "border-rose-500/50 bg-rose-500/15 text-rose-900 dark:text-rose-100",
};

const GLANCE_DOT: Record<LiveStudentCard["glanceSignal"], string> = {
  NORMAL: "bg-emerald-500",
  AI_ASSISTING: "bg-amber-400",
  AI_STRUGGLING: "bg-orange-500",
  TEACHER_REQUIRED: "bg-rose-500",
};

function labelLearning(state: LiveStudentCard["learningState"]): string {
  if (state === "not-started") return "Not started";
  if (state === "learning") return "Learning";
  if (state === "practice") return "Practice";
  return "Completed";
}

function labelAi(state: LiveStudentCard["aiSupportState"]): string {
  if (state === "not-needed") return "AI not needed";
  if (state === "stored-help") return "Stored help";
  if (state === "progressing") return "AI progressing";
  if (state === "live-ai") return "Live AI";
  if (state === "struggling") return "AI struggling";
  return "AI exhausted";
}

function labelTeacher(state: LiveStudentCard["teacherState"]): string {
  if (state === "observe") return "Observe";
  if (state === "watch") return "Watch";
  if (state === "intervene") return "Intervene";
  if (state === "supporting") return "Supporting";
  return "Resolved";
}

type Props = {
  dayLessonId: string;
};

export default function LiveClassroomBoard({ dayLessonId }: Props) {
  const [board, setBoard] = useState<LiveClassroomBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [supportingChildIds, setSupportingChildIds] = useState<string[]>([]);
  const [joinMessage, setJoinMessage] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [privateNotes, setPrivateNotes] = useState("");
  const [guidanceText, setGuidanceText] = useState("");
  const [endOutcome, setEndOutcome] = useState("resolved");
  const [unresolvedSummary, setUnresolvedSummary] = useState("");
  const [unresolvedTried, setUnresolvedTried] = useState("");
  const [unresolvedRemaining, setUnresolvedRemaining] = useState("");
  const [unresolvedFollowUp, setUnresolvedFollowUp] = useState("");
  const [unresolvedUrgency, setUnresolvedUrgency] = useState<"low" | "medium" | "high">("medium");
  const [sessionBusy, setSessionBusy] = useState(false);
  const [snapshotAcceptedAt, setSnapshotAcceptedAt] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const supportingQuery = useMemo(
    () => (supportingChildIds.length ? `?supporting=${supportingChildIds.join(",")}` : ""),
    [supportingChildIds],
  );

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/teacher/live/${dayLessonId}${supportingQuery}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Unable to load live classroom.");
      }
      const nextBoard = data.board as LiveClassroomBoard;
      setBoard(nextBoard);
      if (nextBoard.viewer?.myActiveSession?.snapshotAcceptedAt) {
        setSnapshotAcceptedAt(nextBoard.viewer.myActiveSession.snapshotAcceptedAt);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load live classroom.");
      if (!opts?.silent) setBoard(null);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [dayLessonId, supportingQuery]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- board bootstrap on mount/query change
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void load({ silent: true });
      setNowTick(Date.now());
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    async function beat() {
      try {
        await fetch("/api/teacher/presence", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dayLessonId }),
        });
      } catch {
        // ignore
      }
    }
    void beat();
    const timer = window.setInterval(() => {
      if (!cancelled) void beat();
    }, 25_000);

    function goOffline() {
      const payload = JSON.stringify({ dayLessonId, offline: true });
      if (navigator.sendBeacon) {
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon("/api/teacher/presence", blob);
      }
    }
    window.addEventListener("pagehide", goOffline);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("pagehide", goOffline);
      goOffline();
    };
  }, [dayLessonId]);

  const selected = board?.students.find((row) => row.childId === selectedChildId) ?? null;
  const mySession = board?.viewer?.myActiveSession ?? null;
  const myAssignment = board?.viewer?.myAssignment ?? null;
  const supportingSelected = Boolean(
    selected
    && mySession
    && mySession.childId === selected.childId,
  );
  const assignedSelected = Boolean(
    selected
    && (selected.assignedToMe || myAssignment?.childId === selected.childId),
  );

  const secondsRemaining = useMemo(() => {
    if (!mySession?.plannedEndsAt) return null;
    return Math.ceil((Date.parse(mySession.plannedEndsAt) - nowTick) / 1000);
  }, [mySession?.plannedEndsAt, nowTick]);

  async function claimAssignment(childId: string) {
    setJoining(true);
    setJoinMessage(null);
    try {
      const response = await fetch(`/api/teacher/live/${dayLessonId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign", childId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Unable to claim assignment.");
      }
      if (data.board) setBoard(data.board as LiveClassroomBoard);
      setJoinMessage(typeof data.message === "string" ? data.message : "Assignment claimed — accept to start.");
    } catch (cause) {
      setJoinMessage(cause instanceof Error ? cause.message : "Unable to claim assignment.");
    } finally {
      setJoining(false);
    }
  }

  async function acceptAssignment(childId: string) {
    setJoining(true);
    setJoinMessage(null);
    try {
      const response = await fetch(`/api/teacher/live/${dayLessonId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accept",
          childId,
          queueEntryId: board?.viewer?.myAssignment?.queueEntryId,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Unable to accept assignment.");
      }
      setSupportingChildIds((prev) => (prev.includes(childId) ? prev : [...prev, childId]));
      if (data.board) setBoard(data.board as LiveClassroomBoard);
      if (data.snapshot?.acceptedAt) setSnapshotAcceptedAt(data.snapshot.acceptedAt);
      setJoinMessage(typeof data.message === "string" ? data.message : "Session accepted.");
    } catch (cause) {
      setJoinMessage(cause instanceof Error ? cause.message : "Unable to accept assignment.");
    } finally {
      setJoining(false);
    }
  }

  async function releaseAssignment(childId: string) {
    setJoining(true);
    setJoinMessage(null);
    try {
      const response = await fetch(`/api/teacher/live/${dayLessonId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "release",
          childId,
          queueEntryId: board?.viewer?.myAssignment?.queueEntryId,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Unable to release assignment.");
      }
      if (data.board) setBoard(data.board as LiveClassroomBoard);
      setJoinMessage(typeof data.message === "string" ? data.message : "Assignment released.");
    } catch (cause) {
      setJoinMessage(cause instanceof Error ? cause.message : "Unable to release assignment.");
    } finally {
      setJoining(false);
    }
  }

  async function saveNotes() {
    if (!mySession) return;
    setSessionBusy(true);
    try {
      const response = await fetch(`/api/teacher/human-support/sessions/${mySession.sessionId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "notes", notes: { privateNotes } }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Unable to save notes.");
      setJoinMessage("Private notes saved.");
    } catch (cause) {
      setJoinMessage(cause instanceof Error ? cause.message : "Unable to save notes.");
    } finally {
      setSessionBusy(false);
    }
  }

  async function sendGuidance() {
    if (!mySession) return;
    setSessionBusy(true);
    try {
      const response = await fetch(`/api/teacher/human-support/sessions/${mySession.sessionId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "guidance", text: guidanceText }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Unable to send guidance.");
      setGuidanceText("");
      setJoinMessage("Guidance sent to student.");
      void load({ silent: true });
    } catch (cause) {
      setJoinMessage(cause instanceof Error ? cause.message : "Unable to send guidance.");
    } finally {
      setSessionBusy(false);
    }
  }

  async function endSession() {
    if (!mySession) return;
    setSessionBusy(true);
    try {
      const body: Record<string, unknown> = {
        outcome: endOutcome,
        outcomeNotes: privateNotes || null,
        sessionNotes: { privateNotes },
      };
      if (endOutcome === "unresolved") {
        body.unresolvedReport = {
          summary: unresolvedSummary,
          whatWasTried: unresolvedTried.split(/\n|;/).map((part) => part.trim()).filter(Boolean),
          remainingDifficulty: unresolvedRemaining,
          recommendedFollowUp: unresolvedFollowUp,
          urgency: unresolvedUrgency,
        };
      }
      const response = await fetch(`/api/teacher/human-support/sessions/${mySession.sessionId}/end`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Unable to end session.");
      setJoinMessage(
        `Session ended (${data.outcomeLabel ?? endOutcome}). Student returns to current question/stage.`,
      );
      setSupportingChildIds((prev) => prev.filter((id) => id !== mySession.childId));
      void load({ silent: true });
    } catch (cause) {
      setJoinMessage(cause instanceof Error ? cause.message : "Unable to end session.");
    } finally {
      setSessionBusy(false);
    }
  }

  if (loading && !board) {
    return <p className="text-sm text-foreground/60">Loading live classroom…</p>;
  }

  if (error && !board) {
    return (
      <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
        {error}
      </div>
    );
  }

  if (!board) {
    return <p className="text-sm text-foreground/60">No live classroom data.</p>;
  }

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.14em] text-foreground/45">Live classroom</p>
        <h1 className="text-2xl font-black text-foreground">
          {board.period.title}
          {board.period.classroomName ? ` · ${board.period.classroomName}` : ""}
        </h1>
        <p className="text-sm text-foreground/60">
          {board.period.startsAt}–{board.period.endsAt}
          {" · "}
          {board.period.subject}
          {board.period.lessonTitle ? ` · ${board.period.lessonTitle}` : ""}
          {" · "}
          {board.period.periodStillActive
            ? `${board.period.minutesRemaining} min remaining`
            : board.period.periodState === "upcoming"
              ? "Not started yet"
              : "Period ended"}
        </p>
        <p className="text-xs text-foreground/50">
          {board.humanSupportSummary}
          <span className="mx-2 text-foreground/30">·</span>
          Refreshing every {POLL_MS / 1000}s
          {error ? <span className="ml-2 text-amber-700 dark:text-amber-200">({error})</span> : null}
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Students", value: board.counts.total },
          { label: "AI assisting", value: board.counts.assisting },
          { label: "AI struggling", value: board.counts.struggling },
          { label: "Teacher required", value: board.counts.teacherRequired },
        ].map((item) => (
          <article key={item.label} className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.1em] text-foreground/45">{item.label}</p>
            <p className="mt-1 text-xl font-bold">{item.value}</p>
          </article>
        ))}
      </section>

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {board.students.map((student) => (
          <li key={student.childId}>
            <button
              type="button"
              onClick={() => {
                setSelectedChildId(student.childId);
                setJoinMessage(null);
              }}
              className={`w-full rounded-xl border px-4 py-3 text-left transition hover:brightness-105 ${GLANCE_STYLES[student.glanceSignal]}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{student.name}</p>
                  <p className="mt-1 text-xs opacity-80">{labelLearning(student.learningState)}</p>
                  <p className="text-xs opacity-80">{labelAi(student.aiSupportState)}</p>
                  <p className="text-xs opacity-80">Teacher: {labelTeacher(student.teacherState)}</p>
                </div>
                <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${GLANCE_DOT[student.glanceSignal]}`} />
              </div>
              {student.stageLabel ? (
                <p className="mt-2 text-[11px] opacity-70">{student.stageLabel}</p>
              ) : null}
            </button>
          </li>
        ))}
      </ul>

      {board.students.length === 0 ? (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground/60">
          No students on this classroom roster.
        </p>
      ) : null}

      {selected ? (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-black/40"
          onClick={() => setSelectedChildId(null)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setSelectedChildId(null);
          }}
          role="presentation"
        >
          <aside
            className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-background shadow-xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-label={`Student context for ${selected.name}`}
          >
            <div className="border-b border-border px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-foreground/45">Student context</p>
                  <h2 className="mt-1 text-xl font-bold">{selected.name}</h2>
                </div>
                <button
                  type="button"
                  className="rounded-lg border border-border px-2 py-1 text-xs text-foreground/60 hover:bg-muted"
                  onClick={() => setSelectedChildId(null)}
                >
                  Close
                </button>
              </div>
              <div className="mt-3 space-y-1 text-sm">
                <p>{labelLearning(selected.learningState)}</p>
                <p>{labelAi(selected.aiSupportState)}</p>
                <p>Teacher: {labelTeacher(selected.teacherState)}</p>
                <p className="text-xs text-foreground/55">
                  {selected.recoveryOutcome === "Not applicable"
                    ? "Recovery: —"
                    : `Recovery: ${selected.recoveryOutcome}`}
                </p>
              </div>
            </div>

            <div className="space-y-5 px-5 py-4 text-sm">
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-foreground/45">Stages</h3>
                {selected.stages.length === 0 ? (
                  <p className="mt-2 text-foreground/55">No linked lesson stages.</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {selected.stages.map((stage) => (
                      <li key={stage.contentId} className="flex justify-between gap-2 text-xs">
                        <span>{stage.label}</span>
                        <span className="text-foreground/50">
                          {stage.completed ? "Done" : stage.status ?? "Not started"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-foreground/45">Current focus</h3>
                <p className="mt-2 text-xs text-foreground/70">
                  Question: {selected.currentQuestionKey ?? "—"}
                </p>
                <p className="text-xs text-foreground/70">
                  Misconception: {selected.misconception ?? "Not captured yet"}
                </p>
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-foreground/45">
                  Recent attempts ({selected.attemptCount})
                </h3>
                {selected.attempts.length === 0 ? (
                  <p className="mt-2 text-foreground/55">No attempts recorded for this period yet.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {selected.attempts.slice(0, 8).map((attempt) => (
                      <li key={`${attempt.createdAt}-${attempt.questionText}`} className="rounded-lg border border-border px-3 py-2 text-xs">
                        <p className={attempt.correct ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}>
                          {attempt.correct ? "Correct" : "Incorrect"}
                        </p>
                        <p className="mt-1 text-foreground/70 line-clamp-2">{attempt.questionText ?? "Question"}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-foreground/45">
                  AI tutor history ({selected.helpTurnCount})
                </h3>
                {selected.tutorHistory.length === 0 ? (
                  <p className="mt-2 text-foreground/55">No AI tutor turns yet — you can still observe.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {selected.tutorHistory.slice().reverse().slice(0, 12).map((turn) => (
                      <li key={`${turn.createdAt}-${turn.hintLevel}-${turn.message.slice(0, 12)}`} className="rounded-lg border border-border px-3 py-2 text-xs">
                        <p className="font-medium">
                          {turn.intent ?? "help"} · {turn.source}
                          {turn.needsTeacher ? " · needs teacher" : ""}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-foreground/70">{turn.message}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-xl border border-border bg-card p-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-foreground/45">
                  Human support session
                </h3>
                <p className="mt-2 text-xs text-foreground/60">
                  Observe always. Claim → Accept freezes an immutable snapshot, then start timed support. AI-first eligibility cannot be bypassed.
                </p>

                {supportingSelected && mySession ? (
                  <div className="mt-3 space-y-3 text-xs">
                    <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2">
                      <p className="font-semibold text-rose-800 dark:text-rose-100">Active session</p>
                      <p className="mt-1 text-foreground/70">
                        Budget {mySession.budgetMinutes}m ·{" "}
                        {secondsRemaining == null
                          ? "—"
                          : secondsRemaining >= 0
                            ? `${Math.floor(secondsRemaining / 60)}:${String(secondsRemaining % 60).padStart(2, "0")} left`
                            : `Overrun ${Math.floor(Math.abs(secondsRemaining) / 60)}:${String(Math.abs(secondsRemaining) % 60).padStart(2, "0")}`}
                        {(mySession.exceededBudget || (secondsRemaining != null && secondsRemaining < 0))
                          ? " · overrun logged at end"
                          : ""}
                      </p>
                      <p className="mt-1 text-foreground/55">
                        Accepted snapshot: {snapshotAcceptedAt ?? mySession.snapshotAcceptedAt ?? "—"}
                      </p>
                      <p className="text-foreground/55">
                        Live updates: attempts / AI history below refresh every {POLL_MS / 1000}s (beside snapshot, not inside it).
                      </p>
                    </div>

                    <label className="block">
                      <span className="text-foreground/55">Private tutor notes (not shown to student)</span>
                      <textarea
                        value={privateNotes}
                        onChange={(event) => setPrivateNotes(event.target.value)}
                        rows={3}
                        className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={sessionBusy}
                      onClick={() => void saveNotes()}
                      className="rounded-lg border border-border px-3 py-1.5 font-semibold disabled:opacity-50"
                    >
                      Save notes
                    </button>

                    <label className="block">
                      <span className="text-foreground/55">Teacher guidance (one-way to student)</span>
                      <input
                        value={guidanceText}
                        onChange={(event) => setGuidanceText(event.target.value)}
                        maxLength={280}
                        placeholder="Remember to look at paragraph 3."
                        className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={sessionBusy || guidanceText.trim().length < 2}
                      onClick={() => void sendGuidance()}
                      className="rounded-lg border border-sky-500/40 bg-sky-500/15 px-3 py-1.5 font-semibold text-sky-900 dark:text-sky-100 disabled:opacity-50"
                    >
                      Send guidance
                    </button>

                    <label className="block">
                      <span className="text-foreground/55">End outcome</span>
                      <select
                        value={endOutcome}
                        onChange={(event) => setEndOutcome(event.target.value)}
                        className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                      >
                        <option value="resolved">Resolved</option>
                        <option value="partially_resolved">Needs monitoring</option>
                        <option value="unresolved">Unresolved</option>
                        <option value="escalated">Escalated</option>
                        <option value="period_ended">Period ended</option>
                      </select>
                    </label>

                    {endOutcome === "unresolved" ? (
                      <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
                        <p className="font-semibold text-amber-900 dark:text-amber-100">Mandatory unresolved report</p>
                        <input
                          value={unresolvedSummary}
                          onChange={(event) => setUnresolvedSummary(event.target.value)}
                          placeholder="Summary"
                          className="w-full rounded-md border border-border bg-background px-2 py-1.5"
                        />
                        <textarea
                          value={unresolvedTried}
                          onChange={(event) => setUnresolvedTried(event.target.value)}
                          placeholder="What was tried (one per line)"
                          rows={2}
                          className="w-full rounded-md border border-border bg-background px-2 py-1.5"
                        />
                        <input
                          value={unresolvedRemaining}
                          onChange={(event) => setUnresolvedRemaining(event.target.value)}
                          placeholder="Remaining difficulty"
                          className="w-full rounded-md border border-border bg-background px-2 py-1.5"
                        />
                        <input
                          value={unresolvedFollowUp}
                          onChange={(event) => setUnresolvedFollowUp(event.target.value)}
                          placeholder="Recommended follow-up"
                          className="w-full rounded-md border border-border bg-background px-2 py-1.5"
                        />
                        <select
                          value={unresolvedUrgency}
                          onChange={(event) => setUnresolvedUrgency(event.target.value as "low" | "medium" | "high")}
                          className="w-full rounded-md border border-border bg-background px-2 py-1.5"
                        >
                          <option value="low">Urgency: low</option>
                          <option value="medium">Urgency: medium</option>
                          <option value="high">Urgency: high</option>
                        </select>
                      </div>
                    ) : null}

                    <button
                      type="button"
                      disabled={sessionBusy}
                      onClick={() => void endSession()}
                      className="rounded-lg border border-rose-500/50 bg-rose-500/15 px-3 py-2 font-semibold text-rose-800 dark:text-rose-100 disabled:opacity-50"
                    >
                      {sessionBusy ? "Ending…" : "End session"}
                    </button>
                    <p className="text-[11px] text-foreground/50">
                      Default return: resume current question/stage (no skip).
                    </p>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!selected.canJoinAsHumanTutor || joining || assignedSelected || supportingSelected}
                      onClick={() => void claimAssignment(selected.childId)}
                      className={`inline-flex rounded-lg px-3 py-2 text-xs font-semibold transition ${
                        selected.canJoinAsHumanTutor && !assignedSelected
                          ? "border border-amber-500/50 bg-amber-500/15 text-amber-900 hover:bg-amber-500/25 dark:text-amber-100"
                          : "cursor-not-allowed border border-border bg-muted/40 text-foreground/40"
                      }`}
                    >
                      {joining ? "Working…" : "Claim assignment"}
                    </button>
                    <button
                      type="button"
                      disabled={!assignedSelected || joining}
                      onClick={() => void acceptAssignment(selected.childId)}
                      className={`inline-flex rounded-lg px-3 py-2 text-xs font-semibold transition ${
                        assignedSelected
                          ? "border border-rose-500/50 bg-rose-500/15 text-rose-800 hover:bg-rose-500/25 dark:text-rose-100"
                          : "cursor-not-allowed border border-border bg-muted/40 text-foreground/40"
                      }`}
                    >
                      {joining ? "Working…" : "Accept support"}
                    </button>
                    <button
                      type="button"
                      disabled={!assignedSelected || joining}
                      onClick={() => void releaseAssignment(selected.childId)}
                      className={`inline-flex rounded-lg px-3 py-2 text-xs font-semibold transition ${
                        assignedSelected
                          ? "border border-border bg-card text-foreground/80 hover:bg-muted/50"
                          : "cursor-not-allowed border border-border bg-muted/40 text-foreground/40"
                      }`}
                    >
                      Decline
                    </button>
                  </div>
                )}

                {!selected.canJoinAsHumanTutor && !assignedSelected && !supportingSelected ? (
                  <p className="mt-2 text-[11px] text-foreground/50">
                    Intervene locked — AI is still first tutor
                    {selected.aiSupportState !== "exhausted" ? " (not exhausted yet)" : ""}
                    {selected.studentRecovered ? " (student recovered)" : ""}
                    {!selected.assignmentStillActive ? " (assignment finished)" : ""}
                    {!selected.periodStillActive ? " (period not active)" : ""}
                    .
                  </p>
                ) : null}
                {assignedSelected && !supportingSelected ? (
                  <p className="mt-2 text-[11px] text-foreground/60">
                    Assignment held — accept to freeze snapshot and become busy.
                  </p>
                ) : null}
                {joinMessage ? (
                  <p className="mt-2 text-[11px] text-foreground/70">{joinMessage}</p>
                ) : null}
              </section>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
