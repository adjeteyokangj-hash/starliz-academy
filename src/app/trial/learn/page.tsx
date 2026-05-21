"use client"

import { useCallback, useEffect, useRef, useState } from "react"
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
type ActivityPhase = "activity" | "answered" | "completing" | "done"

// ── Spelling ──────────────────────────────────────────────────────────────────
const SPELLING_WORD = "adventure"

// ── Reading ───────────────────────────────────────────────────────────────────
const READING_PASSAGE =
  "The bright moon rises over the quiet forest. The trees stand tall and still. Owls watch from the branches above."
const READING_QUESTION = "Where does the moon rise in the story?"
const READING_OPTIONS: { label: string; correct: boolean }[] = [
  { label: "Over the quiet forest", correct: true },
  { label: "Under the deep ocean", correct: false },
  { label: "Behind a tall building", correct: false },
  { label: "Over a busy road", correct: false },
]

// ── Maths ─────────────────────────────────────────────────────────────────────
const MATHS_QUESTION = "What is 7 + 5?"
const MATHS_OPTIONS: { label: string; correct: boolean }[] = [
  { label: "11", correct: false },
  { label: "12", correct: true },
  { label: "13", correct: false },
  { label: "10", correct: false },
]

function parseSubject(value: string | null): SubjectKey | null {
  if (value === "spelling" || value === "reading" || value === "maths") return value
  return null
}

function speakWord(word: string) {
  if (typeof window === "undefined") return
  if (!("speechSynthesis" in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(word)
  utterance.rate = 0.85
  window.speechSynthesis.speak(utterance)
}

// ── Spelling activity ─────────────────────────────────────────────────────────
function SpellingActivity({ onAnswered }: { onAnswered: () => void }) {
  const [input, setInput] = useState("")
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function checkAnswer() {
    const trimmed = input.trim().toLowerCase()
    if (trimmed === SPELLING_WORD) {
      setFeedback("correct")
      onAnswered()
    } else {
      setFeedback("wrong")
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && feedback !== "correct") checkAnswer()
  }

  return (
    <div className="space-y-6">
      {/* Word display */}
      <div className="flex items-center justify-between rounded-2xl border border-indigo-700/50 bg-indigo-950/60 px-6 py-5">
        <p className="text-3xl font-black tracking-widest text-white sm:text-4xl">
          {feedback === "correct" ? SPELLING_WORD : "_ ".repeat(SPELLING_WORD.length).trim()}
        </p>
        <button
          type="button"
          onClick={() => speakWord(SPELLING_WORD)}
          className="ml-4 inline-flex shrink-0 items-center gap-2 rounded-xl border border-indigo-600 bg-indigo-900 px-4 py-2 text-sm font-bold text-indigo-100 transition hover:bg-indigo-800 active:scale-95"
        >
          🔊 Hear word
        </button>
      </div>

      {/* Input row */}
      {feedback !== "correct" && (
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-slate-300" htmlFor="spelling-input">
            Type the word then press Check
          </label>
          <div className="flex gap-3">
            <input
              ref={inputRef}
              id="spelling-input"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                setFeedback(null)
              }}
              onKeyDown={handleKeyDown}
              className="flex-1 rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-lg font-bold text-white placeholder-slate-500 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30"
              placeholder="Type your answer…"
            />
            <button
              type="button"
              onClick={checkAnswer}
              disabled={input.trim().length === 0}
              className="rounded-xl bg-indigo-600 px-5 py-3 font-black text-white transition hover:bg-indigo-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Check
            </button>
          </div>
          {feedback === "wrong" && (
            <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-200">
              Not quite — try again! Hint: break it into syllables:{" "}
              <strong>ad-ven-ture</strong>
            </p>
          )}
        </div>
      )}

      {feedback === "correct" && (
        <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-base font-bold text-emerald-200">
          ✅ Brilliant! You spelled <strong>{SPELLING_WORD}</strong> correctly!
        </p>
      )}
    </div>
  )
}

