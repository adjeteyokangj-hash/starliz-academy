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
      const isAuthPage = pathname.startsWith("/auth/");
      const isAdminPage = pathname.startsWith("/admin");
      const isPublicPage = pathname === "/" || pathname.startsWith("/about") || pathname.startsWith("/pricing")
        || pathname.startsWith("/contact") || pathname.startsWith("/features") || pathname.startsWith("/roadmap")
        || pathname.startsWith("/login") || pathname.startsWith("/signup") || pathname.startsWith("/forgot-password")
        || pathname.startsWith("/terms") || pathname.startsWith("/privacy");

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

      if (!isConsentPage && !isPrivacyPage && !isAuthPage && !isAdminPage && !isPublicPage && !getProfile()) {
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
    return <main className="min-h-screen bg-background" />;
  }

  return <>{children}</>;
}
