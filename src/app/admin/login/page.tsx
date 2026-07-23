"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Logo from "@/components/Logo";
import Button from "@/components/ui/Button";

function resolveAdminNextPath(value: string | null): string {
  if (!value) return "/admin";
  if (!value.startsWith("/admin")) return "/admin";
  if (value.startsWith("//")) return "/admin";
  return value;
}

function AdminLoginForm() {
  const searchParams = useSearchParams();
  const switching = searchParams.get("reason") === "switch";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Clear a parent/student cookie so admin login isn't blocked by the old session.
  useEffect(() => {
    if (!switching) return;
    void fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => undefined);
  }, [switching]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // Prefer FormData so browser autofill values are included even when React state is stale.
      const formData = new FormData(event.currentTarget);
      const submittedEmail = String(formData.get("email") ?? email).trim();
      const submittedPassword = String(formData.get("password") ?? password);
      if (!submittedEmail || !submittedPassword) {
        setError("Enter your admin email and password.");
        return;
      }
      setEmail(submittedEmail);
      setPassword(submittedPassword);

      // Always clear the previous session before admin sign-in.
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => undefined);
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: submittedEmail, password: submittedPassword }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Login failed.");
        return;
      }
      if (payload.user?.role !== "admin") {
        setError("Admin access required. Use an admin account email, not a parent login.");
        return;
      }
      const nextPath = resolveAdminNextPath(searchParams.get("next"));
      window.location.assign(nextPath);
    } catch {
      setError("Unable to login right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="admin-login-panel relative w-full max-w-md rounded-3xl border border-white/70 bg-white/95 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.18)] sm:p-8">
      <div className="mb-5 flex justify-center sm:justify-start">
        <Logo variant="wordmark" size={30} animation={false} className="pointer-events-none" textClassName="text-slate-900" />
      </div>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-700">Admin portal</p>
      <h1 className="mt-2 font-heading text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">Sign in</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
        Manage schools, content, users, and system settings for StarLiz Academy.
      </p>
      {switching ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Your previous session was not an admin account. Sign in with admin credentials to continue.
        </p>
      ) : null}

      <form className="mt-7 space-y-4" onSubmit={onSubmit}>
        <label className="block text-sm font-semibold text-slate-700">
          Email
          <input
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            // Password managers inject attributes like wfd-id before hydration.
            suppressHydrationWarning
            className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50/80 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-cyan-600 focus:bg-white focus:ring-2 focus:ring-cyan-600/20"
          />
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          Password
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            // Password managers inject attributes like wfd-id before hydration.
            suppressHydrationWarning
            className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50/80 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-cyan-600 focus:bg-white focus:ring-2 focus:ring-cyan-600/20"
          />
        </label>

        {error ? (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="mt-1 w-full" disabled={loading} aria-busy={loading}>
          {loading ? "Signing in..." : "Sign in to Admin"}
        </Button>
      </form>

      <p className="mt-4 text-sm text-slate-600">
        Forgot password?{" "}
        <Link
          href="/auth/forgot-password?from=admin"
          className="font-bold text-cyan-700 underline-offset-2 hover:underline"
        >
          Reset it by email
        </Link>
      </p>
      <p className="mt-3 text-sm text-slate-600">
        Back to{" "}
        <Link href="/" className="font-bold text-cyan-700 underline-offset-2 hover:underline">
          home
        </Link>
      </p>
    </section>
  );
}

function AdminLoginFallback() {
  return (
    <section className="admin-login-panel relative w-full max-w-md rounded-3xl border border-white/70 bg-white/95 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.18)] sm:p-8">
      <div className="mb-5 flex justify-center sm:justify-start">
        <Logo variant="wordmark" size={30} animation={false} className="pointer-events-none" textClassName="text-slate-900" />
      </div>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-700">Admin portal</p>
      <h1 className="mt-2 font-heading text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">Sign in</h1>
      <p className="mt-2 text-sm text-slate-600">Loading sign-in form...</p>
      <div className="mt-7 space-y-3">
        <div className="h-11 animate-pulse rounded-xl bg-slate-200/80" />
        <div className="h-11 animate-pulse rounded-xl bg-slate-200/80" />
        <div className="h-11 animate-pulse rounded-xl bg-slate-200/80" />
      </div>
    </section>
  );
}

function AdminBrandPanel() {
  return (
    <aside className="admin-login-brand relative hidden min-h-[28rem] overflow-hidden rounded-3xl border border-white/10 bg-[#07111f] p-8 text-white lg:flex lg:flex-col lg:justify-between">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -left-16 top-10 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute -right-10 bottom-8 h-64 w-64 rounded-full bg-sky-500/15 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(148,163,184,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.35) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      <div className="relative">
        <Logo variant="wordmark" size={34} animation={false} className="pointer-events-none" textClassName="text-white" />
        <p className="mt-8 text-xs font-bold uppercase tracking-[0.24em] text-cyan-200/90">Operations console</p>
        <h2 className="mt-3 max-w-sm font-heading text-4xl font-black leading-tight tracking-tight text-white">
          Keep every classroom learning journey on course.
        </h2>
        <p className="mt-4 max-w-sm text-sm leading-6 text-slate-300">
          One secure admin space for curriculum, schools, content, and learner support across StarLiz Academy.
        </p>
      </div>

      <ul className="relative mt-10 space-y-3 text-sm text-slate-200">
        <li className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-sm bg-cyan-300" aria-hidden />
          <span>School and user administration</span>
        </li>
        <li className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-sm bg-sky-300" aria-hidden />
          <span>Content library and curriculum tools</span>
        </li>
        <li className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-sm bg-teal-300" aria-hidden />
          <span>Safeguarding-aware system controls</span>
        </li>
      </ul>
    </aside>
  );
}

export default function AdminLoginPage() {
  return (
    <main className="admin-login-shell relative isolate flex min-h-screen items-center justify-center overflow-hidden px-4 py-8 sm:py-12">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="absolute inset-0 bg-[linear-gradient(160deg,#e8f7ff_0%,#f4f7fb_42%,#eef2ff_100%)]" />
        <div className="absolute -left-24 top-0 h-80 w-80 rounded-full bg-cyan-300/30 blur-3xl" />
        <div className="absolute -right-16 bottom-0 h-96 w-96 rounded-full bg-sky-400/20 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(15,23,42,0.08) 1px, transparent 0)",
            backgroundSize: "22px 22px",
          }}
        />
      </div>

      <div className="admin-login-stage mx-auto grid w-full max-w-6xl items-stretch gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <AdminBrandPanel />
        <div className="flex items-center justify-center lg:justify-end">
          <Suspense fallback={<AdminLoginFallback />}>
            <AdminLoginForm />
          </Suspense>
        </div>
      </div>

      <style jsx global>{`
        .admin-login-brand {
          animation: admin-login-rise 700ms ease-out both;
        }
        .admin-login-panel {
          animation: admin-login-rise 700ms ease-out 120ms both;
        }
        @keyframes admin-login-rise {
          from {
            opacity: 0;
            transform: translateY(14px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </main>
  );
}
