"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type ParentProfilePayload = {
  parent: {
    id: string;
    name: string;
    email: string;
    label: string;
  };
  children: Array<{
    id: string;
    name: string;
    yearGroup: string | null;
    avatar: string | null;
    pinEnabled: boolean;
  }>;
};

function safeParentNext(next: string | null): string {
  if (next && /^\/parent(\/.*)?$/.test(next)) {
    return next;
  }
  return "/parent/dashboard";
}

function ModalShell({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
      <div className="w-full max-w-md rounded-3xl border border-cyan-200/20 bg-slate-900 p-6 shadow-2xl">
        <h2 className="text-2xl font-black text-white">{title}</h2>
        <p className="mt-2 text-sm text-slate-300">{description}</p>
        <div className="mt-5">{children}</div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/5"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function ProfileSelectionClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [payload, setPayload] = useState<ParentProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showParentPinModal, setShowParentPinModal] = useState(false);
  const [parentPin, setParentPin] = useState("");
  const [parentPinError, setParentPinError] = useState<string | null>(null);

  const [childPinModal, setChildPinModal] = useState<{ childId: string; childName: string } | null>(null);
  const [childPin, setChildPin] = useState("");
  const [childPinError, setChildPinError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/parent/profiles", { credentials: "include" });
        if (!response.ok) {
          setError("Could not load profiles.");
          setLoading(false);
          return;
        }
        const nextPayload = (await response.json()) as ParentProfilePayload;
        setPayload(nextPayload);
        setLoading(false);
      } catch {
        setError("Could not load profiles.");
        setLoading(false);
      }
    })();
  }, []);

  const intent = searchParams.get("intent");
  const bannerMessage = useMemo(() => {
    if (intent === "parent") {
      return "Enter the Parent PIN to access the parent dashboard.";
    }
    if (intent === "child") {
      return "Select a child profile before opening student routes.";
    }
    return null;
  }, [intent]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => undefined);
    router.replace("/auth/login");
  }

  async function handleParentUnlock() {
    if (!/^\d{4}$/.test(parentPin)) {
      setParentPinError("Enter a 4-digit PIN.");
      return;
    }

    setSubmitting(true);
    setParentPinError(null);

    try {
      const response = await fetch("/api/pin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pin: parentPin }),
      });

      if (!response.ok) {
        setParentPinError("Incorrect PIN.");
        setSubmitting(false);
        return;
      }

      router.replace(safeParentNext(searchParams.get("next")));
    } catch {
      setParentPinError("Could not verify PIN.");
      setSubmitting(false);
    }
  }

  async function continueAsChild(childId: string, pin?: string) {
    setSubmitting(true);
    setChildPinError(null);

    try {
      const response = await fetch("/api/parent/profiles/verify-child-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ childId, pin }),
      });

      if (!response.ok) {
        const failure = (await response.json().catch(() => null)) as { error?: string } | null;
        setChildPinError(failure?.error ?? "Could not open child profile.");
        setSubmitting(false);
        return;
      }

      router.replace("/student/dashboard");
    } catch {
      setChildPinError("Could not open child profile.");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#172554,_#020617)] px-4">
        <p className="text-sm font-semibold text-slate-200">Loading profiles...</p>
      </main>
    );
  }

  if (!payload || error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#172554,_#020617)] px-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-300/40 bg-rose-950/30 p-5 text-sm text-rose-100">
          {error ?? "Could not load profile selection."}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#172554,_#020617)] px-4 py-10 text-white">
      <section className="mx-auto max-w-5xl rounded-3xl border border-cyan-300/20 bg-slate-950/55 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.7)] backdrop-blur">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">StarLiz Academy</p>
            <h1 className="mt-2 text-3xl font-black">Who is using StarLiz Academy?</h1>
            <p className="mt-2 text-sm text-slate-300">Choose a profile to continue.</p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10"
          >
            Safe logout
          </button>
        </header>

        {bannerMessage ? (
          <p className="mt-5 rounded-xl border border-amber-300/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            {bannerMessage}
          </p>
        ) : null}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <button
            type="button"
            onClick={() => {
              setParentPin("");
              setParentPinError(null);
              setShowParentPinModal(true);
            }}
            className="rounded-2xl border border-fuchsia-300/40 bg-gradient-to-br from-fuchsia-600/25 to-indigo-600/30 p-5 text-left transition hover:-translate-y-0.5 hover:border-fuchsia-300/70"
            data-testid="profile-card-parent"
          >
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-fuchsia-200">Parent</p>
            <p className="mt-2 text-2xl font-black">{payload.parent.name}</p>
            <p className="mt-2 text-sm text-slate-200">Parent dashboard is PIN protected.</p>
          </button>

          {payload.children.map((child) => (
            <button
              key={child.id}
              type="button"
              onClick={() => {
                setChildPin("");
                setChildPinError(null);
                if (child.pinEnabled) {
                  setChildPinModal({ childId: child.id, childName: child.name });
                  return;
                }
                void continueAsChild(child.id);
              }}
              className="rounded-2xl border border-cyan-300/30 bg-slate-900/70 p-5 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/70"
              data-testid={`profile-card-child-${child.id}`}
            >
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-200">Child</p>
              <p className="mt-2 text-2xl font-black">{child.name}</p>
              <p className="mt-1 text-sm text-slate-300">{child.yearGroup ?? "Year group not set"}</p>
              <p className="mt-3 text-xs font-semibold text-slate-400">
                {child.pinEnabled ? "PIN required" : "No PIN required"}
              </p>
            </button>
          ))}
        </div>
      </section>

      {showParentPinModal ? (
        <ModalShell
          title="Parent PIN"
          description="Enter your 4-digit parent PIN to open the parent dashboard."
          onClose={() => {
            if (submitting) return;
            setShowParentPinModal(false);
          }}
        >
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={parentPin}
            onChange={(event) => setParentPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
            className="w-full rounded-xl border border-white/20 bg-slate-950 px-4 py-3 text-center text-2xl tracking-[0.45em] text-white"
            placeholder="0000"
            data-testid="parent-pin-input"
          />
          {parentPinError ? <p className="mt-3 text-sm font-semibold text-rose-300">{parentPinError}</p> : null}
          <button
            type="button"
            onClick={() => void handleParentUnlock()}
            disabled={submitting}
            className="mt-4 w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 hover:bg-cyan-300 disabled:opacity-60"
            data-testid="parent-pin-submit"
          >
            {submitting ? "Checking..." : "Open parent dashboard"}
          </button>
        </ModalShell>
      ) : null}

      {childPinModal ? (
        <ModalShell
          title={`Child PIN - ${childPinModal.childName}`}
          description="Enter the child PIN before opening the student dashboard."
          onClose={() => {
            if (submitting) return;
            setChildPinModal(null);
          }}
        >
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={childPin}
            onChange={(event) => setChildPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
            className="w-full rounded-xl border border-white/20 bg-slate-950 px-4 py-3 text-center text-2xl tracking-[0.45em] text-white"
            placeholder="0000"
            data-testid="child-pin-input"
          />
          {childPinError ? <p className="mt-3 text-sm font-semibold text-rose-300">{childPinError}</p> : null}
          <button
            type="button"
            onClick={() => void continueAsChild(childPinModal.childId, childPin)}
            disabled={submitting}
            className="mt-4 w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 hover:bg-cyan-300 disabled:opacity-60"
            data-testid="child-pin-submit"
          >
            {submitting ? "Checking..." : "Open student dashboard"}
          </button>
        </ModalShell>
      ) : null}
    </main>
  );
}
