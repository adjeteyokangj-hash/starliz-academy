"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import LockedPreview from "@/components/paywall/LockedPreview";
import SoftPaywallBanner from "@/components/paywall/SoftPaywallBanner";
import { getClientAccess, useTrialSession as consumeTrialSession } from "@/lib/access";
import { trackUsageEvent } from "@/lib/admin-tracking";

type Props = {
  children: React.ReactNode;
  feature?: "learning" | "ai-content" | "reports" | "store";
};

export default function PremiumAccessGate({ children, feature = "learning" }: Props) {
  const pathname = usePathname();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [blockedReason, setBlockedReason] = useState<"trial" | "locked" | "limit">("locked");
  const [trialSessionsLeft, setTrialSessionsLeft] = useState(3);
  const [hasPaidSubscription, setHasPaidSubscription] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetch(`/api/subscription/access?feature=${feature}`)
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        const hasSubscription = Boolean(payload?.hasPaidSubscription);
        const serverTrialLeft = Number(payload?.trialSessionsLeft ?? 3);
        const access = getClientAccess(hasSubscription);

        if (mounted) {
          setHasPaidSubscription(hasSubscription);
          setTrialSessionsLeft(serverTrialLeft);
        }

        if (hasSubscription) {
          if (mounted) setAllowed(true);
          return;
        }

        if (response.ok && payload?.allowed && serverTrialLeft > 0) {
          const game = pathname.includes("spelling") ? "spelling" : pathname.includes("math") ? "math" : pathname.includes("reading") ? "reading" : "unknown";
          const sessionMarker = `starliz_trial_db_mark_${pathname}`;
          const lastMark = Number(sessionStorage.getItem(sessionMarker) || "0");
          const now = Date.now();

          if (now - lastMark >= 2000) {
            const trialResponse = await fetch("/api/trial/session", { method: "POST", credentials: "include" });
            if (!trialResponse.ok) {
              if (mounted) {
                setAllowed(false);
                setBlockedReason("trial");
                setTrialSessionsLeft(0);
              }
              void trackUsageEvent({ type: "paywall_shown", area: "game", game, feature, reason: "trial" });
              return;
            }

            const trialPayload = await trialResponse.json().catch(() => null);
            const nextLeft = Number(trialPayload?.trialSessionsLeft ?? Math.max(0, serverTrialLeft - 1));
            consumeTrialSession();
            sessionStorage.setItem(sessionMarker, String(now));
            if (mounted) {
              setTrialSessionsLeft(nextLeft);
            }
            void trackUsageEvent({
              type: "trial_session_used",
              area: "game",
              game,
              feature,
              trialSessionsLeft: nextLeft,
            });
          }

          if (mounted) setAllowed(true);
          return;
        }

        if (response.ok && payload?.allowed) {
          if (mounted) setAllowed(true);
          return;
        }

        const reason = payload?.reason === "TRIAL_LIMIT_REACHED" ? "trial" : payload?.reason === "CHILD_LIMIT_REACHED" ? "limit" : access.reason ?? "locked";
        if (mounted) {
          setAllowed(false);
          setBlockedReason(reason);
        }

        const game = pathname.includes("spelling") ? "spelling" : pathname.includes("math") ? "math" : pathname.includes("reading") ? "reading" : "unknown";
        void trackUsageEvent({
          type: "paywall_shown",
          area: "game",
          game,
          feature,
          reason,
        });
      })
      .catch(() => {
        const fallback = getClientAccess(false);
        if (mounted) {
          setAllowed(fallback.hasAccess);
          setBlockedReason(fallback.reason ?? "locked");
          setTrialSessionsLeft(fallback.trialSessionsLeft);
        }
      });
    return () => {
      mounted = false;
    };
  }, [feature, pathname]);

  if (allowed === null) return <main className="min-h-screen bg-background" />;
  if (!allowed) return <LockedPreview reason={blockedReason}>{children}</LockedPreview>;

  return (
    <>
      {!hasPaidSubscription ? <SoftPaywallBanner sessionsLeft={trialSessionsLeft} /> : null}
      {children}
    </>
  );
}
