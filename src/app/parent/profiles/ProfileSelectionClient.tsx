"use client";

import Image from "next/image";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";
import { resolveParentPinGateState } from "@/lib/parent-pin-gate";

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

const PIN_VERIFY_TIMEOUT_MS = 15000;

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

const featurePills = [
  {
    title: "Secure & PIN Protected",
    body: "Sensitive areas are protected",
    accent: "from-violet-500/30 to-fuchsia-500/10",
    icon: "shield",
  },
  {
    title: "Personalised Experience",
    body: "Tailored to each learner",
    accent: "from-indigo-500/30 to-sky-500/10",
    icon: "person",
  },
  {
    title: "Track Progress",
    body: "Monitor growth & achievements",
    accent: "from-cyan-500/30 to-emerald-500/10",
    icon: "chart",
  },
] as const;

const starPositions = [
  "left-[8%] top-[10%]",
  "left-[18%] top-[24%]",
  "left-[34%] top-[8%]",
  "left-[46%] top-[18%]",
  "left-[62%] top-[10%]",
  "left-[74%] top-[22%]",
  "left-[88%] top-[14%]",
  "left-[12%] top-[58%]",
  "left-[28%] top-[66%]",
  "left-[52%] top-[72%]",
  "left-[70%] top-[62%]",
  "left-[90%] top-[54%]",
] as const;

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

function FeatureIcon({ icon }: { icon: (typeof featurePills)[number]["icon"] }) {
  if (icon === "shield") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 text-white">
        <path d="M12 3l7 3v5c0 4.4-2.8 8.3-7 9.7C7.8 19.3 5 15.4 5 11V6l7-3z" fill="currentColor" opacity="0.2" />
        <path d="M12 3l7 3v5c0 4.4-2.8 8.3-7 9.7C7.8 19.3 5 15.4 5 11V6l7-3zm0 2.2L7 7.3V11c0 3.3 2 6.2 5 7.4 3-1.2 5-4.1 5-7.4V7.3l-5-2.1zm2.7 4.6l1.4 1.4-4.7 4.7-2.1-2.1 1.4-1.4 0.7 0.7 3.3-3.3z" fill="currentColor" />
      </svg>
    );
  }

  if (icon === "person") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 text-white">
        <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5z" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 text-white">
      <path d="M5 18h14v2H5v-2zm1-2V9h3v7H6zm5 0V4h3v12h-3zm5 0v-5h3v5h-3z" fill="currentColor" />
    </svg>
  );
}

function ChildAvatarOrb({ index }: { index: number }) {
  const variants = [
    "from-sky-400/50 via-indigo-500/30 to-transparent",
    "from-violet-400/50 via-fuchsia-500/30 to-transparent",
    "from-cyan-400/50 via-emerald-500/30 to-transparent",
    "from-amber-300/40 via-orange-500/20 to-transparent",
  ];
  const variant = variants[index % variants.length];

  return (
    <div className={`relative flex h-20 w-20 items-center justify-center rounded-full border border-white/15 bg-gradient-to-br ${variant} shadow-[0_0_35px_rgba(99,102,241,0.25)]`}>
      <div className="absolute inset-3 rounded-full border border-white/20 bg-slate-950/50" />
      <svg viewBox="0 0 24 24" aria-hidden="true" className="relative z-10 h-9 w-9 text-white/90">
        <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2z" fill="currentColor" />
      </svg>
    </div>
  );
}

