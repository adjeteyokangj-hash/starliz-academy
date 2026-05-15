"use client";

import type { DashboardProps } from "./dashboardTypes";

function accuracyBand(accuracy: number): { label: string; color: string } {
  if (accuracy >= 80) return { label: "Strong", color: "text-emerald-700 bg-emerald-100" };
  if (accuracy >= 60) return { label: "Developing", color: "text-amber-700 bg-amber-100" };
  return { label: "Needs Work", color: "text-rose-700 bg-rose-100" };
}

function subjectLabel(subject: string): string {
  if (subject === "math") return "Mathematics";
  if (subject === "reading") return "English / Reading";
  if (subject === "lesson" || subject === "ai_daily" || subject === "daily") return "Daily Revision";
  return subject.charAt(0).toUpperCase() + subject.slice(1);
}

function assignmentSessionLabel(title: string, skillFocus?: string | null): string {
  if (skillFocus?.trim()) return `${title} · ${skillFocus.trim()}`;
  return title;
}

export default function SecondaryDashboard({
  childName,
  stats,
  visibleAssignments,
  skills,
  coachRows,
  focusAssignment,
  weakAssignment,
  reviewAssignment,
  bossUnlocked,
  bossPlayedToday,
  sessionSummary,
  loading,
  error,
  startingJourney,
  onStartJourney,
  onStartAssignment,
}: DashboardProps) {
  const masteredCount = skills.filter((s) => s.status === "mastered").length;
  const weakCount = skills.filter((s) => s.status === "weak").length;
  const improvingCount = skills.filter((s) => s.status === "improving").length;
  const priorityAssignments = [focusAssignment, weakAssignment, reviewAssignment]
    .filter((assignment, index, array): assignment is NonNullable<typeof assignment> => {
      return Boolean(assignment) && array.findIndex((candidate) => candidate?.id === assignment?.id) === index;
    })
    .slice(0, 3);
  const sessionAssignments = priorityAssignments.length > 0 ? priorityAssignments : visibleAssignments.slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-400">Study Dashboard</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">{childName}</h1>
        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Study Streak</p>
            <p className="mt-1 text-lg font-black text-slate-900">🔥 {stats.streak}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">XP Earned</p>
            <p className="mt-1 text-lg font-black text-slate-900">{stats.xp}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Mastered</p>
            <p className="mt-1 text-lg font-black text-emerald-700">{masteredCount}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Improving</p>
            <p className="mt-1 text-lg font-black text-amber-700">{improvingCount}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Focus Areas</p>
            <p className="mt-1 text-lg font-black text-rose-700">{weakCount}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Stars</p>
            <p className="mt-1 text-lg font-black text-slate-900">⭐ {stats.stars}</p>
          </div>
        </div>
      </header>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-slate-600">
          Loading your study plan...
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700">{error}</div>
      )}

      {/* Daily Study Session */}
      <section className="rounded-3xl border border-indigo-200 bg-indigo-950 p-6 text-indigo-50">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-indigo-300">Today&apos;s Session</p>
        <h2 className="mt-2 text-xl font-black">Adaptive Study Session</h2>
        {sessionAssignments.length > 0 ? (
          <div className="mt-3 space-y-2 text-sm text-indigo-100">
            {sessionAssignments.map((assignment, index) => (
              <button
                key={assignment.id}
                type="button"
                onClick={() => onStartAssignment(assignment)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-indigo-800 bg-indigo-900/70 px-4 py-3 text-left transition hover:bg-indigo-900"
              >
                <span>
                  {index + 1}. {assignmentSessionLabel(assignment.title, assignment.skillFocus)}
                </span>
                <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-indigo-300">
                  {subjectLabel(assignment.subject)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-sm text-indigo-200">
            No assigned tasks are queued yet. Starting this session will open adaptive revision for today.
          </p>
        )}
        <p className="mt-3 text-sm text-indigo-200">Estimated time: {Math.max(7, sessionAssignments.length * 4)} minutes.</p>
        <button
          type="button"
          onClick={() => void onStartJourney()}
          disabled={startingJourney || loading}
          className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-indigo-400 px-5 py-3 font-black text-indigo-950 hover:bg-indigo-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {startingJourney ? "Starting session..." : "Begin Session"}
        </button>
      </section>

      {/* Assigned Tasks */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-400">Assigned Work</p>
        <h2 className="mt-1 text-lg font-black text-slate-900">Your Study Tasks</h2>
        {!loading && visibleAssignments.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No tasks assigned yet. Your study session above will cover adaptive revision.</p>
        ) : (
          <div className="mt-4 divide-y divide-slate-100">
            {visibleAssignments.slice(0, 8).map((assignment) => (
              <div key={assignment.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-800 truncate">{assignment.title}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{subjectLabel(assignment.subject)}{assignment.skillFocus ? ` · ${assignment.skillFocus}` : ""}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    assignment.status === "in_progress"
                      ? "bg-amber-100 text-amber-700"
                      : assignment.status === "completed"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-sky-100 text-sky-700"
                  }`}>
                    {assignment.status === "in_progress" ? "In Progress" : assignment.status === "completed" ? "Complete" : "Not Started"}
                  </span>
                  <button
                    type="button"
                    onClick={() => onStartAssignment(assignment)}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700"
                  >
                    {assignment.status === "in_progress" ? "Continue" : "Start"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Skill Mastery */}
      {coachRows.length > 0 && (
        <section className="rounded-3xl border border-slate-200 bg-white p-6">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-400">Skill Tracker</p>
          <h2 className="mt-1 text-lg font-black text-slate-900">Your Progress</h2>
          <div className="mt-4 space-y-3">
            {coachRows.map((row) => {
              const band = accuracyBand(row.accuracy);
              return (
                <div key={row.code} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-800">{row.label}</p>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${band.color}`}>{band.label}</span>
                      <span className="text-sm font-bold text-slate-600">{row.accuracy}%</span>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full transition-all ${
                        row.accuracy >= 80 ? "bg-emerald-500" : row.accuracy >= 60 ? "bg-amber-500" : "bg-rose-500"
                      }`}
                      style={{ width: `${row.accuracy}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Session insights */}
      {sessionSummary && (
        <section className="rounded-3xl border border-slate-200 bg-white p-6">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-400">Last Session</p>
          <h2 className="mt-1 text-lg font-black text-slate-900">Session Insights</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              { label: "Engagement", value: sessionSummary.engagementLevel },
              { label: "Confidence", value: sessionSummary.learningConfidence },
              { label: "Session Mood", value: sessionSummary.dominantMood?.replace("_", " ") },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                <p className="mt-1 text-sm font-bold capitalize text-slate-900">{value ?? "—"}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Boss Battle (academic framing) */}
      {bossUnlocked && (
        <section className="rounded-3xl border border-slate-300 bg-slate-900 p-6 text-slate-100">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-400">Assessment Challenge</p>
          <h2 className="mt-1 text-lg font-black">Progress Check Unlocked</h2>
          {bossPlayedToday ? (
            <p className="mt-2 text-sm text-slate-400">{"You've already completed today's challenge. Check back tomorrow."}</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-slate-300">Test your skills across everything you have studied. Good luck!</p>
              <a
                href="/games/boss-battle"
                className="mt-4 inline-flex rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-slate-900 hover:bg-slate-200"
              >
                Take Challenge
              </a>
            </>
          )}
        </section>
      )}
    </div>
  );
}