// ── Choice activity (Reading + Maths) ─────────────────────────────────────────
function ChoiceActivity({
  question,
  passage,
  options,
  onAnswered,
}: {
  question: string
  passage?: string
  options: { label: string; correct: boolean }[]
  onAnswered: () => void
}) {
  const [selected, setSelected] = useState<number | null>(null)
  const answered = selected !== null

  function choose(index: number) {
    if (answered) return
    setSelected(index)
    onAnswered()
  }

  return (
    <div className="space-y-5">
      {passage && (
        <div className="rounded-2xl border border-slate-700 bg-slate-950 px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Read this</p>
          <p className="mt-2 text-base font-semibold leading-relaxed text-white sm:text-lg">{passage}</p>
        </div>
      )}

      <p className="text-lg font-black text-white">{question}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((option, index) => {
          let btnClass =
            "w-full rounded-2xl border px-5 py-4 text-left text-base font-bold transition active:scale-[0.98] "
          if (!answered) {
            btnClass +=
              "border-slate-600 bg-slate-800 text-white hover:border-indigo-400 hover:bg-indigo-900/60"
          } else if (index === selected) {
            btnClass += option.correct
              ? "border-emerald-500 bg-emerald-900/40 text-emerald-200"
              : "border-rose-500 bg-rose-900/40 text-rose-200"
          } else if (option.correct) {
            btnClass += "border-emerald-500/50 bg-emerald-950/30 text-emerald-300"
          } else {
            btnClass += "border-slate-700 bg-slate-900 text-slate-500 opacity-60"
          }
          return (
            <button
              key={option.label}
              type="button"
              onClick={() => choose(index)}
              disabled={answered}
              className={btnClass}
            >
              {answered && index === selected
                ? option.correct
                  ? "✅ "
                  : "❌ "
                : answered && option.correct
                  ? "✅ "
                  : ""}
              {option.label}
            </button>
          )
        })}
      </div>

      {answered && (
        <p
          className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
            options[selected]?.correct
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
              : "border-amber-500/40 bg-amber-500/10 text-amber-200"
          }`}
        >
          {options[selected]?.correct
            ? "🎉 Correct! Great work!"
            : `Not quite — the correct answer is: ${options.find((o) => o.correct)?.label ?? ""}`}
        </p>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function TrialLearnPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const subject = parseSubject(searchParams.get("subject"))
  const selectedSubject: SubjectKey = subject ?? "spelling"

  const [trial, setTrial] = useState<TrialStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [phase, setPhase] = useState<ActivityPhase>("activity")
  const [error, setError] = useState<string | null>(null)

  const loadStatus = useCallback(
    async (allowRestore = true) => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch("/api/trial/status", { method: "GET", cache: "no-store" })
        const payload = (await response.json()) as { trial?: TrialStatus }

        if (response.status === 401 && allowRestore) {
          const restored = await restoreTrialSessionFromStorage()
          if (restored.restored) {
            const retryResponse = await fetch("/api/trial/status", { method: "GET", cache: "no-store" })
            const retryPayload = (await retryResponse.json()) as { trial?: TrialStatus }
            if (retryResponse.ok && retryPayload.trial) {
              storeTrialEmail(retryPayload.trial.email)
              setTrial(retryPayload.trial)
              return
            }
            router.replace("/trial")
            return
          }
          if (restored.expired && restored.email) {
            router.replace(`/trial/upgrade?email=${encodeURIComponent(restored.email)}`)
            return
          }
          router.replace("/trial")
          return
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
    },
    [router, selectedSubject],
  )

  useEffect(() => {
    if (!subject) {
      router.replace("/trial/dashboard")
      return
    }
    void loadStatus(true)
  }, [loadStatus, router, subject])

  async function completeActivity(allowRestore = true) {
    if (!subject || !trial) return
    setPhase("completing")
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
        setPhase("answered")
        return
      }

      setPhase("done")
      router.replace("/trial/dashboard?activity=done")
    } catch {
      setError("Network error while completing this activity.")
      setPhase("answered")
    }
  }

  const SUBJECT_LABELS: Record<SubjectKey, string> = {
    spelling: "Spelling",
    reading: "Reading",
    maths: "Maths",
  }

  return (
    <PublicShell>
      <section className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 sm:p-8">
          {/* Loading */}
          {loading && <p className="text-sm text-slate-300">Checking trial status…</p>}

          {/* Error */}
          {error && (
            <p className="mb-4 rounded-xl border border-rose-500/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {error}
            </p>
          )}

          {/* Activity */}
          {!loading && trial && (
            <>
              {/* Header */}
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-300">
                    Trial Activity
                  </p>
                  <h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">
                    {SUBJECT_LABELS[selectedSubject]} Challenge
                  </h1>
                </div>
                <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-bold text-slate-300">
                  {trial.activitiesRemaining} left
                </span>
              </div>

              {/* Spelling */}
              {selectedSubject === "spelling" && (
                <SpellingActivity onAnswered={() => setPhase("answered")} />
              )}

              {/* Reading */}
              {selectedSubject === "reading" && (
                <ChoiceActivity
                  passage={READING_PASSAGE}
                  question={READING_QUESTION}
                  options={READING_OPTIONS}
                  onAnswered={() => setPhase("answered")}
                />
              )}

              {/* Maths */}
              {selectedSubject === "maths" && (
                <ChoiceActivity
                  question={MATHS_QUESTION}
                  options={MATHS_OPTIONS}
                  onAnswered={() => setPhase("answered")}
                />
              )}

              {/* Complete button — only after answering */}
              {(phase === "answered" || phase === "completing" || phase === "done") && (
                <div className="mt-8 flex flex-wrap gap-3 border-t border-slate-700 pt-6">
                  <button
                    type="button"
                    onClick={() => {
                      void completeActivity()
                    }}
                    disabled={phase === "completing" || phase === "done"}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 font-black text-white transition hover:bg-blue-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {phase === "completing" ? (
                      <>
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Saving…
                      </>
                    ) : phase === "done" ? (
                      "✅ Done!"
                    ) : (
                      "Complete activity ✓"
                    )}
                  </button>
                  <Link
                    href="/trial/dashboard"
                    className="inline-flex items-center justify-center rounded-2xl border border-slate-700 px-5 py-3 text-sm font-bold text-slate-200 transition hover:bg-slate-800"
                  >
                    Back to dashboard
                  </Link>
                </div>
              )}

              {/* While still in activity phase, show only back link */}
              {phase === "activity" && (
                <div className="mt-8 border-t border-slate-800 pt-5">
                  <Link
                    href="/trial/dashboard"
                    className="text-sm font-semibold text-slate-400 transition hover:text-slate-200"
                  >
                    ← Back to dashboard
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </PublicShell>
  )
}
