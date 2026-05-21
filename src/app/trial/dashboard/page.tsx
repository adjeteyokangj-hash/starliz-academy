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

type KeyStage = "ey" | "ks1" | "ks2"

const KEY_STAGE_STORAGE_KEY = "starliz_trial_key_stage"
const TRIAL_LAST_SUBJECT_KEY = "starliz_trial_last_subject"
const TRIAL_COMPLETED_SUBJECTS_KEY = "starliz_trial_completed_subjects"

const KEY_STAGES: Array<{ value: KeyStage; label: string; description: string }> = [
  { value: "ey", label: "Early Years", description: "First steps in learning" },
  { value: "ks1", label: "Key Stage 1", description: "Ages 5–7" },
  { value: "ks2", label: "Key Stage 2", description: "Ages 7–11" },
]

function parseKeyStage(value: string | null): KeyStage {
  if (value === "ey" || value === "ks1" || value === "ks2") return value
  return "ks1"
}

function keyStageLabel(value: KeyStage): string {
  if (value === "ey") return "Early Years"
  if (value === "ks1") return "Key Stage 1"
  return "Key Stage 2"
}

const SUBJECTS: Array<{ key: "spelling" | "reading" | "maths"; title: string; accent: string }> = [
  { key: "spelling", title: "Spelling", accent: "text-blue-300" },
  { key: "reading", title: "Reading", accent: "text-emerald-300" },
  { key: "maths", title: "Maths", accent: "text-amber-300" },
]

export default function TrialDashboardPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const completedSubject = searchParams.get("completed")
  const completedKeyStage = parseKeyStage(searchParams.get("keyStage"))
  const activityCompleted = searchParams.get("activity") === "done" || Boolean(completedSubject)
  const [trial, setTrial] = useState<TrialStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [lastSubjectTried] = useState<"spelling" | "reading" | "maths" | null>(() => {
    if (typeof window === "undefined") return null
    const value = window.localStorage.getItem(TRIAL_LAST_SUBJECT_KEY)
    return value === "spelling" || value === "reading" || value === "maths" ? value : null
  })
  const [completedTokens] = useState<string[]>(() => {
    if (typeof window === "undefined") return []
    const value = window.localStorage.getItem(TRIAL_COMPLETED_SUBJECTS_KEY)
    return value ? value.split(",").filter(Boolean) : []
  })
  const [selectedKeyStage, setSelectedKeyStage] = useState<KeyStage>(() => {
    const fromQuery = parseKeyStage(searchParams.get("keyStage"))
    if (searchParams.get("keyStage")) return fromQuery
    if (typeof window === "undefined") return "ks1"
    return parseKeyStage(window.localStorage.getItem(KEY_STAGE_STORAGE_KEY))
  })

  function onSelectKeyStage(value: KeyStage) {
    setSelectedKeyStage(value)
    if (typeof window !== "undefined") {
      window.localStorage.setItem(KEY_STAGE_STORAGE_KEY, value)
    }
  }

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

  const completedSubjectLabel =
    completedSubject === "spelling" || completedSubject === "reading" || completedSubject === "maths"
      ? completedSubject.charAt(0).toUpperCase() + completedSubject.slice(1)
      : null

  const activeBanner = activityCompleted
    ? completedSubjectLabel
      ? `${completedSubjectLabel} activity completed. Great work. You tried ${keyStageLabel(completedKeyStage)}. Your remaining activity count has been updated.`
      : "Activity completed. Great work. Your remaining activity count has been updated."
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
                <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-950 p-4 sm:p-5">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Choose learning level</p>
                  <p className="mt-1 text-sm text-slate-300">Pick a Key Stage before starting a trial activity.</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {KEY_STAGES.map((option) => {
                      const isSelected = selectedKeyStage === option.value
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => onSelectKeyStage(option.value)}
                          className={`rounded-xl border px-4 py-3 text-left transition active:scale-[0.98] ${isSelected ? "border-blue-400 bg-blue-500/20" : "border-slate-700 bg-slate-900 hover:border-blue-400/60"}`}
                        >
                          <p className="text-sm font-black text-white">{option.label}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-300">{option.description}</p>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-3" id="trial-subjects">
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
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-sm font-bold ${subject.accent}`}>{subject.title}</p>
                        {completedTokens.includes(`${subject.key}:${selectedKeyStage}`) ? <span className="rounded-full border border-emerald-400/40 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-200">Completed</span> : null}
                      </div>
                      <p className="mt-2 text-sm text-slate-300">{trial.subjectRemaining[subject.key]} remaining</p>
                      {lastSubjectTried === subject.key ? <p className="mt-2 text-xs font-semibold text-blue-200">Last subject tried</p> : null}
                      {trial.subjectRemaining[subject.key] > 0 ? (
                        <Link
                          href={`/trial/learn?subject=${encodeURIComponent(subject.key)}&keyStage=${encodeURIComponent(selectedKeyStage)}`}
                          className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300/60"
                          aria-label={`${lastSubjectTried === subject.key ? "Resume" : "Start"} ${subject.title} activity`}
                        >
                          {lastSubjectTried === subject.key ? "Resume activity" : "Start activity"}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="mt-4 min-h-11 w-full rounded-xl bg-slate-700 px-3 py-2 text-xs font-bold text-slate-300 opacity-70"
                        >
                          No activities left
                        </button>
                      )}
                    </article>
                  ))}
                </div>

                {activityCompleted ? (
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => onSelectKeyStage(selectedKeyStage === "ey" ? "ks1" : selectedKeyStage === "ks1" ? "ks2" : "ey")}
                      className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-bold text-slate-100 transition hover:bg-slate-800"
                    >
                      Try another Key Stage
                    </button>
                    <a
                      href="#trial-subjects"
                      className="rounded-xl border border-blue-500/60 bg-blue-500/20 px-4 py-2 text-sm font-bold text-blue-100 transition hover:bg-blue-500/30"
                    >
                      Try another subject
                    </a>
                  </div>
                ) : null}
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
              <p className="mt-2 text-sm font-semibold text-blue-100">Create a parent account to save full progress.</p>
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
