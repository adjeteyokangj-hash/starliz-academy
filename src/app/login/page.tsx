"use client"

import Link from "next/link"
import { FormEvent, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import PublicShell from "@/components/layout/PublicShell"

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const payload = await response.json() as { error?: string; user?: { role?: string } }

      if (!response.ok) {
        setError(payload.error ?? "Login failed.")
        return
      }

      const nextPath = searchParams.get("next")
      if (payload.user?.role === "admin") {
        router.replace(nextPath?.startsWith("/admin") ? nextPath : "/admin")
        return
      }

      const consentResponse = await fetch("/api/consent", { credentials: "include" })
      if (consentResponse.ok) {
        const consent = await consentResponse.json() as { accepted: boolean }
        router.replace(consent.accepted ? "/profiles" : "/consent")
      } else {
        router.replace("/profiles")
      }
    } catch {
      setError("Unable to login right now.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <PublicShell>
      <section className="mx-auto max-w-lg px-6 py-10">
        <h1 className="text-4xl font-black">Welcome back</h1>
        <p className="mt-3 text-slate-400">
          Log in to continue your child’s learning journey.
        </p>

        <form onSubmit={onSubmit} className="mt-8 rounded-[2rem] border border-slate-800 bg-slate-900 p-8">
          <div className="space-y-5">
            <label className="block">
              <span className="text-sm text-slate-300">Email</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3"
                placeholder="you@example.com"
              />
            </label>

            <label className="block">
              <span className="text-sm text-slate-300">Password</span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3"
                placeholder="Your password"
              />
            </label>
          </div>

          {error ? <p className="mt-5 text-sm font-semibold text-rose-300">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="mt-7 w-full rounded-2xl bg-blue-600 px-5 py-4 font-bold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Logging in..." : "Login"}
          </button>

          <div className="mt-5 flex items-center justify-between text-sm">
            <Link href="/signup" className="text-blue-300 hover:text-blue-200">
              Create account
            </Link>
            <Link href="/forgot-password" className="text-slate-400 hover:text-white">
              Forgot password?
            </Link>
          </div>
        </form>
      </section>
    </PublicShell>
  )
}
