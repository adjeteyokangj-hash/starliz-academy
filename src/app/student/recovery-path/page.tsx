"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import { resolveCatchUpStartTarget } from "@/lib/student-dashboard-actions";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";
import { resolveRecoverySeverityChips } from "@/lib/recovery-task-severity";

type CatchUpRecommendation = {
  id: string;
  title: string;
  subject: string;
  topic?: string | null;
  studentFriendlyReason?: string;
  reason: string;
  estimatedMinutes: number;
  status: "recommended" | "scheduled" | "active" | "in_progress" | "completed" | "skipped" | "waived" | "overdue";
  routeTarget?: string | null;
};

type CatchUpTask = {
  taskId: string;
  recommendationId: string;
  title: string;
  subject: string;
  topic?: string | null;
  skill?: string | null;
  status: "recommended" | "scheduled" | "active" | "in_progress" | "completed" | "skipped" | "waived" | "overdue";
  priority?: "high" | "medium" | "low";
  estimatedMinutes: number;
  dueDate?: string | null;
  scheduledDay?: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | null;
  routeTarget?: string | null;
};

type StudentAcademicIntelligencePayload = {
  catchUpRecommendations: CatchUpRecommendation[];
  catchUpTasks?: CatchUpTask[];
};

type DashboardSummaryPayload = {
  child?: {
    id?: string;
    name?: string;
  };
};

type StudentLearningStatePayload = {
  learningState?: {
    isFirstTimeStudent?: boolean;
    coachUnlocked?: boolean;
  };
};

type TaskAction = "start_task" | "complete_task" | "skip_task";

function statusTone(status: CatchUpTask["status"]): string {
  if (status === "completed") return "bg-emerald-100 text-emerald-700";
  if (status === "overdue") return "bg-rose-100 text-rose-700";
  if (status === "active" || status === "in_progress" || status === "scheduled") return "bg-cyan-100 text-cyan-700";
  return "bg-amber-100 text-amber-700";
}

function taskPriority(status: CatchUpTask["status"]): number {
  switch (status) {
    case "overdue": return 0;
    case "in_progress": return 1;
    case "active": return 2;
    case "scheduled": return 3;
    case "recommended": return 4;
    case "completed": return 5;
    case "skipped": return 6;
    case "waived": return 7;
    default: return 8;
  }
}

