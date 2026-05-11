"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Login failed.");
        return;
      }
      if (payload.user?.role !== "admin") {
        setError("Admin access required.");
        return;
      }
      const nextPath = new URLSearchParams(window.location.search).get("next");
      router.replace(nextPath?.startsWith("/admin") ? nextPath : "/admin");
    } catch {
      setError("Unable to login right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-4 sm:py-10">
      <section className="w-full max-w-md rounded-2xl sm:rounded-3xl bg-white/90 p-6 sm:p-8 shadow-xl ring-1 ring-slate-200">
        <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.18em] text-primary">Admin Account</p>
        <h1 className="mt-2 font-heading text-3xl sm:text-4xl font-black text-slate-900">Admin Login</h1>
        <p className="mt-2 text-sm sm:text-base text-slate-600">Sign in to manage school data, content, users, and system settings.</p>

        <form className="mt-6 space-y-3 sm:space-y-4" onSubmit={onSubmit}>
          <label className="block text-xs sm:text-sm font-semibold text-slate-700">
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg sm:rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs sm:text-sm font-semibold text-slate-700">
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg sm:rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          {error ? <p className="text-xs sm:text-sm font-semibold text-rose-700">{error}</p> : null}

          <Button type="submit" className="w-full mt-2" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </Button>
        </form>

        <p className="mt-4 text-xs sm:text-sm text-slate-600">
          Back to <Link href="/" className="font-bold text-primary">home</Link>
        </p>
      </section>
    </main>
  );
}
