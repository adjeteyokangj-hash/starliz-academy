"use client"

import Link from "next/link"
import { FormEvent, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import PublicShell from "@/components/layout/PublicShell"

type Toast = { type: "success" | "error"; message: string } | null

type SignupErrors = Partial<Record<
  | "parentName"
  | "email"
  | "phone"
  | "password"
  | "confirmPassword"
  | "childName"
  | "childAge"
  | "yearGroup"
  | "focus"
  | "terms"
  | "general",
  string
>>

const YEAR_GROUP_OPTIONS = ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5"] as const
const MAIN_FOCUS_OPTIONS = ["Spelling", "Maths", "Reading", "All subjects"] as const
const AVATARS = ["🦊", "🦄", "🐼", "🐯", "🐬", "🐧"] as const

const inputCls = "mt-2 w-full rounded-2xl border border-slate-700/80 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isValidPhone(value: string): boolean {
  return /^\+?[0-9\s()\-]{8,20}$/.test(value.trim())
}

function buildStrongPassword(length = 14): string {
  const lower = "abcdefghijkmnopqrstuvwxyz"
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"
  const digits = "23456789"
  const symbols = "!@#$%&*?"
  const groups = [lower, upper, digits, symbols]
  const all = groups.join("")

  const bytes = new Uint32Array(length + groups.length)
  crypto.getRandomValues(bytes)

  const required = groups.map((group, index) => group[bytes[index] % group.length])
  const remaining = Array.from(bytes.slice(groups.length), (value) => all[value % all.length])
  const chars = [...required, ...remaining].slice(0, length)
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = bytes[i] % (i + 1)
    const tmp = chars[i]
    chars[i] = chars[j]
    chars[j] = tmp
  }

  return chars.join("")
}

function progressWidthClass(value: number): string {
  if (value >= 100) return "w-full"
  if (value >= 88) return "w-11/12"
  if (value >= 75) return "w-3/4"
  if (value >= 63) return "w-2/3"
  if (value >= 50) return "w-1/2"
  if (value >= 38) return "w-2/5"
  if (value >= 25) return "w-1/4"
  if (value >= 13) return "w-1/6"
  return "w-1/12"
}

