"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import PublicShell from "@/components/layout/PublicShell"
import { restoreTrialSessionFromStorage, storeTrialEmail } from "@/lib/trial-client"

type TrialStatus = {
  email: string
  activitiesRemaining: number
  subjectRemaining: { spelling: number; reading: number; maths: number }
  trialStartedAt: string
  trialExpiresAt: string
  daysRemaining: number
  activitiesCompleted: number
  wordsMastered: number
  subjectUsage: { spelling: number; reading: number; maths: number }
  lastActivity: string | null
  streakCount: number
  expired: boolean
}

const SUBJECTS: Array<{ key: "spelling" | "reading" | "maths"; title: string; accent: string }> = [
  { key: "spelling", title: "Spelling", accent: "text-blue-300" },
  { key: "reading", title: "Reading", accent: "text-emerald-300" },
  { key: "maths", title: "Maths", accent: "text-amber-300" },
]

export default function TrialDashboardPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activityCompleted = searchParams.get("activity") === "done"
  const [trial, setTrial] = useState<TrialStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)

  const loadStatus = useCallback(async (showLoading = true, allowRestore = true) => {
    if (showLoading) {
      setLoading(true)
    }
    setError(null)
    try {
      const response = await fetch("/api/trial/status", { method: "GET", cache: "no-store" })
      const payload = (await response.json()) as { trial?: TrialStatus; error?: string }

      let activeResponse = response
      let activePayload = payload
      if (response.status === 401 && allowRestore) {
        const restored = await restoreTrialSessionFromStorage()
        if (restored.restored) {
          activeResponse = await fetch("/api/trial/status", { method: "GET", cache: "no-store" })
          activePayload = (await activeResponse.json()) as { trial?: TrialStatus; error?: string }
        } else if (restored.expired && restored.email) {
          router.replace(`/trial/upgrade?email=${encodeURIComponent(restored.email)}`)
          return
        }
      }

      if (!activeResponse.ok || !activePayload.trial) {
        router.replace("/trial")
        return
      }

      storeTrialEmail(activePayload.trial.email)

      if (activePayload.trial.expired) {
        router.replace(`/trial/upgrade?email=${encodeURIComponent(activePayload.trial.email)}`)
        return
      }

      setTrial(activePayload.trial)
      if (activePayload.trial.activitiesRemaining <= 2) {
        setBanner("Low activities remaining. Create your full account to keep your child learning without limits.")
      } else if (activePayload.trial.activitiesCompleted > 0) {
        setBanner("Welcome back. Save your child’s progress permanently by upgrading anytime.")
      }
    } catch {
      setError("Unable to load trial dashboard right now.")
    } finally {
      if (showLoading) {
        setLoading(false)
      }
    }
  }, [router])

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadStatus(true)
    }, 0)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [loadStatus])

  const activeBanner = activityCompleted
    ? "Activity completed. Great work. Your remaining activity count has been updated."
    : banner

  return (
    <PublicShell>
      <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 sm:p-8">
            <h1 className="text-3xl font-black sm:text-4xl">Welcome to StarLiz Academy</h1>
            <p className="mt-3 text-sm text-slate-300 sm:text-base">
              Explore a limited trial experience before creating your full parent account.
            </p>

            {loading ? <p className="mt-5 text-sm text-slate-400">Loading trial dashboard...</p> : null}
            {error ? <p className="mt-5 text-sm font-semibold text-rose-300">{error}</p> : null}
            {activeBanner ? <p className="mt-5 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{activeBanner}</p> : null}

            {trial ? (
              <>
                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Activities Remaining</p>
                    <p className="mt-2 text-3xl font-black text-white">{trial.activitiesRemaining}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Days Left</p>
                    <p className="mt-2 text-3xl font-black text-white">{trial.daysRemaining}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Words Mastered</p>
                    <p className="mt-2 text-3xl font-black text-white">{trial.wordsMastered}</p>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  {SUBJECTS.map((subject) => (
                    <article key={subject.key} className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
                      <p className={`text-sm font-bold ${subject.accent}`}>{subject.title}</p>
                      <p className="mt-2 text-sm text-slate-300">{trial.subjectRemaining[subject.key]} remaining</p>
                      {trial.subjectRemaining[subject.key] > 0 ? (
                        <Link
                          href={`/trial/learn?subject=${encodeURIComponent(subject.key)}`}
                          className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-500"
                        >
                          Start activity
                        </Link>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="mt-4 w-full rounded-xl bg-slate-700 px-3 py-2 text-xs font-bold text-slate-300 opacity-70"
                        >
                          No activities left
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              </>
            ) : null}
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
              <h2 className="text-xl font-black">Free Trial Includes</h2>
              <ul className="mt-4 space-y-2 text-sm text-slate-300">
                <li>✓ Limited spelling activities</li>
                <li>✓ Limited reading activities</li>
                <li>✓ Limited maths activities</li>
                <li>✓ AI tutor preview</li>
                <li>✓ Voice learning preview</li>
                <li>✓ Rewards and achievements</li>
                <li>✓ Temporary learning progress</li>
              </ul>
            </div>

            <div className="rounded-3xl border border-blue-500/40 bg-blue-500/10 p-6">
              <h2 className="text-xl font-black">Full Version Includes</h2>
              <ul className="mt-4 space-y-2 text-sm text-blue-100">
                <li>✓ Unlimited learning activities</li>
                <li>✓ Full AI personalised learning</li>
                <li>✓ Parent dashboard and reports</li>
                <li>✓ Weak area detection and daily journeys</li>
                <li>✓ Multiple child profiles</li>
                <li>✓ Long-term progress history</li>
              </ul>
              <Link
                href={trial ? `/signup?email=${encodeURIComponent(trial.email)}` : "/signup"}
                className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-500"
              >
                Unlock unlimited personalised learning
              </Link>
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  )
}
