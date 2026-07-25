"use client"

import Link from "next/link"
import { FormEvent, useState } from "react"
import { useSearchParams } from "next/navigation"
import Logo from "@/components/Logo"
import PublicShell from "@/components/layout/PublicShell"

export default function LoginPage() {
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
        window.location.assign(nextPath?.startsWith("/admin") ? nextPath : "/admin")
        return
      }
      if (payload.user?.role === "teacher") {
        window.location.assign(nextPath?.startsWith("/teacher") ? nextPath : "/teacher")
        return
      }
      if (nextPath?.startsWith("/") && !nextPath.startsWith("//")) {
        window.location.assign(nextPath)
        return
      }

      window.location.assign("/parent/profiles")
    } catch {
      setError("Unable to login right now.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <PublicShell>
      <section className="mx-auto max-w-lg px-6 py-10">
        <div className="mb-6 flex justify-center">
          <Logo variant="wordmark" size={30} animation={false} className="pointer-events-none" />
        </div>
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
                suppressHydrationWarning
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
                suppressHydrationWarning
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
