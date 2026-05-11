"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0", "submit"];

export default function ParentPinPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [setPinDraft, setSetPinDraft] = useState("");
  const [setPinConfirm, setSetPinConfirm] = useState("");
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadStatus = async () => {
      const response = await fetch("/api/pin/status", { credentials: "include" });
      if (response.status === 401) {
        router.replace("/auth/login");
        return;
      }
      if (!response.ok) {
        setHasPin(true);
        return;
      }
      const payload = await response.json() as { hasPin: boolean; unlocked: boolean };
      if (payload.unlocked) {
        router.replace("/parent");
        return;
      }
      setHasPin(payload.hasPin);
    };
    void loadStatus();
  }, [router]);

  function pushDigit(digit: string) {
    if (pin.length >= 4) return;
    setPin((prev) => `${prev}${digit}`);
  }

  function clearDigit() {
    setPin((prev) => prev.slice(0, -1));
  }

  async function verifyPin() {
    if (pin.length !== 4) return;
    if (isLocked) {
      setError("Too many attempts. Please wait a moment.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/pin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pin }),
      });

      if (response.status === 401) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        if (payload?.error === "Unauthorized") {
          router.replace("/auth/login");
          return;
        }
      }

      if (response.ok) {
        router.replace("/parent");
        return;
      }

      const attempts = failedAttempts + 1;
      setFailedAttempts(attempts);
      if (attempts >= 3) {
        setIsLocked(true);
        setTimeout(() => {
          setIsLocked(false);
          setFailedAttempts(0);
        }, 15000);
        setError("Too many attempts. Try again in 15 seconds.");
      } else {
        setError("Incorrect PIN. Try again.");
      }
      setPin("");
    } catch {
      setError("Could not verify PIN.");
    } finally {
      setLoading(false);
    }
  }

  async function savePin() {
    if (!/^\d{4}$/.test(setPinDraft)) {
      setError("PIN must be exactly 4 digits.");
      return;
    }
    if (setPinDraft !== setPinConfirm) {
      setError("PIN values do not match.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/pin/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pin: setPinDraft }),
      });
      if (!response.ok) {
        setError("Could not set PIN.");
        return;
      }
      setHasPin(true);
      setSetPinDraft("");
      setSetPinConfirm("");
      setError(null);
    } catch {
      setError("Could not set PIN.");
    } finally {
      setLoading(false);
    }
  }

  if (hasPin === null) {
    return <main className="min-h-screen bg-background" />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <section className="w-full max-w-md rounded-3xl bg-white/90 p-6 shadow-xl ring-1 ring-slate-200">
        <h1 className="text-3xl font-black text-slate-900">Parent Access 🔒</h1>
        <p className="mt-2 text-slate-600">Enter your 4-digit PIN</p>

        {!hasPin ? (
          <div className="mt-5 space-y-3">
            <p className="text-sm font-semibold text-slate-700">Create your parent PIN</p>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={setPinDraft}
              onChange={(e) => setSetPinDraft(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-center text-xl tracking-[0.3em]"
              placeholder="0000"
            />
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={setPinConfirm}
              onChange={(e) => setSetPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-center text-xl tracking-[0.3em]"
              placeholder="Confirm PIN"
            />
            <Button className="w-full" onClick={() => void savePin()} disabled={loading}>Set PIN</Button>
            <Button className="w-full" variant="secondary" onClick={() => router.replace("/profiles")}>Cancel</Button>
          </div>
        ) : (
          <>
            <div className="mt-5 flex justify-center gap-2">
              {[0, 1, 2, 3].map((idx) => (
                <span
                  key={idx}
                  className={`inline-flex h-4 w-4 rounded-full ${pin.length > idx ? "bg-slate-900" : "bg-slate-300"}`}
                />
              ))}
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              {KEYS.map((key) => {
                const label = key === "back" ? "⌫" : key === "submit" ? "✓" : key;
                return (
                  <button
                    key={key}
                    type="button"
                    className="rounded-xl border border-slate-300 bg-white px-3 py-4 text-xl font-black text-slate-800"
                    onClick={() => {
                      if (key === "back") {
                        clearDigit();
                        return;
                      }
                      if (key === "submit") {
                        void verifyPin();
                        return;
                      }
                      pushDigit(key);
                    }}
                    disabled={loading}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => router.replace("/profiles")}>Cancel</Button>
              <Button onClick={() => void verifyPin()} disabled={loading || pin.length !== 4}>Unlock</Button>
            </div>
          </>
        )}

        <p className="mt-3 text-sm text-slate-500">Forgot PIN? Ask a parent to reset from account settings.</p>
        {error ? <p className="mt-2 text-sm font-semibold text-rose-700">{error}</p> : null}
      </section>
    </main>
  );
}
