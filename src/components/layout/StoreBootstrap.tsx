"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Logo from "@/components/Logo";
import { getProfile, hydrateProfilesFromServer } from "@/lib/store";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";

type Props = {
  children: React.ReactNode;
};

function shouldSkipStoreBootstrap(pathname: string): boolean {
  return (
    pathname.startsWith("/consent")
    || pathname.startsWith("/privacy")
    || pathname.startsWith("/auth/")
    || pathname.startsWith("/admin")
    || pathname.startsWith("/teacher")
    || pathname.startsWith("/school")
    || pathname.startsWith("/parent")
    || pathname === "/"
    || pathname.startsWith("/about")
    || pathname.startsWith("/pricing")
    || pathname.startsWith("/contact")
    || pathname.startsWith("/features")
    || pathname.startsWith("/roadmap")
    || pathname.startsWith("/login")
    || pathname.startsWith("/signup")
    || pathname.startsWith("/forgot-password")
    || pathname.startsWith("/reset-password")
    || pathname.startsWith("/terms")
    || pathname.startsWith("/policies")
    || pathname.startsWith("/uk")
    || pathname.startsWith("/ghana")
    || pathname.startsWith("/nigeria")
  );
}

export default function StoreBootstrap({ children }: Props) {
  const pathname = usePathname() ?? "";
  const skipBootstrap = shouldSkipStoreBootstrap(pathname);
  // Public/auth/admin routes must SSR their UI immediately — otherwise /admin/login
  // only shows body gradients until a client effect flips ready.
  const [ready, setReady] = useState(skipBootstrap);
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    let mounted = true;

    if (skipBootstrap) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mark ready immediately when bootstrap is skipped; frozen behaviour, advisory only
      setReady(true);
      return () => {
        mounted = false;
      };
    }

    const timeoutId = window.setTimeout(() => {
      if (mounted) {
        setShowFallback(true);
      }
    }, 5000);

    const bootstrap = async () => {
      // Teachers/staff are not parents/learners — never require a child profile.
      try {
        const meRes = await fetchWithRefreshRetry("/api/auth/me", { credentials: "include" });
        if (meRes.ok) {
          const me = await meRes.json() as { user?: { role?: string } };
          const role = me.user?.role;
          if (role === "teacher" || role === "admin") {
            if (
              pathname.startsWith("/profiles")
              || pathname === "/dashboard"
              || pathname.startsWith("/student")
            ) {
              window.location.replace(role === "admin" ? "/admin" : "/teacher");
              return;
            }
            if (mounted) {
              window.clearTimeout(timeoutId);
              setReady(true);
            }
            return;
          }
        }
      } catch {
        // Fall through to parent/learner bootstrap if session probe fails.
      }

      const isProfilesPage = pathname.startsWith("/profiles") || pathname.startsWith("/parent/profiles");
      const needsActiveProfile = !isProfilesPage;

      let hydrateResult: "ok" | "empty" | "failed" = "ok";
      if (needsActiveProfile) {
        hydrateResult = await hydrateProfilesFromServer();
      }

      try {
        const response = await fetchWithRefreshRetry("/api/consent", { credentials: "include" });
        if (response.ok) {
          const payload = await response.json() as { accepted: boolean };
          if (!payload.accepted) {
            window.location.replace("/consent");
            return;
          }
        }
      } catch {
        // Keep UX resilient if consent API is temporarily unavailable.
      }

      // Only force profile selection when we know there is no active child.
      // Transient hydrate failures must not look like a logout.
      if (needsActiveProfile && hydrateResult !== "failed" && !getProfile()) {
        window.location.replace("/profiles");
        return;
      }

      if (mounted) {
        window.clearTimeout(timeoutId);
        setReady(true);
      }
    };

    void bootstrap();
    return () => {
      mounted = false;
      window.clearTimeout(timeoutId);
    };
  }, [pathname, skipBootstrap]);

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/80 p-6 text-center shadow-2xl shadow-slate-950/40">
          <div className="flex justify-center">
            <Logo variant="icon" size={56} animation={false} className="pointer-events-none" />
          </div>
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.3em] text-cyan-300">StarLiz Academy</p>
          <h1 className="mt-3 text-2xl font-black text-white">Loading StarLiz Academy...</h1>
          <p className="mt-2 text-sm text-slate-300">Checking your session, child profile, and consent settings.</p>
          <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-1/3 animate-[pulse_1.2s_ease-in-out_infinite] rounded-full bg-cyan-400"></div>
          </div>
          {showFallback ? (
            <button
              type="button"
              onClick={() => window.location.replace("/parent/dashboard")}
              className="mt-5 inline-flex rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500"
            >
              Continue to parent dashboard
            </button>
          ) : null}
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
