"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
type KeyStage = "ey" | "ks1" | "ks2"
type ActivityPhase = "question" | "summary" | "completing" | "done"
type ChoiceQuestion = { question: string; options: Array<{ label: string; correct: boolean }> }

const TOTAL_QUESTIONS = 3
const TRIAL_LAST_SUBJECT_KEY = "starliz_trial_last_subject"
const TRIAL_COMPLETED_SUBJECTS_KEY = "starliz_trial_completed_subjects"

const CORRECT_FEEDBACK = ["Amazing!", "Brilliant!", "Fantastic spelling!", "Super reading!"]
const WRONG_FEEDBACK = ["Let us try again.", "Nearly there.", "Listen carefully and try once more."]
const TUTOR_MESSAGES = ["Let us learn together!", "You are doing great!", "One more question!"]

const SPELLING_WORDS: Record<KeyStage, string[]> = {
  ey: ["cat", "sun", "dog"],
  ks1: ["sunshine", "rabbit", "garden"],
  ks2: ["adventure", "knowledge", "magnificent"],
}

const READING_PASSAGES: Record<KeyStage, string> = {
  ey: "Sam has a red hat. Sam can hop. Sam is happy.",
  ks1: "Lina planted a seed in a small pot. She watered it every morning. After one week, a tiny green shoot appeared.",
  ks2: "During the school science fair, Amir demonstrated a small wind turbine. Although it spun slowly indoors, he explained that stronger outdoor wind would generate more electricity for the model village lights.",
}

const READING_QUESTIONS: Record<KeyStage, ChoiceQuestion[]> = {
  ey: [
    { question: "What color is Sam's hat?", options: [{ label: "Red", correct: true }, { label: "Blue", correct: false }, { label: "Green", correct: false }, { label: "Black", correct: false }] },
    { question: "What can Sam do?", options: [{ label: "Sleep", correct: false }, { label: "Hop", correct: true }, { label: "Swim", correct: false }, { label: "Fly", correct: false }] },
    { question: "How is Sam feeling?", options: [{ label: "Sad", correct: false }, { label: "Happy", correct: true }, { label: "Angry", correct: false }, { label: "Scared", correct: false }] },
  ],
  ks1: [
    { question: "What did Lina plant?", options: [{ label: "A flower", correct: false }, { label: "A seed", correct: true }, { label: "A tree", correct: false }, { label: "A stick", correct: false }] },
    { question: "When did she water it?", options: [{ label: "Every morning", correct: true }, { label: "Every night", correct: false }, { label: "Only once", correct: false }, { label: "Never", correct: false }] },
    { question: "What appeared after one week?", options: [{ label: "A tiny green shoot", correct: true }, { label: "A red flower", correct: false }, { label: "A big tree", correct: false }, { label: "A bird nest", correct: false }] },
  ],
  ks2: [
    { question: "What did Amir demonstrate?", options: [{ label: "A water pump", correct: false }, { label: "A wind turbine", correct: true }, { label: "A solar oven", correct: false }, { label: "A paper bridge", correct: false }] },
    { question: "Why did it spin slowly indoors?", options: [{ label: "It was broken", correct: false }, { label: "There was weak wind", correct: true }, { label: "It was too heavy", correct: false }, { label: "Lights were off", correct: false }] },
    { question: "What can we infer about outdoor testing?", options: [{ label: "It may produce more electricity", correct: true }, { label: "It will stop turning", correct: false }, { label: "It will need less wind", correct: false }, { label: "It will power a whole city", correct: false }] },
  ],
}

