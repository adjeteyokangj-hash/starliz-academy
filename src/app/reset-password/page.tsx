"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PublicShell from "@/components/layout/PublicShell";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function resetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/auth/password-reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setError(payload?.error ?? "Could not reset password.");
      setLoading(false);
      return;
    }

    setMessage("Password updated. You can log in with your new password.");
    setPassword("");
    setConfirmPassword("");
    setLoading(false);
  }

  return (
    <PublicShell>
      <section className="mx-auto max-w-lg px-6 py-16">
        <h1 className="text-4xl font-black">Choose a new password</h1>
        <p className="mt-3 text-slate-400">Use at least 8 characters.</p>

        <form onSubmit={resetPassword} className="mt-8 rounded-[2rem] border border-slate-800 bg-slate-900 p-8">
          {!token ? <p className="mb-5 rounded-xl bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-200">Reset token is missing.</p> : null}

          <label className="block">
            <span className="text-sm font-bold text-slate-200">New password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-400"
            />
          </label>

          <label className="mt-5 block">
            <span className="text-sm font-bold text-slate-200">Confirm password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              minLength={8}
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-400"
            />
          </label>

          {error ? <p className="mt-4 rounded-xl bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-200">{error}</p> : null}
          {message ? <p className="mt-4 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-200">{message}</p> : null}

          <button
            type="submit"
            disabled={loading || !token}
            className="mt-6 w-full rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {loading ? "Saving..." : "Reset password"}
          </button>

          <Link href="/login" className="mt-5 block text-center text-sm font-bold text-blue-200 hover:text-blue-100">
            Back to login
          </Link>
        </form>
      </section>
    </PublicShell>
  );
}

