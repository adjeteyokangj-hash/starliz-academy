"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Logo from "@/components/Logo";
import PublicMiniFooter from "@/components/public/PublicMiniFooter";
import Button from "@/components/ui/Button";

const SUCCESS_MESSAGE =
  "If an account exists for that email, a secure reset link is on its way. Please check your inbox and spam folder.";

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const fromAdmin = searchParams.get("from") === "admin";
  const loginHref = fromAdmin ? "/admin/login" : "/auth/login";
  const accentLabel = fromAdmin ? "text-cyan-700" : "text-primary";
  const accentLink = fromAdmin
    ? "font-bold text-cyan-700 underline-offset-2 hover:underline"
    : "font-bold text-primary underline-offset-2 hover:underline";
  const focusRing = fromAdmin
    ? "focus:border-[var(--admin-primary)] focus:bg-white focus:ring-2 focus:ring-[var(--admin-primary)]/20"
    : "focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20";
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
    <section className="forgot-password-panel relative w-full max-w-md rounded-3xl border border-white/70 bg-white/95 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.16)] sm:p-8">
      <div className="mb-5 flex justify-center sm:justify-start">
        <Logo variant="wordmark" size={30} animation={false} className="pointer-events-none" textClassName="text-slate-900" />
      </div>
      <p className={`text-xs font-bold uppercase tracking-[0.2em] ${accentLabel}`}>
        {fromAdmin ? "Admin portal" : "Parent portal"}
      </p>
      <h1 className="mt-2 font-heading text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
        Reset Password
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
        Enter your account email and we will send a secure reset link
        {fromAdmin ? " so you can regain admin access" : ""}.
      </p>

      <aside className={`mt-5 rounded-xl border px-4 py-3 text-sm leading-6 text-slate-700 ${fromAdmin ? "border-cyan-200 bg-cyan-50/70" : "border-primary/15 bg-primary/5"}`}>
        <p className={`font-semibold ${accentLabel}`}>You are in safe hands</p>
        <p className="mt-1">
          Password resets are quick and private. We never share your email, and the link expires soon for your protection.
        </p>
      </aside>

      <form className="mt-7 space-y-4" onSubmit={onSubmit}>
        <label className="block text-sm font-semibold text-slate-700">
          Email
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={`mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50/80 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition ${focusRing}`}
          />
        </label>

        {error ? (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            {error}
          </p>
        ) : null}
        {message ? (
          <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
            {message}
          </p>
        ) : null}

        <Button type="submit" className="mt-1 w-full" disabled={loading} aria-busy={loading}>
          {loading ? "Sending..." : "Send reset link"}
        </Button>
      </form>

      <p className="mt-4 text-sm text-slate-600">
        Remembered it?{" "}
        <Link href={loginHref} className={accentLink}>
          Back to {fromAdmin ? "admin login" : "login"}
        </Link>
      </p>
      <p className="mt-3 text-sm text-slate-600">
        Back to{" "}
        <Link href="/" className={accentLink}>
          home
        </Link>
      </p>
    </section>
  );
}

function ForgotPasswordFallback({ fromAdmin }: { fromAdmin: boolean }) {
  return (
    <section className="forgot-password-panel relative w-full max-w-md rounded-3xl border border-white/70 bg-white/95 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.16)] sm:p-8">
      <div className="mb-5 flex justify-center sm:justify-start">
        <Logo variant="wordmark" size={30} animation={false} className="pointer-events-none" textClassName="text-slate-900" />
      </div>
      <p className={`text-xs font-bold uppercase tracking-[0.2em] ${fromAdmin ? "text-cyan-700" : "text-primary"}`}>
        {fromAdmin ? "Admin portal" : "Parent portal"}
      </p>
      <h1 className="mt-2 font-heading text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
        Reset Password
      </h1>
      <p className="mt-2 text-sm text-slate-600">Loading reset form...</p>
      <div className="mt-7 space-y-3">
        <div className="h-11 animate-pulse rounded-xl bg-slate-200/80" />
        <div className="h-11 animate-pulse rounded-xl bg-slate-200/80" />
      </div>
    </section>
  );
}