export default function ProfileSelectionClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [payload, setPayload] = useState<ParentProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [parentPinStatus, setParentPinStatus] = useState<{ hasPin: boolean; unlocked: boolean } | null>(null);
  const [parentPinSetupRequired, setParentPinSetupRequired] = useState(false);

  const [showParentPinModal, setShowParentPinModal] = useState(false);
  const [parentPin, setParentPin] = useState("");
  const [parentPinError, setParentPinError] = useState<string | null>(null);

  const [childPinModal, setChildPinModal] = useState<{ childId: string; childName: string } | null>(null);
  const [childPin, setChildPin] = useState("");
  const [childPinError, setChildPinError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [pendingProfileId, setPendingProfileId] = useState<string | "parent" | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [response, pinStatusResponse] = await Promise.all([
          fetchWithRefreshRetry("/api/parent/profiles", { credentials: "include", cache: "no-store" }),
          fetchWithRefreshRetry("/api/pin/status", { credentials: "include", cache: "no-store" }),
        ]);
        if (pinStatusResponse.ok) {
          const statusPayload = (await pinStatusResponse.json()) as { hasPin: boolean; unlocked: boolean };
          setParentPinStatus(statusPayload);
          if (!statusPayload.hasPin) {
            setParentPinSetupRequired(true);
          }
        }
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

  useEffect(() => {
    router.prefetch("/parent/dashboard");
    router.prefetch("/student/dashboard");
    router.prefetch("/parent-pin");
  }, [router]);

  function goToParentPinSetup() {
    const next = safeParentNext(searchParams.get("next"));
    router.replace(`/parent-pin?reset=1&next=${encodeURIComponent(next)}`);
  }

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

  const parentGateState = resolveParentPinGateState({
    hasPin: parentPinStatus?.hasPin ?? null,
    setupRequiredHint: parentPinSetupRequired,
  });

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => undefined);
    router.replace("/auth/login");
  }

  async function handleParentUnlock() {
    if (!/^\d{4}$/.test(parentPin)) {
      setParentPinError("Enter a 4-digit PIN.");
      return;
    }

    setSubmitting(true);
    setPendingProfileId("parent");
    setParentPinError(null);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, PIN_VERIFY_TIMEOUT_MS);

    try {
      const response = await fetchWithRefreshRetry("/api/pin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pin: parentPin }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
        if (payload?.code === "pin_setup_required" || response.status === 409) {
          setShowParentPinModal(false);
          setParentPin("");
          setParentPinStatus({ hasPin: false, unlocked: false });
          setParentPinSetupRequired(true);
          setParentPinError("Parent PIN has been reset. Please create a new PIN.");
          return;
        }
        setParentPinError(payload?.error ?? "Incorrect PIN.");
        return;
      }

      router.replace(safeParentNext(searchParams.get("next")));
    } catch (error: unknown) {
      if (isAbortError(error)) {
        setParentPinError("Verification timed out. Please try again.");
        return;
      }
      setParentPinError("Could not verify PIN.");
    } finally {
      window.clearTimeout(timeoutId);
      setSubmitting(false);
      setPendingProfileId(null);
    }
  }

  async function continueAsChild(childId: string, pin?: string) {
    if (submitting) return;
    if (pin && !/^\d{4}$/.test(pin)) {
      setChildPinError("Enter a 4-digit PIN.");
      return;
    }

    setSubmitting(true);
    setPendingProfileId(childId);
    setChildPinError(null);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, PIN_VERIFY_TIMEOUT_MS);

    try {
      const response = await fetchWithRefreshRetry("/api/parent/profiles/verify-child-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ childId, pin }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const failure = (await response.json().catch(() => null)) as { error?: string } | null;
        setChildPinError(failure?.error ?? "Could not open child profile.");
        return;
      }

      router.replace("/student/dashboard");
    } catch (error: unknown) {
      if (isAbortError(error)) {
        setChildPinError("Verification timed out. Please try again.");
        return;
      }
      setChildPinError("Could not open child profile.");
    } finally {
      window.clearTimeout(timeoutId);
      setSubmitting(false);
      setPendingProfileId(null);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#1b2359_0%,_#070b24_42%,_#030512_100%)] px-4 text-white">
        <section className="w-full max-w-6xl rounded-[2rem] border border-white/10 bg-slate-950/45 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.72)] backdrop-blur md:p-8">
          <div className="h-12 w-40 animate-pulse rounded-2xl bg-white/10" />
          <div className="mt-7 h-6 w-48 animate-pulse rounded-xl bg-white/10" />
          <div className="mt-3 h-12 w-3/4 animate-pulse rounded-xl bg-white/10" />
          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {[0, 1, 2].map((idx) => (
              <div key={idx} className="h-24 animate-pulse rounded-2xl border border-white/10 bg-white/5" />
            ))}
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {[0, 1, 2].map((idx) => (
              <div key={idx} className="h-44 animate-pulse rounded-[1.6rem] border border-white/10 bg-white/5" />
            ))}
          </div>
        </section>
      </main>
    );
  }

  if (!payload || error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#1b2359_0%,_#070b24_42%,_#030512_100%)] px-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-300/40 bg-rose-950/30 p-5 text-sm text-rose-100">
          {error ?? "Could not load profile selection."}
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_#161a4b_0%,_#090d2a_38%,_#030513_100%)] px-4 py-6 text-white sm:px-6 sm:py-10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {starPositions.map((position, index) => (
          <span
            key={position}
            className={`absolute ${position} h-1.5 w-1.5 rounded-full bg-white/80 shadow-[0_0_12px_rgba(255,255,255,0.9)] ${index % 3 === 0 ? "animate-pulse" : ""}`}
          />
        ))}
        <div className="absolute right-[-14rem] top-[-4rem] h-[24rem] w-[24rem] rounded-full border border-indigo-300/20 bg-[radial-gradient(circle_at_35%_35%,_rgba(168,85,247,0.18),_rgba(59,130,246,0.12)_45%,_rgba(4,8,26,0.95)_72%)] shadow-[0_0_120px_rgba(99,102,241,0.25)] sm:right-[-10rem] sm:h-[34rem] sm:w-[34rem]" />
        <div className="absolute right-[8%] top-[12%] h-28 w-28 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.95),_rgba(192,132,252,0.5)_30%,_rgba(59,130,246,0.08)_70%,_transparent_100%)] blur-sm sm:h-40 sm:w-40" />
        <div className="absolute bottom-[13%] right-[8%] h-32 w-56 rounded-full border border-violet-300/20" />
        <div className="absolute bottom-[11%] right-[6%] h-24 w-48 rounded-full border border-cyan-300/10" />
      </div>

      <section className="relative mx-auto max-w-6xl rounded-[2rem] border border-white/10 bg-slate-950/45 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.72)] backdrop-blur md:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Image
              src="/brand/starliz-logo.png"
              alt="StarLiz Academy"
              width={170}
              height={72}
              priority
              className="h-auto w-[130px] object-contain sm:w-[170px]"
            />
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            disabled={loggingOut}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-slate-950/60 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 text-white/80">
              <path d="M12 2l7 3v6c0 4.4-2.8 8.3-7 9.7C7.8 19.3 5 15.4 5 11V5l7-3zm0 2.2L7 6.3V11c0 3.3 2 6.2 5 7.4 3-1.2 5-4.1 5-7.4V6.3l-5-2.1z" fill="currentColor" />
            </svg>
            {loggingOut ? "Loading..." : "Safe logout"}
          </button>
        </header>

        <div className="mt-8 max-w-3xl">
          <p className="text-lg font-semibold text-violet-300">Welcome back!</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-white sm:text-5xl">
            Who is using <span className="bg-gradient-to-r from-sky-400 via-indigo-300 to-fuchsia-400 bg-clip-text text-transparent">StarLiz</span> Academy?
          </h1>
          <p className="mt-4 text-lg text-slate-300">Choose a profile to continue your learning journey.</p>
        </div>

        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {featurePills.map((pill) => (
            <div
              key={pill.title}
              className={`rounded-2xl border border-white/10 bg-gradient-to-br ${pill.accent} p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/55">
                  <FeatureIcon icon={pill.icon} />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{pill.title}</p>
                  <p className="mt-1 text-sm text-slate-300">{pill.body}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {bannerMessage ? (
          <p className="mt-6 rounded-2xl border border-amber-300/35 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            {bannerMessage}
          </p>
        ) : null}

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              if (submitting) return;
              if (parentGateState === "setup_required") {
                setParentPinSetupRequired(true);
                return;
              }
              setPendingProfileId("parent");
              setParentPin("");
              setParentPinError(null);
              setShowParentPinModal(true);
            }}
            disabled={submitting}
            className={`group relative overflow-hidden rounded-[1.6rem] border border-fuchsia-300/45 bg-[linear-gradient(135deg,rgba(88,28,135,0.38),rgba(79,70,229,0.22))] p-5 text-left transition duration-200 hover:-translate-y-0.5 hover:border-fuchsia-300/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300 disabled:cursor-not-allowed disabled:opacity-80 sm:p-6 ${pendingProfileId === "parent" ? "scale-[0.995]" : ""}`}
            data-testid="profile-card-parent"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_28%,rgba(255,255,255,0.16),transparent_24%),radial-gradient(circle_at_18%_82%,rgba(255,255,255,0.08),transparent_18%)]" />
            <div className="relative flex h-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4 sm:gap-5">
                <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-fuchsia-300/60 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.16),rgba(99,18,137,0.42)_45%,rgba(29,17,74,0.92)_78%)] shadow-[0_0_38px_rgba(217,70,239,0.28)]">
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-12 w-12 text-amber-300 drop-shadow-[0_0_14px_rgba(253,224,71,0.45)]">
                    <path d="M4 18h16v2H4v-2zm1-9l4 3 3-6 3 6 4-3-1.5 7h-11L5 9z" fill="currentColor" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-300">Parent</p>
                    <span className="rounded-full border border-fuchsia-200/30 bg-fuchsia-300/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-white">Current</span>
                  </div>
                  <p className="mt-3 text-3xl font-black text-white">{payload.parent.name}</p>
                  <p className="mt-2 text-base text-slate-200">Parent dashboard is PIN protected.</p>
                  <p className="mt-3 text-sm font-semibold text-fuchsia-200">
                    {parentGateState === "setup_required"
                      ? "Parent PIN has been reset. Create a new PIN to continue."
                      : pendingProfileId === "parent"
                        ? "Opening..."
                        : "PIN required to access"}
                  </p>
                </div>
              </div>
            </div>
          </button>

          {payload.children.map((child, index) => (
            <button
              key={child.id}
              type="button"
              onClick={() => {
                if (submitting) return;
                setPendingProfileId(child.id);
                setChildPin("");
                setChildPinError(null);
                if (child.pinEnabled) {
                  setChildPinModal({ childId: child.id, childName: child.name });
                  return;
                }
                void continueAsChild(child.id);
              }}
              disabled={submitting}
              className={`group relative overflow-hidden rounded-[1.6rem] border border-white/10 bg-slate-950/55 p-5 text-left transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/65 hover:bg-slate-900/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-80 sm:p-6 ${pendingProfileId === child.id ? "scale-[0.995] border-cyan-300/65" : ""}`}
              data-testid={`profile-card-child-${child.id}`}
            >
              <div className="relative flex h-full items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4 sm:gap-5">
                  <ChildAvatarOrb index={index} />
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">Child</p>
                    <p className="mt-2 truncate text-2xl font-black text-white">{child.name}</p>
                    <p className="mt-1 text-base text-slate-300">{child.yearGroup ?? "Year group not set"}</p>
                    <p className="mt-3 text-sm font-medium text-slate-300">{pendingProfileId === child.id ? "Opening..." : child.pinEnabled ? "PIN required" : "No PIN required"}</p>
                  </div>
                </div>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-indigo-300/45 bg-indigo-400/5 text-cyan-200 transition group-hover:border-cyan-300 group-hover:text-white">
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
                    <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
            </button>
          ))}
        </div>

        {parentGateState === "setup_required" ? (
          <div className="mt-6 rounded-2xl border border-amber-300/35 bg-amber-400/10 px-4 py-4 text-sm text-amber-100">
            <p className="font-semibold">Parent PIN has been reset. Please create a new PIN.</p>
            <button
              type="button"
              onClick={goToParentPinSetup}
              className="mt-3 rounded-xl bg-amber-300 px-4 py-2 text-sm font-black text-slate-900 hover:bg-amber-200"
            >
              Create parent PIN
            </button>
          </div>
        ) : null}

        <div className="mt-6 rounded-[1.8rem] border border-white/10 bg-[linear-gradient(135deg,rgba(76,29,149,0.3),rgba(15,23,42,0.72))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-amber-300/30 bg-violet-500/10 shadow-[0_0_30px_rgba(168,85,247,0.18)]">
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8 text-amber-300">
                  <path d="M12 3l7 3v5c0 4.4-2.8 8.3-7 9.7C7.8 19.3 5 15.4 5 11V6l7-3zm0 2.2L7 7.3V11c0 3.3 2 6.2 5 7.4 3-1.2 5-4.1 5-7.4V7.3l-5-2.1z" fill="currentColor" />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-black text-white">Your child&apos;s safety comes first</h2>
                <p className="mt-2 max-w-2xl text-base leading-7 text-slate-300">Sensitive areas are protected by PIN. You&apos;ll be asked to verify before accessing student experiences.</p>
              </div>
            </div>
            <div className="relative hidden h-24 w-48 shrink-0 overflow-hidden rounded-full border border-violet-300/15 bg-slate-950/20 md:block">
              <div className="absolute inset-x-4 bottom-5 h-px bg-violet-300/20" />
              <div className="absolute right-10 top-4 h-14 w-14 rounded-2xl border border-violet-200/25 bg-[linear-gradient(180deg,rgba(196,181,253,0.9),rgba(126,34,206,0.85))] shadow-[0_0_24px_rgba(168,85,247,0.45)]" />
              <div className="absolute right-4 bottom-4 flex h-10 w-10 items-center justify-center rounded-full border border-amber-200/30 bg-violet-500/25 text-amber-200">✓</div>
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-sm font-medium text-amber-200/95">
          Tip: Use the same profile each time to keep your progress and settings in sync.
        </p>
      </section>

      {showParentPinModal && parentGateState === "pin_required" ? (
        <ModalShell
          title="Parent PIN"
          description="Enter your 4-digit parent PIN to open the parent dashboard."
          onClose={() => {
            if (submitting) return;
            setShowParentPinModal(false);
            setPendingProfileId(null);
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
            setPendingProfileId(null);
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
