"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import Button from "@/components/ui/Button";

export default function ConsentPage() {
  const router = useRouter();
  const [isParent, setIsParent] = useState(false);
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canAccept = useMemo(() => isParent && acceptedPolicy, [isParent, acceptedPolicy]);

  async function acceptAndContinue() {
    if (!canAccept) return;
    setError(null);
    try {
      const response = await fetch("/api/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted: true, version: "1.0" }),
        credentials: "include",
      });
      if (!response.ok) {
        setError("Could not record consent.");
        return;
      }
      router.replace("/profiles");
    } catch {
      setError("Could not record consent.");
    }
  }

  async function decline() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    router.replace("/auth/login");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-10">
      <section className="w-full rounded-3xl bg-white/90 p-8 shadow-xl ring-1 ring-slate-200">
        <h1 className="text-3xl font-black text-slate-900">Parent Consent Required 🔒</h1>
        <p className="mt-3 text-slate-700">Before we begin, this app is designed for children and requires a parent or guardian to review and approve data use.</p>

        <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
          <p className="font-semibold">What we collect</p>
          <p>Child nickname, learning progress (stars, XP, coins), activity results.</p>
          <p className="mt-3 font-semibold">What we do not collect</p>
          <p>Location, photos, messages, or personal contact details from the child.</p>
          <p className="mt-2">Parent contact details are collected only for account access, consent, billing, and progress updates.</p>
        </div>

        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>Your child&apos;s data is private.</li>
          <li>You control all accounts.</li>
          <li>You can delete data anytime.</li>
          <li>No social or chat features.</li>
        </ul>

        <div className="mt-5 space-y-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={isParent} onChange={(e) => setIsParent(e.target.checked)} />
            I am the parent or legal guardian
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={acceptedPolicy} onChange={(e) => setAcceptedPolicy(e.target.checked)} />
            I have read and agree to the Privacy Policy
          </label>
        </div>

        {error ? <p className="mt-3 text-sm font-semibold text-rose-700">{error}</p> : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-2xl bg-(image:--btn-secondary) px-4 py-2.5 font-bold text-white shadow-[0_14px_32px_rgba(0,206,201,0.22)] transition hover:brightness-105 sm:px-5 sm:py-3"
          >
            View Full Privacy Policy
          </a>
          <Button disabled={!canAccept} onClick={acceptAndContinue}>Accept & Continue</Button>
          <Button variant="accent" onClick={decline}>Decline</Button>
        </div>
      </section>
    </main>
  );
}