export default function SignupPage() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(1)

  const [parentName, setParentName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [childName, setChildName] = useState("")
  const [childAge, setChildAge] = useState("")
  const [yearGroup, setYearGroup] = useState<(typeof YEAR_GROUP_OPTIONS)[number]>("Year 1")
  const [focus, setFocus] = useState<(typeof MAIN_FOCUS_OPTIONS)[number]>("All subjects")
  const [avatar, setAvatar] = useState<(typeof AVATARS)[number]>("🦊")
  const [favouriteSubject, setFavouriteSubject] = useState<(typeof MAIN_FOCUS_OPTIONS)[number]>("Spelling")
  const [learningConfidence, setLearningConfidence] = useState<"Needs support" | "Growing" | "Confident">("Growing")

  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [marketingOptIn, setMarketingOptIn] = useState(false)

  const [errors, setErrors] = useState<SignupErrors>({})
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<Toast>(null)

  const completion = useMemo(() => {
    const checks = [
      parentName.trim().length > 0,
      isValidEmail(email),
      isValidPhone(phone),
      password.length >= 8,
      confirmPassword === password && confirmPassword.length > 0,
      childName.trim().length > 0,
      Number.isFinite(Number(childAge)) && Number(childAge) >= 5 && Number(childAge) <= 10,
      acceptedTerms,
    ]
    const done = checks.filter(Boolean).length
    return Math.round((done / checks.length) * 100)
  }, [acceptedTerms, childAge, childName, confirmPassword, email, parentName, password, phone])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(id)
  }, [toast])

  function validateStepOne(): SignupErrors {
    const next: SignupErrors = {}
    if (!parentName.trim()) next.parentName = "Parent full name is required."
    if (!email.trim() || !isValidEmail(email)) next.email = "Enter a valid email address."
    if (!phone.trim() || !isValidPhone(phone)) next.phone = "Enter a valid phone number."
    if (!password || password.length < 8) next.password = "Password must be at least 8 characters."
    if (!confirmPassword) next.confirmPassword = "Confirm your password."
    if (password && confirmPassword && password !== confirmPassword) {
      next.confirmPassword = "Passwords do not match."
    }
    return next
  }

  function validateStepTwo(): SignupErrors {
    const next: SignupErrors = {}
    const age = Number(childAge)
    if (!childName.trim()) next.childName = "Child first name is required."
    if (!childAge || !Number.isFinite(age) || age < 5 || age > 10) {
      next.childAge = "Child age must be between 5 and 10."
    }
    if (!yearGroup) next.yearGroup = "Select a year group."
    if (!focus) next.focus = "Select a learning focus."
    return next
  }

  function validateStepThree(): SignupErrors {
    const next: SignupErrors = {}
    if (!acceptedTerms) {
      next.terms = "Please agree to Terms and Privacy Policy."
    }
    return next
  }

  function goNextStep() {
    const stepErrors = step === 1 ? validateStepOne() : validateStepTwo()
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors)
      setToast({ type: "error", message: "Please fix the highlighted fields." })
      return
    }
    setErrors({})
    setStep((current) => (current === 1 ? 2 : 3))
  }

  function generatePassword() {
    const generated = buildStrongPassword()
    setPassword(generated)
    setConfirmPassword(generated)
    setShowPassword(true)
    setShowConfirmPassword(true)
    setErrors((current) => ({ ...current, password: undefined, confirmPassword: undefined }))
    setToast({ type: "success", message: "Strong password generated." })
  }

  function goPrevStep() {
    setErrors({})
    setStep((current) => (current === 3 ? 2 : 1))
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = {
      ...validateStepOne(),
      ...validateStepTwo(),
      ...validateStepThree(),
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      setToast({ type: "error", message: "Please complete all required fields." })
      if (nextErrors.parentName || nextErrors.email || nextErrors.phone || nextErrors.password || nextErrors.confirmPassword) {
        setStep(1)
      } else if (nextErrors.childName || nextErrors.childAge || nextErrors.yearGroup || nextErrors.focus) {
        setStep(2)
      } else {
        setStep(3)
      }
      return
    }

    setErrors({})
    setLoading(true)

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: parentName,
          email,
          phone,
          password,
          marketingOptIn,
          child: {
            name: childName,
            age: Number(childAge),
            yearGroup,
            mainFocus: focus,
            avatar,
            favouriteSubject,
            learningConfidence,
          },
        }),
      })
      const payload = (await response.json()) as { error?: string }

      if (!response.ok) {
        setErrors({ general: payload.error ?? "Unable to create account." })
        setToast({ type: "error", message: payload.error ?? "Could not complete sign up." })
        return
      }

      setToast({ type: "success", message: "Account created successfully. Redirecting..." })
      router.replace("/consent")
    } catch {
      setErrors({ general: "Unable to create account right now." })
      setToast({ type: "error", message: "Network error. Please try again." })
    } finally {
      setLoading(false)
    }
  }

  return (
    <PublicShell>
      <section className="relative overflow-hidden px-4 py-10 sm:px-6 lg:py-14">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_45%_at_10%_20%,rgba(56,189,248,0.12),transparent),radial-gradient(ellipse_60%_50%_at_90%_85%,rgba(99,102,241,0.16),transparent)]" />

        <div className="relative mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-start">
          <div className="rounded-3xl border border-slate-800/90 bg-slate-900/45 p-6 shadow-2xl backdrop-blur-sm sm:p-8">
            <p className="inline-flex rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1 text-xs font-bold uppercase tracking-[0.18em] text-blue-300">
              Parent onboarding
            </p>
            <h1 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">
              Start your child&apos;s learning journey
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-300">
              AI-powered spelling, maths and reading designed to help children grow with confidence.
            </p>

            <div className="mt-7 grid gap-4">
              {[
                { icon: "🧠", title: "AI-powered personalised learning", desc: "Lessons adapt to your child in real time." },
                { icon: "📊", title: "Parent progress dashboard and reports", desc: "See strengths, weak areas and growth trends." },
                { icon: "⭐", title: "Rewards, motivation and safe child profiles", desc: "XP, stars and parent-controlled account safety." },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl border border-slate-700/80 bg-slate-950/45 p-4 transition hover:border-blue-500/40 hover:bg-slate-900/60">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-2xl">{item.icon}</span>
                    <div>
                      <h3 className="text-base font-bold text-white">{item.title}</h3>
                      <p className="mt-1 text-sm text-slate-400">{item.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold text-slate-300">
              <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1">Adaptive learning engine</span>
              <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1">UK curriculum aligned</span>
              <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1">Safe parent-controlled accounts</span>
            </div>

            <div className="relative mt-8 overflow-hidden rounded-3xl border border-slate-700/80 bg-linear-to-br from-indigo-600/18 via-slate-900/90 to-blue-600/10 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-700/70 bg-slate-950/65 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Progress preview</p>
                  <p className="mt-2 text-sm text-slate-300">Weekly confidence</p>
                  <div className="mt-3 h-2 rounded-full bg-slate-800">
                    <div className="h-2 w-[76%] rounded-full bg-linear-to-r from-blue-500 to-indigo-400" />
                  </div>
                  <p className="mt-2 text-xs text-emerald-300">+24% improvement this month</p>
                </div>
                <div className="space-y-3">
                  <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3">
                    <p className="text-xs font-bold text-amber-200">Achievement unlocked</p>
                    <p className="mt-1 text-sm font-semibold">Daily streak x7</p>
                  </div>
                  <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-3">
                    <p className="text-xs font-bold text-blue-200">Rewards snapshot</p>
                    <p className="mt-1 text-sm text-slate-200">XP 860 · Stars 124 · Coins 210</p>
                  </div>
                </div>
              </div>
            </div>

            <p className="mt-6 text-sm font-semibold text-blue-300">Start your free trial today.</p>
          </div>

          <div className="rounded-3xl border border-slate-700/70 bg-slate-900/55 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.6)] backdrop-blur-md sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-300">Parent Registration</p>
            <h2 className="mt-2 text-3xl font-black">Create your account</h2>
            <p className="mt-2 text-sm text-slate-400">Set up your parent account and create your child&apos;s learning profile.</p>

            <div className="mt-5 grid grid-cols-3 gap-2 text-xs sm:text-sm">
              {[
                { index: 1, title: "Parent Details" },
                { index: 2, title: "Child Profile" },
                { index: 3, title: "Start Learning" },
              ].map((item) => {
                const active = step >= item.index
                return (
                  <div key={item.title} className="rounded-2xl border border-slate-700 bg-slate-950/65 p-3">
                    <p className={`font-bold ${active ? "text-blue-300" : "text-slate-500"}`}>Step {item.index}</p>
                    <p className={`mt-1 font-semibold ${active ? "text-white" : "text-slate-500"}`}>{item.title}</p>
                  </div>
                )
              })}
            </div>

            <form className="mt-6 space-y-5" onSubmit={onSubmit} noValidate>
              {step === 1 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="sm:col-span-2">
                    <span className="text-sm font-semibold text-slate-300">Parent full name</span>
                    <input
                      name="parentName"
                      autoComplete="name"
                      value={parentName}
                      onChange={(event) => setParentName(event.target.value)}
                      className={inputCls}
                      placeholder="Your full name"
                    />
                    {errors.parentName ? <p className="mt-1 text-xs font-semibold text-rose-300">{errors.parentName}</p> : null}
                  </label>

                  <label className="sm:col-span-2">
                    <span className="text-sm font-semibold text-slate-300">Email address</span>
                    <input
                      name="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className={inputCls}
                      placeholder="you@example.com"
                    />
                    {errors.email ? <p className="mt-1 text-xs font-semibold text-rose-300">{errors.email}</p> : null}
                  </label>

                  <label className="sm:col-span-2">
                    <span className="text-sm font-semibold text-slate-300">Phone number</span>
                    <input
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      className={inputCls}
                      placeholder="+44 7000 000000"
                    />
                    {errors.phone ? <p className="mt-1 text-xs font-semibold text-rose-300">{errors.phone}</p> : null}
                  </label>

                  <label>
                    <span className="text-sm font-semibold text-slate-300">Password</span>
                    <div className="relative">
                      <input
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className={`${inputCls} pr-16`}
                        placeholder="Minimum 8 characters"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-white"
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={generatePassword}
                      className="mt-2 rounded-xl border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-xs font-bold text-blue-200 transition hover:bg-blue-500/20"
                    >
                      Generate strong password
                    </button>
                    {errors.password ? <p className="mt-1 text-xs font-semibold text-rose-300">{errors.password}</p> : null}
                  </label>

                  <label>
                    <span className="text-sm font-semibold text-slate-300">Confirm password</span>
                    <div className="relative">
                      <input
                        name="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        className={`${inputCls} pr-16`}
                        placeholder="Re-enter password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((value) => !value)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-white"
                      >
                        {showConfirmPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                    {errors.confirmPassword ? <p className="mt-1 text-xs font-semibold text-rose-300">{errors.confirmPassword}</p> : null}
                  </label>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label>
                    <span className="text-sm font-semibold text-slate-300">Child first name</span>
                    <input
                      name="childName"
                      value={childName}
                      onChange={(event) => setChildName(event.target.value)}
                      className={inputCls}
                      placeholder="Child first name"
                    />
                    {errors.childName ? <p className="mt-1 text-xs font-semibold text-rose-300">{errors.childName}</p> : null}
                  </label>

                  <label>
                    <span className="text-sm font-semibold text-slate-300">Child age</span>
                    <input
                      name="childAge"
                      type="number"
                      min={5}
                      max={10}
                      value={childAge}
                      onChange={(event) => setChildAge(event.target.value)}
                      className={inputCls}
                      placeholder="5-10"
                    />
                    {errors.childAge ? <p className="mt-1 text-xs font-semibold text-rose-300">{errors.childAge}</p> : null}
                  </label>

                  <label>
                    <span className="text-sm font-semibold text-slate-300">Year group</span>
                    <select name="yearGroup" value={yearGroup} onChange={(event) => setYearGroup(event.target.value as (typeof YEAR_GROUP_OPTIONS)[number])} className={inputCls}>
                      {YEAR_GROUP_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                    </select>
                    {errors.yearGroup ? <p className="mt-1 text-xs font-semibold text-rose-300">{errors.yearGroup}</p> : null}
                  </label>

                  <label>
                    <span className="text-sm font-semibold text-slate-300">Main learning focus</span>
                    <select name="focus" value={focus} onChange={(event) => setFocus(event.target.value as (typeof MAIN_FOCUS_OPTIONS)[number])} className={inputCls}>
                      {MAIN_FOCUS_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                    </select>
                    {errors.focus ? <p className="mt-1 text-xs font-semibold text-rose-300">{errors.focus}</p> : null}
                  </label>

                  <div className="sm:col-span-2">
                    <span className="text-sm font-semibold text-slate-300">Avatar selection</span>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {AVATARS.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setAvatar(item)}
                          className={`rounded-2xl border px-3 py-2 text-2xl transition ${avatar === item ? "border-blue-500 bg-blue-500/15" : "border-slate-700 bg-slate-950 hover:border-slate-500"}`}
                          aria-label={`Select avatar ${item}`}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label>
                    <span className="text-sm font-semibold text-slate-300">Favourite subject (optional)</span>
                    <select value={favouriteSubject} onChange={(event) => setFavouriteSubject(event.target.value as (typeof MAIN_FOCUS_OPTIONS)[number])} className={inputCls}>
                      {MAIN_FOCUS_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                    </select>
                  </label>

                  <label>
                    <span className="text-sm font-semibold text-slate-300">Learning confidence (optional)</span>
                    <select value={learningConfidence} onChange={(event) => setLearningConfidence(event.target.value as "Needs support" | "Growing" | "Confident")} className={inputCls}>
                      <option>Needs support</option>
                      <option>Growing</option>
                      <option>Confident</option>
                    </select>
                  </label>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-300">
                    <p className="font-bold text-white">Review before creating account</p>
                    <p className="mt-2">Parent: {parentName || "-"} ({email || "-"})</p>
                    <p className="mt-1">Phone: {phone || "-"}</p>
                    <p className="mt-1">Child: {avatar} {childName || "-"}, age {childAge || "-"}, {yearGroup}</p>
                    <p className="mt-1">Focus: {focus}</p>
                  </div>

                  <label className="flex items-start gap-3 rounded-2xl border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={acceptedTerms}
                      onChange={(event) => setAcceptedTerms(event.target.checked)}
                      className="mt-1"
                    />
                    <span>
                      I agree to the <Link href="/terms" className="text-blue-300 hover:text-blue-200">Terms</Link> and <Link href="/privacy" className="text-blue-300 hover:text-blue-200">Privacy Policy</Link> and confirm I am the parent or guardian.
                    </span>
                  </label>
                  {errors.terms ? <p className="-mt-1 text-xs font-semibold text-rose-300">{errors.terms}</p> : null}

                  <label className="flex items-start gap-3 rounded-2xl border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={marketingOptIn}
                      onChange={(event) => setMarketingOptIn(event.target.checked)}
                      className="mt-1"
                    />
                    <span>Send me learning tips, progress updates and new feature announcements.</span>
                  </label>

                  <div className="rounded-2xl border border-blue-600/30 bg-blue-500/10 p-4 text-sm text-blue-100">
                    <p className="font-bold">Ready to start</p>
                    <p className="mt-1 text-blue-200">We will create your parent account and your first child profile in one step.</p>
                  </div>
                </div>
              ) : null}

              {errors.general ? <p className="text-sm font-semibold text-rose-300">{errors.general}</p> : null}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="text-xs font-semibold text-slate-500">Progress {completion}%</div>
                <div className="h-2 w-32 rounded-full bg-slate-800">
                  <div className={`h-2 rounded-full bg-linear-to-r from-blue-500 to-indigo-400 transition-all ${progressWidthClass(completion)}`} />
                </div>
              </div>

              <div className="mt-1 flex flex-wrap gap-3">
                {step > 1 ? (
                  <button
                    type="button"
                    onClick={goPrevStep}
                    className="flex-1 rounded-2xl border border-slate-700 px-5 py-3 font-bold text-slate-200 transition hover:bg-slate-800"
                  >
                    Back
                  </button>
                ) : null}

                {step < 3 ? (
                  <button
                    type="button"
                    onClick={goNextStep}
                    className="flex-1 rounded-2xl bg-blue-600 px-5 py-3 font-bold transition hover:bg-blue-500"
                  >
                    Continue
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 rounded-2xl bg-blue-600 px-5 py-3 font-bold transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? "Creating account..." : "Create Account & Start Free Trial"}
                  </button>
                )}
              </div>

              <p className="text-center text-sm text-slate-400">
                Already have an account? <Link href="/login" className="font-bold text-blue-300 hover:text-blue-200">Login</Link>
              </p>
            </form>
          </div>
        </div>
      </section>

      {toast ? (
        <div className="fixed right-4 top-20 z-50 max-w-sm rounded-2xl border border-slate-700 bg-slate-900/95 px-4 py-3 shadow-2xl backdrop-blur transition">
          <p className={`text-sm font-bold ${toast.type === "success" ? "text-emerald-300" : "text-rose-300"}`}>{toast.message}</p>
        </div>
      ) : null}
    </PublicShell>
  )
}
