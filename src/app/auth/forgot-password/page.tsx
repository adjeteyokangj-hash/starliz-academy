"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";

const SUCCESS_MESSAGE = "If an account exists, a reset link has been sent.";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => null) as { message?: string; error?: string } | null;

      if (!response.ok) {
        setError(payload?.error ?? "Unable to send reset link right now.");
        return;
      }

      setMessage(payload?.message ?? SUCCESS_MESSAGE);
      setEmail("");
    } catch {
      setError("Unable to send reset link right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-4 sm:py-10">
      <section className="w-full max-w-md rounded-2xl sm:rounded-3xl bg-white/90 p-6 sm:p-8 shadow-xl ring-1 ring-slate-200">
        <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.18em] text-primary">Parent Account</p>
        <h1 className="mt-2 font-heading text-3xl sm:text-4xl font-black text-slate-900">Reset Password</h1>
        <p className="mt-2 text-sm sm:text-base text-slate-600">
          Enter your parent account email and we will send a secure reset link.
        </p>

        <form className="mt-6 space-y-3 sm:space-y-4" onSubmit={onSubmit}>
          <label className="block text-xs sm:text-sm font-semibold text-slate-700">
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-lg sm:rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          {error ? <p className="text-xs sm:text-sm font-semibold text-rose-700">{error}</p> : null}
          {message ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs sm:text-sm font-semibold text-emerald-700">
              {message}
            </p>
          ) : null}

          <Button type="submit" className="w-full mt-2" disabled={loading}>
            {loading ? "Sending..." : "Send reset link"}
          </Button>
        </form>

        <p className="mt-4 text-xs sm:text-sm text-slate-600">
          Remembered it? <Link href="/auth/login" className="font-bold text-primary">Back to login</Link>
        </p>
      </section>
    </main>
  );
}
