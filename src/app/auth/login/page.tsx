"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Logo from "@/components/Logo";
import PublicMiniFooter from "@/components/public/PublicMiniFooter";
import Button from "@/components/ui/Button";
import { getLoginDisabledReason } from "@/lib/login-utils";

function ParentLoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const resetSuccess = searchParams.get("reset") === "success";
  const loginDisabledReason = getLoginDisabledReason(email, password);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const formData = new FormData(event.currentTarget);
      const submittedEmail = String(formData.get("email") ?? email).trim();
      const submittedPassword = String(formData.get("password") ?? password);
      if (!submittedEmail || !submittedPassword) {
        setError("Enter your email and password.");
        return;
      }
      setEmail(submittedEmail);
      setPassword(submittedPassword);

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
      const nextPath = new URLSearchParams(window.location.search).get("next");
      const landingPath =
        typeof payload.landingPath === "string" && payload.landingPath.startsWith("/") && !payload.landingPath.startsWith("//")
          ? payload.landingPath
          : null;
      if (payload.user?.role === "admin") {
        window.location.assign(nextPath?.startsWith("/admin") ? nextPath : (landingPath ?? "/admin"));
        return;
      }
      if (payload.user?.role === "teacher") {
        const teacherNext =
          nextPath?.startsWith("/teacher") || nextPath?.startsWith("/school-admin")
            ? nextPath
            : null;
        window.location.assign(teacherNext ?? landingPath ?? "/teacher");
        return;
      }
      if (nextPath?.startsWith("/") && !nextPath.startsWith("//")) {
        window.location.assign(nextPath);
        return;
      }
      window.location.assign(landingPath ?? "/parent/profiles");
    } catch {
      setError("Unable to login right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="parent-login-panel relative w-full max-w-md rounded-3xl border border-white/70 bg-white/95 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.16)] sm:p-8">
      <div className="mb-5 flex justify-center sm:justify-start">
        <Logo variant="wordmark" size={30} animation={false} className="pointer-events-none" textClassName="text-slate-900" />
      </div>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Parent portal</p>
      <h1 className="mt-2 font-heading text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">Sign in</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
        Manage child profiles, follow progress, and celebrate stars and rewards in one calm place.
      </p>

      <form className="mt-7 space-y-4" onSubmit={onSubmit}>
        <label className="block text-sm font-semibold text-slate-700">
          Email
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            suppressHydrationWarning
            className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50/80 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
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
            suppressHydrationWarning
            className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50/80 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
          />
        </label>

        <div className="flex justify-end">
          <Link href="/auth/forgot-password" className="text-sm font-bold text-primary underline-offset-2 hover:underline">
            Forgot password?
          </Link>
        </div>

        {error ? (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            {error}
          </p>
        ) : null}
        {resetSuccess ? (
          <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
            Password updated. Please sign in with your new password.
          </p>
        ) : null}

        {loginDisabledReason ? (
          <p id="login-help" className="text-sm text-slate-500" aria-live="polite">
            {loginDisabledReason}
          </p>
        ) : null}

        <Button
          type="submit"
          className="mt-1 w-full"
          disabled={loading || Boolean(loginDisabledReason)}
          aria-describedby={loginDisabledReason ? "login-help" : undefined}
          aria-busy={loading}
        >
          {loading ? "Signing in..." : "Sign in to Parent Portal"}
        </Button>
      </form>

      <p className="mt-4 text-sm text-slate-600">
        Need an account?{" "}
        <Link href="/auth/signup" className="font-bold text-primary underline-offset-2 hover:underline">
          Create parent account
        </Link>
      </p>
      <p className="mt-3 text-sm text-slate-600">
        Back to{" "}
        <Link href="/" className="font-bold text-primary underline-offset-2 hover:underline">
          home
        </Link>
      </p>
    </section>
  );
}

function ParentLoginFallback() {
  return (
    <section className="parent-login-panel relative w-full max-w-md rounded-3xl border border-white/70 bg-white/95 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.16)] sm:p-8">
      <div className="mb-5 flex justify-center sm:justify-start">
        <Logo variant="wordmark" size={30} animation={false} className="pointer-events-none" textClassName="text-slate-900" />
      </div>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Parent portal</p>
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

function ParentBrandPanel() {
  return (
    <aside className="parent-login-brand relative hidden min-h-[28rem] overflow-hidden rounded-3xl border border-white/10 bg-[#12081f] p-8 text-white lg:flex lg:flex-col lg:justify-between">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -left-16 top-10 h-56 w-56 rounded-full bg-[color-mix(in_srgb,var(--color-primary)_35%,transparent)] blur-3xl" />
        <div className="absolute -right-10 bottom-8 h-64 w-64 rounded-full bg-fuchsia-500/15 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(196,181,253,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(196,181,253,0.35) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      <div className="relative">
        <Logo variant="wordmark" size={34} animation={false} className="pointer-events-none" textClassName="text-white" />
        <p className="mt-8 text-xs font-bold uppercase tracking-[0.24em] text-violet-200/90">Family learning hub</p>
        <h2 className="mt-3 max-w-sm font-heading text-4xl font-black leading-tight tracking-tight text-white">
          Stay close to every step of their journey.
        </h2>
        <p className="mt-4 max-w-sm text-sm leading-6 text-slate-300">
          One secure parent space for profiles, progress, stars, and the support that helps children learn with confidence.
        </p>
      </div>

      <ul className="relative mt-10 space-y-3 text-sm text-slate-200">
        <li className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-sm bg-violet-300" aria-hidden />
          <span>Child profiles and weekly progress</span>
        </li>
        <li className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-sm bg-fuchsia-300" aria-hidden />
          <span>Stars, rewards, and celebration moments</span>
        </li>
        <li className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-sm bg-sky-300" aria-hidden />
          <span>Day School and Short Learning visibility</span>
        </li>
      </ul>
    </aside>
  );
}

export default function LoginPage() {
  return (
    <main className="parent-login-shell relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[#0f0a18] px-4 py-8 pb-24 sm:py-12 sm:pb-24">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="absolute inset-0 bg-[linear-gradient(160deg,#1a0f2e_0%,#0f0a18_45%,#140c22_100%)]" />
        <div className="absolute -left-24 top-0 h-80 w-80 rounded-full bg-primary/25 blur-3xl" />
        <div className="absolute -right-16 bottom-0 h-96 w-96 rounded-full bg-fuchsia-500/10 blur-3xl" />
      </div>

      <div className="parent-login-stage mx-auto grid w-full max-w-6xl items-stretch gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <ParentBrandPanel />
        <div className="flex items-center justify-center lg:justify-end">
          <Suspense fallback={<ParentLoginFallback />}>
            <ParentLoginForm />
          </Suspense>
        </div>
      </div>

      <PublicMiniFooter className="absolute inset-x-0 bottom-0" />

      <style jsx global>{`
        .parent-login-brand {
          animation: parent-login-rise 700ms ease-out both;
        }
        .parent-login-panel {
          animation: parent-login-rise 700ms ease-out 120ms both;
        }
        @keyframes parent-login-rise {
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
