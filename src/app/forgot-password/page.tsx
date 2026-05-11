"use client";

import { useState } from "react";
import Link from "next/link";
import PublicShell from "@/components/layout/PublicShell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [devResetUrl, setDevResetUrl] = useState("");

  async function requestReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");
    setDevResetUrl("");

    const response = await fetch("/api/auth/password-reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setError(payload?.error ?? "Could not start password reset.");
      setLoading(false);
      return;
    }

    setMessage(payload?.message ?? "If that email is registered, a reset link has been sent.");
    setDevResetUrl(payload?.devResetUrl ?? "");
    setLoading(false);
  }

  return (
    <PublicShell>
      <section className="mx-auto max-w-lg px-6 py-16">
        <h1 className="text-4xl font-black">Reset your password</h1>
        <p className="mt-3 text-slate-400">Enter your parent account email and we will send a secure reset link.</p>

        <form onSubmit={requestReset} className="mt-8 rounded-[2rem] border border-slate-800 bg-slate-900 p-8">
          <label className="block">
            <span className="text-sm font-bold text-slate-200">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-400"
              placeholder="you@example.com"
            />
          </label>

          {error ? <p className="mt-4 rounded-xl bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-200">{error}</p> : null}
          {message ? <p className="mt-4 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-200">{message}</p> : null}
          {devResetUrl ? (
            <Link href={devResetUrl} className="mt-4 block break-words rounded-xl bg-slate-800 px-4 py-3 text-sm font-bold text-blue-200 underline">
              Open local reset link
            </Link>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {loading ? "Sending..." : "Send reset link"}
          </button>

          <Link href="/login" className="mt-5 block text-center text-sm font-bold text-blue-200 hover:text-blue-100">
            Back to login
          </Link>
        </form>
      </section>
    </PublicShell>
  );
}

