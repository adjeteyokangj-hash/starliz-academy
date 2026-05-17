"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Button from "@/components/ui/Button";

export default function ForgotParentPinPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const nextParam = searchParams.get("next");
  const backHref = `/parent-pin${nextParam ? `?next=${encodeURIComponent(nextParam)}` : ""}`;

  async function sendCode() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/parent-pin/forgot", {
        method: "POST",
        credentials: "include",
      });

      if (response.status === 401) {
        router.replace("/auth/login");
        return;
      }

      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        sentTo?: string;
        error?: string;
        code?: string;
        retryAfterSeconds?: number;
      } | null;

      if (!response.ok) {
        if (payload?.retryAfterSeconds) {
          const seconds = payload.retryAfterSeconds;
          setCooldown(seconds);
          const interval = setInterval(() => {
            setCooldown((prev) => {
              if (prev <= 1) { clearInterval(interval); return 0; }
              return prev - 1;
            });
          }, 1000);
        }
        setError(payload?.error ?? "Failed to send reset code. Please try again.");
        return;
      }

      setSentTo(payload?.sentTo ?? null);
      setSent(true);
      // Navigate to reset page
      const resetHref = `/parent-pin/reset${nextParam ? `?next=${encodeURIComponent(nextParam)}` : ""}`;
      router.push(resetHref);
    } catch {
      setError("Failed to send reset code. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <section className="w-full max-w-md rounded-3xl bg-white/90 p-6 shadow-xl ring-1 ring-slate-200">
        <h1 className="text-2xl font-black text-slate-900">Forgot Parent PIN</h1>

        <p className="mt-3 text-sm text-slate-600">
          For security, we cannot show your current PIN. We&apos;ll send a reset code to the registered parent email.
        </p>

        {sent && sentTo && (
          <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">
            A reset code has been sent to {sentTo}. Check your inbox and follow the link to reset your PIN.
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 ring-1 ring-rose-200">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3">
          <Button
            className="w-full"
            onClick={() => void sendCode()}
            disabled={loading || sent || cooldown > 0}
          >
            {loading
              ? "Sending..."
              : cooldown > 0
                ? `Resend code (${cooldown}s)`
                : "Send reset code"}
          </Button>
          <Link href={backHref}>
            <Button className="w-full" variant="secondary">Back to PIN</Button>
          </Link>
        </div>

        <p className="mt-4 text-xs text-slate-400">
          The reset code will be sent to the registered parent email only. The code expires in 30 minutes. Do not share it with your child.
        </p>
      </section>
    </main>
  );
}