export default function RecoveryPathPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedStudentId = searchParams.get("studentId")?.trim() || null;
  const [childName, setChildName] = useState("Learner");
  const [activeChildId, setActiveChildId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [learningState, setLearningState] = useState<StudentLearningStatePayload["learningState"] | null>(null);
  const [academic, setAcademic] = useState<StudentAcademicIntelligencePayload | null>(null);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [coachPanelOpen, setCoachPanelOpen] = useState(() => searchParams.get("view") === "coach");
  const [coachState, setCoachState] = useState<"stuck" | "rushed" | "nervous" | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRecoveryPath() {
      setLoading(true);
      setError("");
      setActionMessage(null);

      try {
        const summaryParam = requestedStudentId
          ? `studentId=${encodeURIComponent(requestedStudentId)}`
          : "";
        const summaryRes = await fetch(`/api/student/dashboard-summary${summaryParam ? `?${summaryParam}` : ""}`, { credentials: "include" });
        if (!summaryRes.ok) {
          throw new Error("Unable to load Recovery Path right now.");
        }

        const summaryPayload = (await summaryRes.json().catch(() => null)) as DashboardSummaryPayload | null;
        const childId = summaryPayload?.child?.id ?? null;
        if (!childId) {
          throw new Error("Choose a learner profile first.");
        }

        if (cancelled) return;
        setChildName(summaryPayload?.child?.name || "Learner");
        setActiveChildId(childId);

        const studentParam = `studentId=${encodeURIComponent(childId)}`;
        const [academicRes, learningStateRes] = await Promise.all([
          fetch(`/api/student/academic-intelligence?${studentParam}`, { credentials: "include" }),
          fetch(`/api/student/learning-state?${studentParam}`, { credentials: "include" }),
        ]);

        if (!academicRes.ok) {
          throw new Error("Recovery Path data is not available yet.");
        }

        const academicPayload = (await academicRes.json()) as StudentAcademicIntelligencePayload;
        const learningStatePayload = learningStateRes.ok
          ? (await learningStateRes.json()) as StudentLearningStatePayload
          : {} as StudentLearningStatePayload;

        if (cancelled) return;
        setAcademic(academicPayload);
        setLearningState(learningStatePayload.learningState ?? null);
      } catch (err) {
        if (!cancelled) {
          setAcademic(null);
          setError(err instanceof Error ? err.message : "Unable to load Recovery Path right now.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadRecoveryPath();

    return () => {
      cancelled = true;
    };
  }, [requestedStudentId]);

  const recommendationReasonMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of academic?.catchUpRecommendations ?? []) {
      map.set(row.id, row.studentFriendlyReason ?? row.reason ?? "Targeted recovery task from your learning map.");
    }
    return map;
  }, [academic?.catchUpRecommendations]);

  const tasks = useMemo(() => {
    return [...(academic?.catchUpTasks ?? [])].sort((a, b) => {
      const priorityDiff = taskPriority(a.status) - taskPriority(b.status);
      if (priorityDiff !== 0) return priorityDiff;
      return a.title.localeCompare(b.title);
    });
  }, [academic?.catchUpTasks]);

  const pendingTasks = tasks.filter((task) => !["completed", "waived", "skipped"].includes(task.status));
  const completedCount = tasks.filter((task) => task.status === "completed").length;
  const coachEnabled = learningState?.coachUnlocked === true;
  const coachTask = pendingTasks[0] ?? tasks[0] ?? null;
  const coachTaskReason = coachTask
    ? recommendationReasonMap.get(coachTask.recommendationId) ?? "Targeted recovery task from your learning map."
    : "";
  const coachTaskStartTarget = coachTask ? resolveCatchUpStartTarget(coachTask) : null;
  const coachSeverityChips = coachTask
    ? resolveRecoverySeverityChips({
      status: coachTask.status,
      reason: coachTaskReason,
      priority: coachTask.priority,
      dueDate: coachTask.dueDate,
    })
    : [];

  async function handleTaskAction(task: CatchUpTask, action: TaskAction) {
    setPendingTaskId(task.taskId);
    setError("");

    try {
      const response = await fetchWithRefreshRetry("/api/student/academic-intelligence/catch-up-tasks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.taskId, action }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to update recovery task.");
      }

      if (action === "start_task") {
        const startTarget = resolveCatchUpStartTarget(task);
        if (startTarget.kind === "route") {
          setActionMessage(`${task.title} started.`);
          router.push(startTarget.href);
          return;
        }

        setActionMessage(startTarget.message || "Waiting for recovery activity.");
      } else if (action === "complete_task") {
        setActionMessage(`${task.title} marked complete.`);
      } else {
        setActionMessage(`${task.title} skipped for now.`);
      }

      const studentParam = activeChildId ? `studentId=${encodeURIComponent(activeChildId)}` : "";
      const refreshRes = await fetch(`/api/student/academic-intelligence${studentParam ? `?${studentParam}` : ""}`, { credentials: "include" });
      if (refreshRes.ok) {
        const refreshPayload = (await refreshRes.json()) as StudentAcademicIntelligencePayload;
        setAcademic(refreshPayload);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update recovery task.");
    } finally {
      setPendingTaskId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f8ff] text-slate-900">
      <Navbar />
      <section className="mx-auto max-w-5xl px-6 py-8">
        <div className="rounded-3xl border border-cyan-200 bg-cyan-50/70 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700">Recovery Path</p>
              <h1 className="mt-1 text-2xl font-black text-slate-900">{childName}&apos;s Recovery Path</h1>
              <p className="mt-1 text-sm text-cyan-900">Clear reasons, clear actions, and a direct route to your next recovery activity.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/student/dashboard"
                className="rounded-xl border border-cyan-200 bg-white px-4 py-2 text-sm font-bold text-cyan-800 hover:bg-cyan-100"
              >
                Back to dashboard
              </Link>
              {coachEnabled ? (
                <button
                  type="button"
                  onClick={() => {
                    setCoachPanelOpen((current) => !current);
                    setActionMessage(null);
                  }}
                  className="rounded-xl bg-cyan-700 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-600"
                >
                  {coachPanelOpen ? "Hide Coach warm-up" : "Ask Coach first"}
                </button>
              ) : null}
            </div>
          </div>

          {coachEnabled && coachPanelOpen ? (
            <div className="mt-4 rounded-2xl border border-cyan-200 bg-white p-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700">Coach Warm-up</p>
              <h2 className="mt-1 text-base font-black text-slate-900">Pick your starting mode, then launch your recovery task</h2>
              <p className="mt-1 text-sm text-slate-700">Coach will tailor your first 60 seconds so you enter the task with focus.</p>

              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  { key: "stuck", label: "I feel stuck" },
                  { key: "rushed", label: "I am rushing" },
                  { key: "nervous", label: "I am not confident yet" },
                ].map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setCoachState(option.key as "stuck" | "rushed" | "nervous")}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${coachState === option.key ? "bg-cyan-700 text-white" : "border border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-100"}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {coachTask ? (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-600">Today&apos;s focus</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">
                    {coachTask.subject}
                    {coachTask.topic ? ` • ${coachTask.topic}` : ""}
                    {` • ${coachTask.estimatedMinutes} min`}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">{coachTaskReason}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {coachSeverityChips.map((chip) => (
                      <span key={chip.key} className={`rounded-full px-2 py-0.5 text-xs font-bold ${chip.className}`}>
                        {chip.label}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  You are currently clear on recovery tasks. Use this warm-up next time a task appears.
                </div>
              )}

              <div className="mt-3 rounded-xl border border-cyan-100 bg-cyan-50/70 p-3 text-sm text-cyan-900">
                <p className="font-bold">60-second coach routine</p>
                <p className="mt-1">{coachState === "stuck"
                  ? "Step 1: Say the task goal out loud. Step 2: Find one clue in the question. Step 3: Start with one confident step."
                  : coachState === "rushed"
                    ? "Step 1: Slow your first read. Step 2: Underline key values or words. Step 3: Answer only after checking once."
                    : coachState === "nervous"
                      ? "Step 1: Recall one example you already solved. Step 2: Match this task to that pattern. Step 3: Write your first line before judging it."
                      : "Step 1: Breathe in for 4 and out for 4. Step 2: Read the task goal. Step 3: Start with the first obvious step."}</p>
              </div>

              {coachTask && coachTaskStartTarget?.kind === "route" ? (
                <button
                  type="button"
                  disabled={pendingTaskId === coachTask.taskId}
                  onClick={() => void handleTaskAction(coachTask, "start_task")}
                  className="mt-3 rounded-xl bg-cyan-700 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-600 disabled:opacity-60"
                >
                  Start warm-up task: {coachTaskStartTarget.label}
                </button>
              ) : null}
            </div>
          ) : null}

          {actionMessage ? (
            <p className="mt-3 rounded-xl border border-cyan-200 bg-white px-3 py-2 text-sm text-cyan-900">{actionMessage}</p>
          ) : null}

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-cyan-200 bg-white px-3 py-2">
              <p className="text-xs uppercase tracking-[0.08em] text-cyan-700">Pending</p>
              <p className="mt-1 text-lg font-black text-cyan-900">{pendingTasks.length}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-white px-3 py-2">
              <p className="text-xs uppercase tracking-[0.08em] text-emerald-700">Completed</p>
              <p className="mt-1 text-lg font-black text-emerald-900">{completedCount}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p className="text-xs uppercase tracking-[0.08em] text-slate-600">Total tasks</p>
              <p className="mt-1 text-lg font-black text-slate-900">{tasks.length}</p>
            </div>
          </div>

          {loading ? (
            <div className="mt-4 space-y-3">
              <div className="h-16 animate-pulse rounded-2xl bg-cyan-100" />
              <div className="h-16 animate-pulse rounded-2xl bg-cyan-100" />
            </div>
          ) : error ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {error}
            </div>
          ) : learningState?.isFirstTimeStudent ? (
            <div className="mt-4 rounded-2xl border border-cyan-200 bg-white/80 p-4 text-sm text-cyan-900">
              Recovery Path unlocks after your Quick Level Finder and first learning activities.
            </div>
          ) : tasks.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              No recovery tasks right now. You are on track.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {tasks.map((task) => {
                const reason = recommendationReasonMap.get(task.recommendationId) ?? "Targeted recovery task from your learning map.";
                const severityChips = resolveRecoverySeverityChips({
                  status: task.status,
                  reason,
                  priority: task.priority,
                  dueDate: task.dueDate,
                });
                const canStart = ["recommended", "scheduled", "active", "overdue"].includes(task.status);
                const canComplete = task.status === "in_progress";
                const canSkip = !["completed", "skipped", "waived"].includes(task.status);
                const startTarget = resolveCatchUpStartTarget(task);
                const startDisabled = startTarget.kind !== "route";
                const disabledHint = startDisabled ? "Waiting for recovery activity" : null;

                return (
                  <article key={task.taskId} className="rounded-2xl border border-cyan-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-bold text-slate-900">{task.title}</p>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${statusTone(task.status)}`}>
                        {task.status.replaceAll("_", " ")}
                      </span>
                    </div>

                    <p className="mt-1 text-xs uppercase tracking-[0.08em] text-slate-500">
                      {task.subject}
                      {task.topic ? ` • ${task.topic}` : ""}
                      {task.scheduledDay ? ` • ${task.scheduledDay}` : ""}
                      {` • ${task.estimatedMinutes} min`}
                    </p>

                    <p className="mt-2 text-sm text-slate-700">{reason}</p>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {severityChips.map((chip) => (
                        <span key={chip.key} className={`rounded-full px-2 py-0.5 text-xs font-bold ${chip.className}`}>
                          {chip.label}
                        </span>
                      ))}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {canStart ? (
                        <button
                          type="button"
                          disabled={pendingTaskId === task.taskId || startDisabled}
                          onClick={() => void handleTaskAction(task, "start_task")}
                          className="rounded-xl bg-cyan-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {startDisabled ? "Waiting for recovery activity" : startTarget.label}
                        </button>
                      ) : null}
                      {canComplete ? (
                        <button
                          type="button"
                          disabled={pendingTaskId === task.taskId}
                          onClick={() => void handleTaskAction(task, "complete_task")}
                          className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-60"
                        >
                          Complete
                        </button>
                      ) : null}
                      {canSkip ? (
                        <button
                          type="button"
                          disabled={pendingTaskId === task.taskId}
                          onClick={() => void handleTaskAction(task, "skip_task")}
                          className="rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-500 disabled:opacity-60"
                        >
                          Skip
                        </button>
                      ) : null}
                    </div>

                    {disabledHint ? (
                      <p className="mt-2 text-xs font-semibold text-amber-700">{disabledHint}</p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