const MATHS_QUESTIONS: Record<KeyStage, ChoiceQuestion[]> = {
  ey: [
    { question: "How many circles do you see? (● ● ●)", options: [{ label: "2", correct: false }, { label: "3", correct: true }, { label: "4", correct: false }, { label: "5", correct: false }] },
    { question: "Which shape has 3 sides?", options: [{ label: "Square", correct: false }, { label: "Circle", correct: false }, { label: "Triangle", correct: true }, { label: "Rectangle", correct: false }] },
    { question: "What is 2 + 1?", options: [{ label: "2", correct: false }, { label: "3", correct: true }, { label: "4", correct: false }, { label: "5", correct: false }] },
  ],
  ks1: [
    { question: "What is 8 + 7?", options: [{ label: "14", correct: false }, { label: "15", correct: true }, { label: "16", correct: false }, { label: "17", correct: false }] },
    { question: "What is 18 - 9?", options: [{ label: "7", correct: false }, { label: "8", correct: false }, { label: "9", correct: true }, { label: "10", correct: false }] },
    { question: "Tom has 12 stickers and gets 6 more. How many now?", options: [{ label: "16", correct: false }, { label: "17", correct: false }, { label: "18", correct: true }, { label: "19", correct: false }] },
  ],
  ks2: [
    { question: "What is 6 × 7?", options: [{ label: "36", correct: false }, { label: "40", correct: false }, { label: "42", correct: true }, { label: "48", correct: false }] },
    { question: "What is 24 ÷ 6?", options: [{ label: "3", correct: false }, { label: "4", correct: true }, { label: "5", correct: false }, { label: "6", correct: false }] },
    { question: "Which is equal to 1/2?", options: [{ label: "2/3", correct: false }, { label: "3/8", correct: false }, { label: "4/8", correct: true }, { label: "5/6", correct: false }] },
  ],
}

function parseSubject(value: string | null): SubjectKey | null {
  if (value === "spelling" || value === "reading" || value === "maths") return value
  return null
}

function parseKeyStage(value: string | null): KeyStage {
  if (value === "ey" || value === "ks1" || value === "ks2") return value
  return "ks1"
}

function keyStageLabel(value: KeyStage): string {
  if (value === "ey") return "Early Years"
  if (value === "ks1") return "Key Stage 1"
  return "Key Stage 2"
}

function normaliseSpellingValue(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]/gi, "")
}

function saveLastSubject(subject: SubjectKey) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(TRIAL_LAST_SUBJECT_KEY, subject)
}

function saveCompletedSubject(subject: SubjectKey, keyStage: KeyStage) {
  if (typeof window === "undefined") return
  const token = `${subject}:${keyStage}`
  const existing = window.localStorage.getItem(TRIAL_COMPLETED_SUBJECTS_KEY)
  const parsed = existing ? existing.split(",").filter(Boolean) : []
  if (!parsed.includes(token)) parsed.push(token)
  window.localStorage.setItem(TRIAL_COMPLETED_SUBJECTS_KEY, parsed.join(","))
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function selectVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = voices.filter((voice) => voice.lang.toLowerCase().startsWith("en"))
  if (english.length === 0) return voices[0] ?? null
  const preferred = english.find((voice) => /(child|kids|female|libby|aria|jenny|samantha|google uk english female|natural|neural)/i.test(voice.name))
  if (preferred) return preferred
  const uk = english.find((voice) => /en-gb|english \(united kingdom\)/i.test(voice.lang + voice.name))
  return uk ?? english[0]
}

function createUtterance(text: string, voice: SpeechSynthesisVoice | null, rate: number, pitch: number): SpeechSynthesisUtterance {
  const utterance = new SpeechSynthesisUtterance(text)
  if (voice) utterance.voice = voice
  utterance.rate = rate
  utterance.pitch = pitch
  utterance.lang = voice?.lang ?? "en-GB"
  return utterance
}

function ProgressMeter({ current }: { current: number }) {
  const percent = Math.min(100, Math.max(0, (current / TOTAL_QUESTIONS) * 100))
  return (
    <div className="space-y-2" aria-live="polite">
      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.16em] text-slate-300 sm:text-sm">
        <span>Question {current} of {TOTAL_QUESTIONS}</span>
        <span>{Math.round(percent)}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} aria-label="Lesson progress">
        <div className="h-2 rounded-full bg-blue-500 transition-all duration-300" style={{ width: `${percent}%` }} />
      </div>
      {current >= 2 ? <p className="text-sm font-semibold text-emerald-300">You are nearly there.</p> : null}
    </div>
  )
}

