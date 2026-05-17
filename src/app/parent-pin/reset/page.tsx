"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Button from "@/components/ui/Button";

const WEAK_PINS = new Set(["0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999", "1234", "4321", "1122", "1212", "0123"]);

export default function ResetParentPinPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextParam = searchParams.get("next");
  const backHref = `/parent-pin/forgot${nextParam ? `?next=${encodeURIComponent(nextParam)}` : ""}`;
  const pinPageHref = `/parent-pin${nextParam ? `?next=${encodeURIComponent(nextParam)}&reset=1` : "?reset=1"}`;

  function validateLocally(): string | null {
    if (!/^\d{6}$/.test(code)) return "Reset code must be exactly 6 digits.";
    if (!/^\d{4}$/.test(newPin)) return "New PIN must be exactly 4 digits.";
    if (newPin !== confirmPin) return "PINs do not match.";
    if (WEAK_PINS.has(newPin)) return "This PIN is too simple. Please choose a more secure PIN (avoid 1234, 0000, repeated digits, etc.).";
    return null;
  }

  async function submitReset() {
    const localError = validateLocally();
    if (localError) { setError(localError); return; }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/parent-pin/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code, newPin, confirmPin }),
      });

      if (response.status === 401) {
        router.replace("/auth/login");
        return;
      }

      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;

      if (!response.ok) {
        setError(payload?.error ?? "Reset failed. Please try again.");
        return;
      }

      // Success — redirect to parent-pin with reset=1 banner
      router.replace(pinPageHref);
    } catch {
      setError("Reset failed. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <section className="w-full max-w-md rounded-3xl bg-white/90 p-6 shadow-xl ring-1 ring-slate-200">
        <h1 className="text-2xl font-black text-slate-900">Reset Parent PIN</h1>
        <p className="mt-2 text-sm text-slate-600">
          Enter the 6-digit code sent to your parent email, then choose a new 4-digit PIN.
        </p>

        {error && (
          <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 ring-1 ring-rose-200">
            {error}
          </p>
        )}

        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700" htmlFor="reset-code">
              Reset code
            </label>
            <input
              id="reset-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-center text-xl tracking-[0.4em]"
              placeholder="000000"
              autoComplete="one-time-code"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700" htmlFor="new-pin">
              New 4-digit PIN
            </label>
            <input
              id="new-pin"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-center text-xl tracking-[0.3em]"
              placeholder="••••"
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700" htmlFor="confirm-pin">
              Confirm new PIN
            </label>
            <input
              id="confirm-pin"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-center text-xl tracking-[0.3em]"
              placeholder="••••"
              autoComplete="new-password"
            />
          </div>

          <Button className="w-full" onClick={() => void submitReset()} disabled={loading}>
            {loading ? "Saving..." : "Set new PIN"}
          </Button>

          <Link href={backHref}>
            <Button className="w-full" variant="secondary">Back to forgot PIN</Button>
          </Link>
        </div>

        <p className="mt-4 text-xs text-slate-400">
          The reset code expires after 30 minutes and can only be used once. Do not share it with anyone.
        </p>
      </section>
    </main>
  );
}
