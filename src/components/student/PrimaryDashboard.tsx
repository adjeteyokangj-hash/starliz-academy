"use client";

import type { DashboardProps } from "./dashboardTypes";
import StudyPlanBadge from "@/components/learning/StudyPlanBadge";
import { deriveStudyPlanProgress } from "@/lib/study-plan";

function tagTone(status: string): string {
  if (status === "mastered") return "bg-emerald-100 text-emerald-700";
  if (status === "improving") return "bg-amber-100 text-amber-700";
  return "bg-rose-100 text-rose-700";
}

function subjectEmoji(subject: string): string {
  if (subject === "math") return "➕";
  if (subject === "reading") return "📖";
  if (subject === "lesson" || subject === "ai_daily") return "🎯";
  return "📝";
}

function assignmentStepLabel(title: string, skillFocus?: string | null): string {
  if (skillFocus?.trim()) return `${title} · ${skillFocus.trim()}`;
  return title;
}

export default function PrimaryDashboard({
  childName,
  stats,
  visibleAssignments,
  coachRows,
  focusAssignment,
  weakAssignment,
  reviewAssignment,
  bossUnlocked,
  bossPlayedToday,
  ownedBadges,
  sessionSummary,
  learningState,
  placementLevels,
  loading,
  error,
  startingJourney,
  onStartJourney,
  onStartAssignment,
  onStartBossBattle,
  bossLaunching,
  onOpenStore,
  pendingAssignmentId,
  openingStore,
}: DashboardProps) {
  const journeyAssignments = [focusAssignment, weakAssignment, reviewAssignment]
    .filter((assignment, index, array): assignment is NonNullable<typeof assignment> => {
      return Boolean(assignment) && array.findIndex((candidate) => candidate?.id === assignment?.id) === index;
    })
    .slice(0, 3);
  const todayJourney = journeyAssignments;
  const isFirstTimeStudent = Boolean(learningState?.isFirstTimeStudent);
  const coachAwaitingAssessment = !learningState?.coachUnlocked;
  const showRegularJourney = !isFirstTimeStudent;
  const showEmptyAssignmentState = showRegularJourney && todayJourney.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <header>
        <h1 className="text-3xl font-black tracking-tight text-slate-950">Hi {childName} 👋</h1>
        <p className="mt-2 text-slate-600">{"Ready for today's learning adventure?"}</p>
      </header>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "⭐ Stars", value: stats.stars },
          { label: "✨ XP", value: stats.xp },
          { label: "🪙 Coins", value: stats.coins },
          { label: "🔥 Streak", value: stats.streak },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-black text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      {/* AI Learning Signals */}
      {sessionSummary && (
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">AI Learning Signals</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { label: "Learning Confidence", value: learningState?.aiSignalsReady ? sessionSummary.learningConfidence : "Not enough data yet" },
              { label: "Engagement Level", value: learningState?.aiSignalsReady ? sessionSummary.engagementLevel : "Not enough data yet" },
              { label: "Speech Confidence", value: learningState?.aiSignalsReady ? sessionSummary.speechConfidence : "Not enough data yet" },
              { label: "Frustration Signals", value: learningState?.aiSignalsReady ? sessionSummary.frustrationSignals : "Not enough data yet" },
              { label: "Session Mood", value: sessionSummary.dominantMood.replace("_", " ") },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-2xl bg-white px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
                <p className="mt-1 text-sm font-black capitalize text-slate-900">{value ?? "Unknown"}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {placementLevels && Object.keys(placementLevels).length > 0 ? (
        <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Placement Baseline</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(placementLevels).map(([subject, level]) => (
              <div key={subject} className="rounded-xl border border-emerald-200 bg-white p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">{subject}</p>
                <p className="mt-1 text-sm font-black capitalize text-slate-900">{level.level}</p>
                <p className="text-xs font-semibold text-slate-600">Accuracy: {level.accuracy}%</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Today's Journey */}
      <section className="rounded-3xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-sky-50 to-white p-6">
        {isFirstTimeStudent ? (
          <>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-indigo-600">🌟 Welcome</p>
            <h2 className="mt-2 text-2xl font-black text-slate-900">Welcome to StarLiz Academy</h2>
            <p className="mt-2 text-sm text-slate-700">
              We need to learn your level before we build your personalised learning journey.
            </p>
            <ol className="mt-4 space-y-2 text-sm font-semibold text-slate-700">
              <li>1. Choose your subjects</li>
              <li>2. Complete your Quick Level Finder</li>
              <li>3. AI builds your learning path</li>
              <li>4. Lessons unlock automatically</li>
            </ol>
            <button
              type="button"
              onClick={() => {
                window.location.href = "/student/onboarding";
              }}
              className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-indigo-600 px-5 py-4 text-lg font-black text-white shadow-lg shadow-indigo-200 hover:bg-indigo-500"
            >
              Start My Level Finder
            </button>
          </>
        ) : (
          <>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-indigo-600">🌈 Today&apos;s Learning Journey</p>
            {todayJourney.length > 0 ? (
          <div className="mt-4 space-y-2 text-sm font-semibold text-slate-700">
            {todayJourney.map((assignment, index) => (
              <button
                key={assignment.id}
                type="button"
                onClick={() => onStartAssignment(assignment)}
                disabled={pendingAssignmentId === assignment.id}
                className="flex w-full items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-left transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <span>
                  {index + 1}. {pendingAssignmentId === assignment.id ? "Opening..." : assignmentStepLabel(assignment.title, assignment.skillFocus)}
                </span>
                <span className="shrink-0 text-lg">{subjectEmoji(assignment.subject)}</span>
              </button>
            ))}
          </div>
            ) : null}
            {showEmptyAssignmentState ? (
              <p className="mt-4 text-sm text-slate-600">No assigned tasks yet. Ask your teacher/admin to assign work.</p>
            ) : null}
            {todayJourney.length > 0 ? (
              <>
                <p className="mt-4 text-sm text-slate-600">Estimated time: {Math.max(7, todayJourney.length * 4)} minutes</p>
                <button
                  type="button"
                  onClick={() => void onStartJourney()}
                  disabled={startingJourney || loading || todayJourney.length === 0}
                  className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-indigo-600 px-5 py-4 text-lg font-black text-white shadow-lg shadow-indigo-200 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {startingJourney ? "Starting..." : "Start Today's Journey"}
                </button>
              </>
            ) : null}
          </>
        )}
      </section>

      {/* Assigned content */}
      {!loading && visibleAssignments.length > 0 && (
        <section className="rounded-3xl border border-sky-200 bg-sky-50 p-6">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-sky-700">📋 Your Assigned Tasks</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {visibleAssignments.slice(0, 6).map((assignment) => (
              <button
                key={assignment.id}
                type="button"
                onClick={() => onStartAssignment(assignment)}
                disabled={pendingAssignmentId === assignment.id}
                className="rounded-2xl border border-sky-200 bg-white p-4 text-left transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xl">{subjectEmoji(assignment.subject)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    assignment.status === "in_progress" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"
                  }`}>
                    {pendingAssignmentId === assignment.id ? "Opening..." : assignment.status === "in_progress" ? "Continue" : "Start"}
                  </span>
                </div>
                <p className="mt-2 font-bold text-slate-800">{assignment.title}</p>
                {assignment.skillFocus && (
                  <p className="mt-1 text-xs text-slate-500">{assignment.skillFocus}</p>
                )}
                <div className="mt-2">
                  <StudyPlanBadge
                    compact
                    progress={deriveStudyPlanProgress({ status: assignment.status })}
                  />
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Smart Coach */}
      <section className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
        <p className="text-sm font-black uppercase tracking-[0.2em] text-cyan-700">🧠 Smart Coach</p>
        {coachAwaitingAssessment ? (
          <div className="mt-4 rounded-2xl border border-cyan-200 bg-white p-4">
            <h3 className="text-base font-black text-slate-900">Smart Coach is learning about you</h3>
            <p className="mt-1 text-sm text-slate-700">
              Complete your Quick Level Finder and first activities so AI can discover your strengths, confidence, and learning style.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {[
                "Reading Skills",
                "Maths Confidence",
                "Spelling Accuracy",
              ].map((label) => (
                <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-bold text-slate-800">{label}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Awaiting assessment</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-900">
              What unlocks Smart Coach: Quick Level Finder, first lesson attempts, reading practice, spelling practice, maths activities, and voice interactions.
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {coachRows.map((row) => (
              <div key={row.code} className="rounded-2xl bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold text-slate-800">{row.label}</p>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-1 text-xs font-black ${tagTone(row.status)}`}>
                      {row.status}
                    </span>
                    <span className="text-sm font-bold text-slate-600">{row.accuracy}%</span>
                  </div>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full ${row.status === "mastered" ? "bg-emerald-500" : row.status === "improving" ? "bg-amber-500" : "bg-rose-500"}`}
                    style={{ width: `${row.accuracy}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Boss Battle */}
      {bossUnlocked && (
        <section className={`rounded-3xl border p-6 ${bossPlayedToday ? "border-slate-200 bg-slate-50" : "border-rose-200 bg-gradient-to-br from-rose-50 to-orange-50"}`}>
          <p className="text-sm font-black uppercase tracking-[0.2em] text-rose-700">👾 Boss Battle</p>
          {bossPlayedToday ? (
            <p className="mt-2 text-sm text-slate-600">You already fought the boss today. Come back tomorrow!</p>
          ) : (
            <>
              <p className="mt-2 text-slate-700">You have unlocked the boss battle. Can you beat it?</p>
              <button
                type="button"
                onClick={() => {
                  if (!onStartBossBattle) return;
                  void onStartBossBattle();
                }}
                disabled={Boolean(bossLaunching) || !onStartBossBattle}
                className="mt-4 inline-flex rounded-2xl bg-rose-500 px-5 py-3 font-black text-white hover:bg-rose-400"
              >
                {bossLaunching ? "Preparing Boss Battle..." : "Fight Now"}
              </button>
            </>
          )}
        </section>
      )}

      {/* Badge Case */}
      <section className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 p-5">
        <p className="text-sm font-black uppercase tracking-wide text-amber-800">🏅 Badge Case</p>
        {ownedBadges.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {ownedBadges.slice(0, 6).map((badge) => (
              <span key={badge.id} className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-black text-amber-900">
                {badge.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm font-semibold text-amber-900">No badges yet. Perfect-win a Boss Battle to earn one!</p>
        )}
      </section>

      {/* Rewards Store */}
      <section className="rounded-3xl border border-yellow-300 bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50 p-6 shadow-sm">
        <p className="text-sm font-black uppercase tracking-[0.2em] text-yellow-700">🛒 Rewards Store</p>
        <p className="mt-2 font-black text-slate-800">🎁 Unlock fun rewards!</p>
        <p className="mt-1 text-sm text-slate-600">
          You have <span className="font-black text-yellow-700">🪙 {stats.coins} coins ready to spend!</span>
        </p>
        <button
          type="button"
          onClick={onOpenStore}
          disabled={Boolean(openingStore)}
          className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-yellow-400 px-6 py-3 font-black text-yellow-900 shadow-md hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {openingStore ? "Opening..." : "🛍 Open Store"}
        </button>
      </section>

      {loading && (
        <div className="rounded-2xl bg-slate-50 p-5 text-slate-600">Loading your learning journey...</div>
      )}
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-700">{error}</div>
      )}
    </div>
  );
}
