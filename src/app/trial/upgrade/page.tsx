"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useMemo, useState } from "react"
import PublicShell from "@/components/layout/PublicShell"

export default function TrialUpgradePage() {
  const params = useSearchParams()
  const email = params.get("email") ?? ""
  const signupUrl = params.get("signup") ?? (email ? `/signup?email=${encodeURIComponent(email)}` : "/signup")
  const [loading, setLoading] = useState(false)

  const subjectSummary = useMemo(() => {
    const raw = params.get("subjects")
    if (!raw) return ["spelling activities", "reading exercises", "maths learning"]
    return raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) =>
        item === "spelling" ? "spelling activities" : item === "reading" ? "reading exercises" : "maths learning",
      )
  }, [params])

  async function onUpgrade() {
    setLoading(true)
    try {
      await fetch("/api/trial/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email || undefined }),
      })
    } finally {
      window.location.href = signupUrl
    }
  }

  return (
    <PublicShell>
      <section className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 sm:p-8">
          <p className="inline-flex rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-amber-300">
            Trial Ended
          </p>
          <h1 className="mt-4 text-3xl font-black sm:text-4xl">Welcome back. Your free trial has ended.</h1>
          <p className="mt-3 text-sm text-slate-300 sm:text-base">
            Create your full parent account to continue learning with unlimited personalised support.
          </p>

          <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-950 p-4">
            <p className="text-sm font-semibold text-white">Your child completed:</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              {subjectSummary.map((item) => (
                <li key={item}>✓ {item}</li>
              ))}
            </ul>
          </div>

          <button
            type="button"
            onClick={onUpgrade}
            disabled={loading}
            className="mt-6 w-full rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Redirecting..." : "Create Full Account"}
          </button>

          <p className="mt-4 text-center text-sm text-slate-400">
            Need to re-enter trial email? <Link href="/trial" className="font-semibold text-blue-300 hover:text-blue-200">Return to trial entry</Link>
          </p>
        </div>
      </section>
    </PublicShell>
  )
}
