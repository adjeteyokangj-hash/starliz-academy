"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Button from "@/components/ui/Button";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;

      if (!response.ok) {
        setError(payload?.error ?? "Could not reset password.");
        return;
      }

      router.replace("/auth/login?reset=success");
    } catch {
      setError("Could not reset password right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-4 sm:py-10">
      <section className="w-full max-w-md rounded-2xl sm:rounded-3xl bg-white/90 p-6 sm:p-8 shadow-xl ring-1 ring-slate-200">
        <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.18em] text-primary">Parent Account</p>
        <h1 className="mt-2 font-heading text-3xl sm:text-4xl font-black text-slate-900">Choose New Password</h1>
        <p className="mt-2 text-sm sm:text-base text-slate-600">Use at least 8 characters for your new password.</p>

        <form className="mt-6 space-y-3 sm:space-y-4" onSubmit={onSubmit}>
          {!token ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs sm:text-sm font-semibold text-rose-700">
              Reset token is missing. Please request a new reset link.
            </p>
          ) : null}

          <label className="block text-xs sm:text-sm font-semibold text-slate-700">
            New password
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-lg sm:rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="block text-xs sm:text-sm font-semibold text-slate-700">
            Confirm password
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="mt-1 w-full rounded-lg sm:rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          {error ? <p className="text-xs sm:text-sm font-semibold text-rose-700">{error}</p> : null}

          <Button type="submit" className="w-full mt-2" disabled={loading || !token}>
            {loading ? "Saving..." : "Reset password"}
          </Button>
        </form>

        <p className="mt-4 text-xs sm:text-sm text-slate-600">
          Need a fresh link? <Link href="/auth/forgot-password" className="font-bold text-primary">Request another</Link>
        </p>
      </section>
    </main>
  );
}
