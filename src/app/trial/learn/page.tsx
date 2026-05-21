"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import PublicShell from "@/components/layout/PublicShell"
import { restoreTrialSessionFromStorage, storeTrialEmail } from "@/lib/trial-client"

type TrialStatus = {
  email: string
  activitiesRemaining: number
  subjectRemaining: { spelling: number; reading: number; maths: number }
  trialExpiresAt: string
  expired: boolean
}

type SubjectKey = "spelling" | "reading" | "maths"

const SUBJECT_COPY: Record<SubjectKey, { title: string; intro: string; task: string; hint: string }> = {
  spelling: {
    title: "Spelling Trial Activity",
    intro: "Practice one quick spelling challenge to preview the StarLiz learning flow.",
    task: "Spell the word: adventure",
    hint: "Tip: break it into syllables: ad-ven-ture.",
  },
  reading: {
    title: "Reading Trial Activity",
    intro: "Read a short sentence and check understanding.",
    task: "Read: The bright moon shines over the quiet lake.",
    hint: "Ask your child: What is shining?",
  },
  maths: {
    title: "Maths Trial Activity",
    intro: "Solve one quick maths puzzle from the trial lesson.",
    task: "What is 7 + 5?",
    hint: "Try counting on from 7: 8, 9, 10, 11, 12.",
  },
}

function parseSubject(value: string | null): SubjectKey | null {
  if (value === "spelling" || value === "reading" || value === "maths") return value
  return null
}

export default function TrialLearnPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const subject = parseSubject(searchParams.get("subject"))
  const selectedSubject: SubjectKey = subject ?? "spelling"
  const [trial, setTrial] = useState<TrialStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const content = useMemo(() => {
    if (!subject) return null
    return SUBJECT_COPY[subject]
  }, [subject])

  const loadStatus = useCallback(async (allowRestore = true) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/trial/status", { method: "GET", cache: "no-store" })
      const payload = (await response.json()) as { trial?: TrialStatus }

      if (response.status === 401 && allowRestore) {
        const restored = await restoreTrialSessionFromStorage()
        if (restored.restored) {
          await loadStatus(false)
          return
        }
        if (restored.expired && restored.email) {
          router.replace(`/trial/upgrade?email=${encodeURIComponent(restored.email)}`)
          return
        }
      }

      if (!response.ok || !payload.trial) {
        router.replace("/trial")
        return
      }

      storeTrialEmail(payload.trial.email)

      const noActivitiesLeft = payload.trial.activitiesRemaining <= 0
      const subjectExhausted = payload.trial.subjectRemaining[selectedSubject] <= 0
      if (payload.trial.expired || noActivitiesLeft || subjectExhausted) {
        router.replace(`/trial/upgrade?email=${encodeURIComponent(payload.trial.email)}`)
        return
      }

      setTrial(payload.trial)
    } catch {
      setError("Unable to verify your trial status right now.")
    } finally {
      setLoading(false)
    }
  }, [router, selectedSubject])

  useEffect(() => {
    if (!subject) {
      router.replace("/trial/dashboard")
      return
    }
    void loadStatus(true)
  }, [loadStatus, router, subject])

  async function completeActivity(allowRestore = true) {
    if (!subject || !trial) return
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch("/api/trial/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: selectedSubject }),
      })

      const payload = (await response.json()) as { error?: string; status?: string }
      if (!response.ok) {
        if (response.status === 403) {
          router.replace(`/trial/upgrade?email=${encodeURIComponent(trial.email)}`)
          return
        }
        if (response.status === 401) {
          const restored = await restoreTrialSessionFromStorage()
          if (restored.restored && allowRestore) {
            await completeActivity(false)
            return
          }
        }
        setError(payload.error ?? "Could not complete this activity.")
        return
      }

      router.replace("/trial/dashboard?activity=done")
    } catch {
      setError("Network error while completing this activity.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PublicShell>
      <section className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:py-14">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 sm:p-8">
          {loading ? <p className="text-sm text-slate-300">Checking trial status...</p> : null}
          {error ? <p className="rounded-xl border border-rose-500/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}

          {!loading && trial && content ? (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-300">Trial Learning</p>
              <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">{content.title}</h1>
              <p className="mt-3 text-sm text-slate-300 sm:text-base">{content.intro}</p>

              <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-950 p-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Sample Activity</p>
                <p className="mt-2 text-lg font-bold text-white">{content.task}</p>
                <p className="mt-3 text-sm text-slate-300">{content.hint}</p>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Activities Left</p>
                  <p className="mt-2 text-2xl font-black text-white">{trial.activitiesRemaining}</p>
                </div>
                <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">This Subject Left</p>
                  <p className="mt-2 text-2xl font-black text-white">{trial.subjectRemaining[selectedSubject]}</p>
                </div>
                <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Expires</p>
                  <p className="mt-2 text-sm font-bold text-white">{new Date(trial.trialExpiresAt).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="mt-7 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    void completeActivity()
                  }}
                  disabled={submitting}
                  className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Completing activity..." : "Complete trial activity"}
                </button>
                <Link
                  href="/trial/dashboard"
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-700 px-5 py-3 text-sm font-bold text-slate-200 hover:bg-slate-800"
                >
                  Back to dashboard
                </Link>
              </div>
            </>
          ) : null}
        </div>
      </section>
    </PublicShell>
  )
}
