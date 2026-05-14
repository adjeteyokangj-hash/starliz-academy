"use client";

import type { DashboardProps } from "./dashboardTypes";

export default function EarlyYearsDashboard({
  childName,
  stats,
  visibleAssignments,
  bossUnlocked,
  loading,
  error,
  startingJourney,
  onStartJourney,
  onStartAssignment,
  onOpenStore,
}: DashboardProps) {
  const firstAssignment = visibleAssignments[0] ?? null;

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <header className="rounded-3xl bg-gradient-to-br from-violet-100 via-pink-50 to-yellow-50 p-8 text-center">
        <p className="text-5xl">⭐</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">
          Hello, {childName}!
        </h1>
        <p className="mt-2 text-lg font-semibold text-slate-600">{"Let's play and learn today!"}</p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-yellow-100 px-5 py-2 text-yellow-800">
          <span className="text-2xl">⭐</span>
          <span className="text-xl font-black">{stats.stars} stars</span>
        </div>
      </header>

      {/* Loading / Error */}
      {loading && (
        <div className="rounded-2xl bg-violet-50 p-5 text-center font-semibold text-violet-700">
          Getting everything ready for you... ✨
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-center text-rose-700">{error}</div>
      )}

      {/* Big Start Button */}
      <button
        type="button"
        onClick={() => void onStartJourney()}
        disabled={startingJourney || loading}
        className="w-full rounded-3xl bg-gradient-to-r from-indigo-500 to-violet-500 px-8 py-6 text-2xl font-black text-white shadow-xl shadow-indigo-200 hover:from-indigo-400 hover:to-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {startingJourney ? "Starting... ✨" : "🚀 Start Today's Learning!"}
      </button>

      {/* Assignment tasks if assigned */}
      {!loading && visibleAssignments.length > 0 && (
        <section className="rounded-3xl border border-sky-200 bg-sky-50 p-6">
          <p className="text-sm font-black uppercase tracking-wide text-sky-700">📚 Your Tasks</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {visibleAssignments.slice(0, 4).map((assignment) => (
              <button
                key={assignment.id}
                type="button"
                onClick={() => onStartAssignment(assignment)}
                className="rounded-2xl border border-sky-200 bg-white p-4 text-left transition hover:bg-sky-100"
              >
                <p className="text-lg font-black capitalize text-slate-800">{assignment.subject}</p>
                <p className="mt-1 text-sm text-slate-600">{assignment.title}</p>
                <p className="mt-2 inline-flex rounded-full bg-sky-200 px-3 py-1 text-xs font-bold text-sky-900">
                  {assignment.status === "in_progress" ? "Continue ▶" : "Start ▶"}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Subject Quick-Start tiles */}
      <section>
        <p className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">🎮 Play a Game</p>
        <div className="grid grid-cols-3 gap-4">
          <a
            href={`/games/spelling${firstAssignment ? `?assignmentId=${firstAssignment.id}` : ""}`}
            className="flex flex-col items-center justify-center gap-2 rounded-3xl border border-purple-200 bg-purple-50 p-6 font-black text-purple-700 shadow-sm transition hover:bg-purple-100"
          >
            <span className="text-4xl">📝</span>
            <span>Spelling</span>
          </a>
          <a
            href="/games/math"
            className="flex flex-col items-center justify-center gap-2 rounded-3xl border border-green-200 bg-green-50 p-6 font-black text-green-700 shadow-sm transition hover:bg-green-100"
          >
            <span className="text-4xl">➕</span>
            <span>Maths</span>
          </a>
          <a
            href="/games/reading"
            className="flex flex-col items-center justify-center gap-2 rounded-3xl border border-orange-200 bg-orange-50 p-6 font-black text-orange-700 shadow-sm transition hover:bg-orange-100"
          >
            <span className="text-4xl">📖</span>
            <span>Reading</span>
          </a>
        </div>
      </section>

      {/* Rewards */}
      <section className="rounded-3xl border border-yellow-200 bg-gradient-to-br from-yellow-50 to-amber-50 p-6 text-center">
        <p className="text-2xl">🎁</p>
        <p className="mt-2 text-lg font-black text-slate-800">Rewards Store</p>
        <p className="mt-1 text-sm text-slate-600">
          You have <span className="font-black text-yellow-700">🪙 {stats.coins} coins</span> to spend!
        </p>
        <button
          type="button"
          onClick={onOpenStore}
          className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-yellow-400 px-6 py-3 font-black text-yellow-900 hover:bg-yellow-300"
        >
          🛍 Open Store
        </button>
      </section>

      {/* Boss Battle teaser */}
      {bossUnlocked && (
        <section className="rounded-3xl border border-rose-200 bg-gradient-to-br from-rose-50 to-orange-50 p-6 text-center">
          <p className="text-3xl">👾</p>
          <p className="mt-2 text-lg font-black text-slate-800">Boss Battle Unlocked!</p>
          <a
            href="/games/boss-battle"
            className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-rose-500 px-6 py-3 font-black text-white hover:bg-rose-400"
          >
            Fight the Boss!
          </a>
        </section>
      )}
    </div>
  );
}
