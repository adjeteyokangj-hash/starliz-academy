"use client";

import { useEffect, useState } from "react";
import { getProfile, hydrateProfilesFromServer } from "@/lib/store";

type Props = {
  children: React.ReactNode;
};

export default function StoreBootstrap({ children }: Props) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const bootstrap = async () => {
      await hydrateProfilesFromServer();

      const pathname = window.location.pathname;
      const isConsentPage = pathname.startsWith("/consent");
      const isPrivacyPage = pathname.startsWith("/privacy");
      const isProfilesPage = pathname.startsWith("/profiles");
      const isAuthPage = pathname.startsWith("/auth/");
      const isAdminPage = pathname.startsWith("/admin");
      const isPublicPage = pathname === "/" || pathname.startsWith("/about") || pathname.startsWith("/pricing")
        || pathname.startsWith("/contact") || pathname.startsWith("/features") || pathname.startsWith("/roadmap")
        || pathname.startsWith("/login") || pathname.startsWith("/signup") || pathname.startsWith("/forgot-password")
        || pathname.startsWith("/reset-password") || pathname.startsWith("/terms") || pathname.startsWith("/privacy");

      if (!isConsentPage && !isPrivacyPage && !isAuthPage && !isAdminPage && !isPublicPage) {
        try {
          const response = await fetch("/api/consent", { credentials: "include" });
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
      }

      if (!isConsentPage && !isPrivacyPage && !isAuthPage && !isAdminPage && !isPublicPage && !isProfilesPage && !getProfile()) {
        window.location.replace("/profiles");
        return;
      }

      if (mounted) {
        setReady(true);
      }
    };

    void bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/80 p-6 text-center shadow-2xl shadow-slate-950/40">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-300">StarLiz Academy</p>
          <h1 className="mt-3 text-2xl font-black text-white">Preparing your learning space</h1>
          <p className="mt-2 text-sm text-slate-300">Checking your session, child profile, and consent settings.</p>
          <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-1/3 animate-[pulse_1.2s_ease-in-out_infinite] rounded-full bg-cyan-400"></div>
          </div>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
