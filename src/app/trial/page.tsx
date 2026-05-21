"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import PublicShell from "@/components/layout/PublicShell"
import { storeTrialEmail } from "@/lib/trial-client"

type StartPayload = {
  status?: "new" | "restored" | "expired" | "account_exists"
  message?: string
  signupUrl?: string
  error?: string
}

export default function TrialEntryPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [consent, setConsent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setInfo(null)

    if (!consent) {
      setError("Please accept the trial email consent to continue.")
      return
    }

    setLoading(true)
    try {
      const response = await fetch("/api/trial/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, emailConsent: consent }),
      })

      const payload = (await response.json()) as StartPayload

      if (!response.ok) {
        setError(payload.error ?? "Unable to start trial.")
        return
      }

      if (payload.status === "new" || payload.status === "restored") {
        storeTrialEmail(email)
        if (payload.message) setInfo(payload.message)
        router.push("/trial/dashboard")
        return
      }

      const next = payload.signupUrl ?? `/signup?email=${encodeURIComponent(email)}`
      router.push(`/trial/upgrade?email=${encodeURIComponent(email)}&signup=${encodeURIComponent(next)}`)
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <PublicShell>
      <section className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl sm:p-8">
          <p className="inline-flex rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
            Free Trial Entry
          </p>
          <h1 className="mt-4 text-3xl font-black sm:text-4xl">Start your free StarLiz trial</h1>
          <p className="mt-3 text-sm text-slate-300 sm:text-base">
            Enter your email for instant access to a limited trial dashboard with 10 learning activities across spelling, reading and maths.
          </p>

          <form onSubmit={onSubmit} className="mt-7 space-y-5" noValidate>
            <label className="block">
              <span className="text-sm font-semibold text-slate-300">Email address</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
              />
            </label>

            <label className="flex items-start gap-3 rounded-2xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                className="mt-1"
              />
              <span>
                I agree to receive trial reminders, educational updates, and learning progress emails.
              </span>
            </label>

            {error ? <p className="text-sm font-semibold text-rose-300">{error}</p> : null}
            {info ? <p className="text-sm font-semibold text-emerald-300">{info}</p> : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Starting trial..." : "Continue to Free Trial"}
            </button>
          </form>
        </div>
      </section>
    </PublicShell>
  )
}