function ChoiceQuestionCard({ question, options, selected, onSelect }: { question: string; options: Array<{ label: string; correct: boolean }>; selected: number | null; onSelect: (index: number) => void }) {
  const answered = selected !== null

  function onChoiceKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (answered) return
    if (event.key === "1" || event.key === "2" || event.key === "3" || event.key === "4") {
      const index = Number(event.key) - 1
      if (index >= 0 && index < options.length) {
        onSelect(index)
      }
    }
  }

  return (
    <div className="space-y-5" tabIndex={0} onKeyDown={onChoiceKeyDown} aria-label="Multiple choice question. Press 1, 2, 3, or 4 to choose an option.">
      <p className="text-2xl font-black text-white sm:text-3xl">{question}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((option, index) => {
          let classes = "min-h-14 w-full rounded-2xl border px-5 py-4 text-left text-lg font-black transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300/60 "
          if (!answered) classes += "border-slate-600 bg-slate-800 text-white hover:border-blue-400 hover:bg-slate-700"
          else if (index === selected) classes += option.correct ? "border-emerald-500 bg-emerald-950/40 text-emerald-200" : "border-amber-500 bg-amber-950/40 text-amber-200"
          else if (option.correct) classes += "border-emerald-500/50 bg-emerald-950/20 text-emerald-300"
          else classes += "border-slate-700 bg-slate-900 text-slate-500"

          return (
            <button key={option.label} type="button" onClick={() => onSelect(index)} disabled={answered} className={classes} aria-label={`Option ${index + 1}: ${option.label}`}>
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function TrialLearnPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const subject = parseSubject(searchParams.get("subject"))
  const selectedSubject: SubjectKey = subject ?? "spelling"
  const selectedKeyStage = parseKeyStage(searchParams.get("keyStage"))

  const [trial, setTrial] = useState<TrialStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [phase, setPhase] = useState<ActivityPhase>("question")
  const [error, setError] = useState<string | null>(null)

  const [questionIndex, setQuestionIndex] = useState(0)
  const [stars, setStars] = useState(0)
  const [spellingInput, setSpellingInput] = useState("")
  const [choiceSelected, setChoiceSelected] = useState<number | null>(null)
  const [currentCorrect, setCurrentCorrect] = useState<boolean | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const [audioFallbackMessage, setAudioFallbackMessage] = useState<string | null>(null)
  const [showBurst, setShowBurst] = useState(false)
  const autoSpokenQuestionRef = useRef<string | null>(null)

  const questionNumber = questionIndex + 1
  const spellingWord = SPELLING_WORDS[selectedKeyStage][questionIndex] ?? SPELLING_WORDS[selectedKeyStage][TOTAL_QUESTIONS - 1]
  const choiceQuestions = useMemo(() => (selectedSubject === "reading" ? READING_QUESTIONS[selectedKeyStage] : MATHS_QUESTIONS[selectedKeyStage]), [selectedKeyStage, selectedSubject])
  const activeChoiceQuestion = choiceQuestions[questionIndex] ?? choiceQuestions[TOTAL_QUESTIONS - 1]

  function resetQuestionState() {
    setSpellingInput("")
    setChoiceSelected(null)
    setCurrentCorrect(null)
    setAudioFallbackMessage(null)
  }

  function encouragement(isCorrect: boolean): string {
    return isCorrect ? CORRECT_FEEDBACK[questionIndex % CORRECT_FEEDBACK.length] : WRONG_FEEDBACK[questionIndex % WRONG_FEEDBACK.length]
  }

  function tutorMessage(): string {
    if (phase === "summary") return "You are doing great!"
    return TUTOR_MESSAGES[questionIndex % TUTOR_MESSAGES.length]
  }

  function moveToNextQuestion() {
    if (questionNumber >= TOTAL_QUESTIONS) {
      setPhase("summary")
      return
    }
    setQuestionIndex((previous) => previous + 1)
    resetQuestionState()
  }

  async function speakSpellingWord(word: string, withInstruction: boolean) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setAudioFallbackMessage(`Audio is not available on this device. Please read the word aloud: ${word}`)
      return
    }

    setSpeaking(true)
    setAudioFallbackMessage(null)
    try {
      const synth = window.speechSynthesis
      synth.cancel()
      const voice = selectVoice(synth.getVoices())

      const speakOnce = async (utterance: SpeechSynthesisUtterance) => {
        await new Promise<void>((resolve) => {
          utterance.onend = () => resolve()
          utterance.onerror = () => resolve()
          synth.speak(utterance)
        })
      }

      if (withInstruction) {
        await speakOnce(createUtterance(`Your word is ${word}. Listen carefully.`, voice, 0.72, 1.08))
        await wait(550)
      }
      await speakOnce(createUtterance(word, voice, 0.66, 1.12))
    } finally {
      setSpeaking(false)
    }
  }

  async function speakReadingPassage() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setAudioFallbackMessage("Audio is not available on this device. Please read the passage together.")
      return
    }

    setSpeaking(true)
    setAudioFallbackMessage(null)
    try {
      const synth = window.speechSynthesis
      synth.cancel()
      const voice = selectVoice(synth.getVoices())
      const utterance = createUtterance(READING_PASSAGES[selectedKeyStage], voice, 0.84, 1.07)

      await new Promise<void>((resolve) => {
        utterance.onend = () => resolve()
        utterance.onerror = () => resolve()
        synth.speak(utterance)
      })
    } finally {
      setSpeaking(false)
    }
  }

  function triggerBurst() {
    setShowBurst(true)
    window.setTimeout(() => {
      setShowBurst(false)
    }, 950)
  }

  function submitSpellingAnswer() {
    const correct = normaliseSpellingValue(spellingInput) === normaliseSpellingValue(spellingWord)
    setCurrentCorrect(correct)
    if (correct) {
      setStars((value) => value + 1)
      triggerBurst()
    }
  }

  function submitChoiceAnswer(index: number) {
    if (choiceSelected !== null) return
    const correct = Boolean(activeChoiceQuestion.options[index]?.correct)
    setChoiceSelected(index)
    setCurrentCorrect(correct)
    if (correct) {
      setStars((value) => value + 1)
      triggerBurst()
    }
  }

  const loadStatus = useCallback(async (allowRestore = true) => {
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
  }, [router, selectedSubject])

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      if (!subject) {
        router.replace("/trial/dashboard")
        return
      }
      void loadStatus(true)
    }, 0)
    return () => window.clearTimeout(timerId)
  }, [loadStatus, router, subject])

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setPhase("question")
      setQuestionIndex(0)
      setStars(0)
      resetQuestionState()
    }, 0)
    return () => window.clearTimeout(timerId)
  }, [selectedSubject, selectedKeyStage])

  useEffect(() => {
    if (selectedSubject !== "spelling" || phase !== "question") return
    const key = `${selectedKeyStage}:${questionIndex}`
    if (autoSpokenQuestionRef.current === key) return

    autoSpokenQuestionRef.current = key
    const timerId = window.setTimeout(() => {
      void speakSpellingWord(spellingWord, true)
    }, 180)

    return () => window.clearTimeout(timerId)
  }, [phase, questionIndex, selectedKeyStage, selectedSubject, spellingWord])

  useEffect(() => {
    saveLastSubject(selectedSubject)
  }, [selectedSubject])

  async function completeActivity(allowRestore = true) {
    if (!subject || !trial || phase === "completing" || phase === "done") return
    setPhase("completing")
    setError(null)
    try {
      const response = await fetch("/api/trial/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: selectedSubject, keyStage: selectedKeyStage }),
      })

      const payload = (await response.json()) as { error?: string }
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
        setPhase("summary")
        return
      }

      saveCompletedSubject(selectedSubject, selectedKeyStage)
      setPhase("done")
      router.replace(`/trial/dashboard?completed=${encodeURIComponent(selectedSubject)}&keyStage=${encodeURIComponent(selectedKeyStage)}`)
    } catch {
      setError("Network error while completing this activity.")
      setPhase("summary")
    }
  }

  const SUBJECT_LABELS: Record<SubjectKey, string> = { spelling: "Spelling", reading: "Reading", maths: "Maths" }

  return (
    <PublicShell>
      <section className="mx-auto w-full max-w-5xl px-3 py-6 sm:px-6 lg:py-8">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 sm:p-6 lg:p-7">
          {loading ? <p className="text-sm text-slate-300">Checking trial status...</p> : null}
          {error ? <p className="mb-4 rounded-xl border border-rose-500/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}

          {!loading && trial ? (
            <>
              <div className="mb-5 space-y-3">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-300">Trial Lesson</p>
                <h1 className="text-2xl font-black text-white sm:text-3xl lg:text-4xl">{SUBJECT_LABELS[selectedSubject]} Mini Lesson</h1>
                <p className="inline-flex w-fit rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-xs font-bold uppercase tracking-widest text-slate-200">{keyStageLabel(selectedKeyStage)}</p>
                <ProgressMeter current={Math.min(questionNumber, TOTAL_QUESTIONS)} />
              </div>

              <div className="mb-4 rounded-2xl border border-blue-500/30 bg-blue-500/10 px-4 py-3" aria-live="polite">
                <p className="text-xs font-bold uppercase tracking-widest text-blue-200">StarLiz Tutor</p>
                <p className="mt-1 text-sm font-semibold text-blue-100">{tutorMessage()}</p>
              </div>

              {selectedSubject === "reading" && phase === "question" ? (
                <div className="mb-4 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-4 sm:px-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Passage</p>
                    <button
                      type="button"
                      onClick={() => {
                        void speakReadingPassage()
                      }}
                      disabled={speaking}
                      className="min-h-12 rounded-xl border border-emerald-500/70 bg-emerald-500/15 px-4 py-2 text-sm font-black text-emerald-100 transition hover:bg-emerald-500/25 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300/60 disabled:cursor-not-allowed disabled:opacity-70"
                      aria-label="Read passage aloud"
                    >
                      {speaking ? "Reading aloud..." : "Read passage aloud"}
                    </button>
                  </div>
                  <p className="mt-2 text-base leading-relaxed text-white sm:text-lg">{READING_PASSAGES[selectedKeyStage]}</p>
                </div>
              ) : null}

              <div className="relative rounded-3xl border border-slate-700 bg-slate-950 p-4 sm:p-6 lg:p-7">
                {showBurst ? (
                  <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden="true">
                    <span className="absolute left-[12%] top-[16%] text-2xl text-yellow-300 animate-ping">★</span>
                    <span className="absolute left-[78%] top-[20%] text-xl text-amber-300 animate-ping [animation-delay:120ms]">★</span>
                    <span className="absolute left-[28%] top-[68%] text-2xl text-emerald-300 animate-ping [animation-delay:170ms]">★</span>
                    <span className="absolute left-[62%] top-[62%] text-2xl text-blue-300 animate-ping [animation-delay:240ms]">★</span>
                  </div>
                ) : null}
                {phase === "question" ? (
                  selectedSubject === "spelling" ? (
                    <div className="space-y-5">
                      <p className="text-2xl font-black tracking-wider text-white sm:text-3xl">Spell this word</p>
                      <p className="text-lg font-bold text-blue-200">Word {questionNumber} of {TOTAL_QUESTIONS}</p>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => {
                            void speakSpellingWord(spellingWord, true)
                          }}
                          disabled={speaking}
                          className="min-h-12 rounded-xl border border-blue-600 bg-blue-900 px-5 py-3 text-base font-black text-blue-100 transition hover:bg-blue-800 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300/60 disabled:cursor-not-allowed disabled:opacity-70"
                          aria-label="Hear word"
                        >
                          {speaking ? "Speaking..." : "Hear word"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void speakSpellingWord(spellingWord, false)
                          }}
                          disabled={speaking}
                          className="min-h-12 rounded-xl border border-slate-600 bg-slate-800 px-5 py-3 text-base font-black text-slate-100 transition hover:bg-slate-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-300/60 disabled:cursor-not-allowed disabled:opacity-70"
                          aria-label="Repeat word"
                        >
                          {speaking ? "Speaking..." : "Repeat word"}
                        </button>
                      </div>

                      {audioFallbackMessage ? <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-200">{audioFallbackMessage}</p> : null}

                      <div className="space-y-3">
                        <label htmlFor="trial-spelling-input" className="text-sm font-semibold text-slate-300">Type the word you hear</label>
                        <div className="flex flex-col gap-3 sm:flex-row">
                          <input id="trial-spelling-input" type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} value={spellingInput} onChange={(event) => { setSpellingInput(event.target.value); if (currentCorrect === false) setCurrentCorrect(null) }} onKeyDown={(event) => { if (event.key === "Enter" && spellingInput.trim().length > 0 && currentCorrect !== true) submitSpellingAnswer() }} className="min-h-12 flex-1 rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-lg font-black text-white outline-none focus-visible:border-blue-400 focus-visible:ring-4 focus-visible:ring-blue-300/40" placeholder="Type your answer" aria-label="Spelling answer" />
                          <button type="button" onClick={submitSpellingAnswer} disabled={spellingInput.trim().length === 0 || currentCorrect === true} className="min-h-12 rounded-xl bg-blue-600 px-6 py-3 text-base font-black text-white transition hover:bg-blue-500 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300/60 disabled:cursor-not-allowed disabled:opacity-60" aria-label="Check answer">Check answer</button>
                        </div>
                      </div>

                      {currentCorrect !== null ? <div className={`rounded-xl border px-4 py-3 text-base font-bold ${currentCorrect ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-amber-500/40 bg-amber-500/10 text-amber-200"}`} aria-live="polite"><p>{encouragement(currentCorrect)}</p>{currentCorrect ? <p className="mt-1 text-sm font-semibold text-emerald-300">Star earned. Great listening.</p> : <p className="mt-1 text-sm font-semibold">Use Hear word or Repeat word and try again.</p>}</div> : null}
                      {currentCorrect ? <button type="button" onClick={moveToNextQuestion} className="min-h-12 rounded-xl bg-emerald-600 px-6 py-3 text-base font-black text-white transition hover:bg-emerald-500 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300/60" aria-label={questionNumber < TOTAL_QUESTIONS ? "Next question" : "View summary"}>{questionNumber < TOTAL_QUESTIONS ? "Next question" : "View summary"}</button> : null}
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <ChoiceQuestionCard question={activeChoiceQuestion.question} options={activeChoiceQuestion.options} selected={choiceSelected} onSelect={submitChoiceAnswer} />
                      {audioFallbackMessage ? <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-200">{audioFallbackMessage}</p> : null}
                      {choiceSelected !== null ? <div className={`rounded-xl border px-4 py-3 text-base font-bold ${currentCorrect ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-amber-500/40 bg-amber-500/10 text-amber-200"}`} aria-live="polite"><p>{encouragement(Boolean(currentCorrect))}</p>{currentCorrect ? <p className="mt-1 text-sm font-semibold text-emerald-300">Star earned. Keep going.</p> : <p className="mt-1 text-sm font-semibold">Read the prompt again and continue.</p>}</div> : null}
                      {choiceSelected !== null ? <button type="button" onClick={moveToNextQuestion} className="min-h-12 rounded-xl bg-emerald-600 px-6 py-3 text-base font-black text-white transition hover:bg-emerald-500 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300/60" aria-label={questionNumber < TOTAL_QUESTIONS ? "Next question" : "View summary"}>{questionNumber < TOTAL_QUESTIONS ? "Next question" : "View summary"}</button> : null}
                    </div>
                  )
                ) : (
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-emerald-100">
                      <p className="text-sm font-black uppercase tracking-[0.12em]">Celebration</p>
                      <p className="mt-2 text-xl font-black sm:text-2xl">You completed a {selectedKeyStage.toUpperCase()} {selectedSubject} lesson!</p>
                      <p className="mt-1 text-sm font-semibold">Keep this momentum going with full personalised learning.</p>
                    </div>
                    <h2 className="text-2xl font-black text-white sm:text-3xl">Lesson Summary</h2>
                    <p className="text-base font-semibold text-slate-200">{stars === TOTAL_QUESTIONS ? "Amazing lesson. You answered every question correctly." : stars >= 2 ? "Strong lesson. Keep practicing and you will level up quickly." : "Nice effort. Every question helps your brain grow."}</p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4"><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Questions completed</p><p className="mt-2 text-2xl font-black text-white">{TOTAL_QUESTIONS}/{TOTAL_QUESTIONS}</p></div>
                      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4"><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Stars earned</p><p className="mt-2 text-2xl font-black text-white">{stars}</p></div>
                      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4"><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Subject completed</p><p className="mt-2 text-2xl font-black text-white">{SUBJECT_LABELS[selectedSubject]}</p></div>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                      <button type="button" onClick={() => { void completeActivity() }} disabled={phase === "completing" || phase === "done"} className="min-h-12 rounded-xl bg-blue-600 px-6 py-3 text-base font-black text-white transition hover:bg-blue-500 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300/60 disabled:cursor-not-allowed disabled:opacity-60" aria-label="Complete activity">{phase === "completing" ? "Saving..." : phase === "done" ? "Completed" : "Complete activity"}</button>
                      <Link href={trial ? `/signup?email=${encodeURIComponent(trial.email)}` : "/signup"} className="min-h-12 rounded-xl border border-emerald-500/70 bg-emerald-500/15 px-6 py-3 text-base font-black text-emerald-100 transition hover:bg-emerald-500/25 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300/60">Unlock full personalised learning</Link>
                      <Link href={`/trial/dashboard?keyStage=${encodeURIComponent(selectedKeyStage)}`} className="min-h-12 rounded-xl border border-slate-700 px-6 py-3 text-base font-black text-slate-200 transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-300/50">Back to dashboard</Link>
                      <Link href={`/trial/dashboard?keyStage=${encodeURIComponent(selectedKeyStage)}#trial-subjects`} className="min-h-12 rounded-xl border border-blue-500/60 bg-blue-500/20 px-6 py-3 text-base font-black text-blue-100 transition hover:bg-blue-500/30 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300/60">Try another subject</Link>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </section>
    </PublicShell>
  )
}