function ParentResetBrandPanel() {
  return (
    <aside className="forgot-password-brand relative hidden min-h-[28rem] overflow-hidden rounded-3xl border border-white/10 bg-[#12081f] p-8 text-white lg:flex lg:flex-col lg:justify-between">
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
        <p className="mt-8 text-xs font-bold uppercase tracking-[0.24em] text-violet-200/90">Account recovery</p>
        <h2 className="mt-3 max-w-sm font-heading text-4xl font-black leading-tight tracking-tight text-white">
          Get back to your family learning space.
        </h2>
        <p className="mt-4 max-w-sm text-sm leading-6 text-slate-300">
          A secure reset link helps you return to child profiles, progress, and Short Learning booking with confidence.
        </p>
      </div>

      <ul className="relative mt-10 space-y-3 text-sm text-slate-200">
        <li className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-sm bg-violet-300" aria-hidden />
          <span>Private reset links that expire soon</span>
        </li>
        <li className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-sm bg-fuchsia-300" aria-hidden />
          <span>Your email stays protected and is never shared</span>
        </li>
        <li className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-sm bg-sky-300" aria-hidden />
          <span>Quick return to the Parent Portal</span>
        </li>
      </ul>
    </aside>
  );
}

function AdminResetBrandPanel() {
  return (
    <aside className="forgot-password-brand relative hidden min-h-[28rem] overflow-hidden rounded-3xl border border-white/10 bg-[#07111f] p-8 text-white lg:flex lg:flex-col lg:justify-between">
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
        <p className="mt-8 text-xs font-bold uppercase tracking-[0.24em] text-cyan-200/90">Admin recovery</p>
        <h2 className="mt-3 max-w-sm font-heading text-4xl font-black leading-tight tracking-tight text-white">
          Restore secure access to the operations console.
        </h2>
        <p className="mt-4 max-w-sm text-sm leading-6 text-slate-300">
          Reset your admin password safely and return to schools, content, and safeguarding-aware system controls.
        </p>
      </div>

      <ul className="relative mt-10 space-y-3 text-sm text-slate-200">
        <li className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-sm bg-cyan-300" aria-hidden />
          <span>Secure email-based password reset</span>
        </li>
        <li className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-sm bg-sky-300" aria-hidden />
          <span>Links expire quickly for protection</span>
        </li>
        <li className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-sm bg-teal-300" aria-hidden />
          <span>Return to the Admin portal when ready</span>
        </li>
      </ul>
    </aside>
  );
}

function ForgotPasswordShell() {
  const searchParams = useSearchParams();
  const fromAdmin = searchParams.get("from") === "admin";

  return (
    <main
      data-admin-theme={fromAdmin ? "" : undefined}
      className={`forgot-password-shell relative isolate flex min-h-screen items-center justify-center overflow-hidden px-4 py-8 pb-24 sm:py-12 sm:pb-24 ${fromAdmin ? "" : "bg-[#0f0a18]"}`}
      style={fromAdmin ? { background: "var(--admin-bg)" } : undefined}
    >
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        {fromAdmin ? (
          <>
            <div className="absolute inset-0" style={{ background: "linear-gradient(160deg, #0a1528 0%, var(--admin-bg) 42%, #0c1220 100%)" }} />
            <div className="absolute -left-24 top-0 h-80 w-80 rounded-full bg-[var(--admin-primary)]/20 blur-3xl" />
            <div className="absolute -right-16 bottom-0 h-96 w-96 rounded-full bg-sky-500/10 blur-3xl" />
          </>
        ) : (
          <>
            <div className="absolute inset-0 bg-[linear-gradient(160deg,#1a0f2e_0%,#0f0a18_45%,#140c22_100%)]" />
            <div className="absolute -left-24 top-0 h-80 w-80 rounded-full bg-primary/25 blur-3xl" />
            <div className="absolute -right-16 bottom-0 h-96 w-96 rounded-full bg-fuchsia-500/10 blur-3xl" />
          </>
        )}
      </div>

      <div className="forgot-password-stage mx-auto grid w-full max-w-6xl items-stretch gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        {fromAdmin ? <AdminResetBrandPanel /> : <ParentResetBrandPanel />}
        <div className="flex items-center justify-center lg:justify-end">
          <ForgotPasswordForm />
        </div>
      </div>

      <PublicMiniFooter className="absolute inset-x-0 bottom-0" />

      <style jsx global>{`
        .forgot-password-brand {
          animation: forgot-password-rise 700ms ease-out both;
        }
        .forgot-password-panel {
          animation: forgot-password-rise 700ms ease-out 120ms both;
        }
        @keyframes forgot-password-rise {
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

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[#0f0a18] px-4 py-8 sm:py-12">
          <div className="mx-auto grid w-full max-w-6xl items-stretch gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="hidden min-h-[28rem] rounded-3xl border border-white/10 bg-[#12081f] lg:block" />
            <div className="flex items-center justify-center lg:justify-end">
              <ForgotPasswordFallback fromAdmin={false} />
            </div>
          </div>
        </main>
      }
    >
      <ForgotPasswordShell />
    </Suspense>
  );
}
