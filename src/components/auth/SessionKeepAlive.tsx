"use client";

import { useEffect, useRef } from "react";
import { fetchWithRefreshRetry, refreshAuthSession } from "@/lib/refresh_client";

/** Refresh while the user is active (must stay under the 15-minute access-token TTL). */
const KEEP_ALIVE_MS = 2 * 60 * 1000;
/** Logout only after this much idle time with no user activity. */
const IDLE_LOGOUT_MS = 5 * 60 * 1000;
/** How often we check idle expiry. */
const IDLE_CHECK_MS = 30 * 1000;
/** Ignore high-frequency mouse moves closer than this. */
const ACTIVITY_THROTTLE_MS = 5 * 1000;

type Props = {
  /** Where to send the user after an idle logout. */
  loginPath?: string;
  /** Parent portal also extends the parent-unlock PIN cookie. */
  refreshPin?: boolean;
};

export default function SessionKeepAlive({
  loginPath = "/auth/login",
  refreshPin = false,
}: Props) {
  const runningRef = useRef(false);
  // eslint-disable-next-line react-hooks/purity -- seed inactivity timer at mount; frozen behaviour, advisory only
  const lastActivityRef = useRef(Date.now());
  const lastActivityWriteRef = useRef(0);
  const loggingOutRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    function markActivity() {
      const now = Date.now();
      if (now - lastActivityWriteRef.current < ACTIVITY_THROTTLE_MS) return;
      lastActivityWriteRef.current = now;
      lastActivityRef.current = now;
    }

    async function logoutForIdle() {
      if (!mounted || loggingOutRef.current) return;
      loggingOutRef.current = true;
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
        });
      } catch {
        // Best-effort; still send the user to login.
      }
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(`${loginPath}?reason=idle&next=${next}`);
    }

    async function tick() {
      if (!mounted || runningRef.current || loggingOutRef.current) return;

      const idleFor = Date.now() - lastActivityRef.current;
      if (idleFor >= IDLE_LOGOUT_MS) {
        await logoutForIdle();
        return;
      }

      runningRef.current = true;
      try {
        const refreshed = await refreshAuthSession({ retryOnce: true });
        if (!refreshed.ok) {
          return;
        }

        if (refreshPin) {
          // 403 = PIN not unlocked yet — keep trying on later ticks after unlock.
          // Never permanently disable PIN refresh or unlock cookies expire mid-session.
          await fetchWithRefreshRetry("/api/pin/refresh", {
            method: "POST",
            credentials: "include",
            cache: "no-store",
          });
        }
      } catch {
        // Keep-alive is best-effort and should not interrupt the UI.
      } finally {
        runningRef.current = false;
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      markActivity();
      void tick();
    }

    const activityEvents: Array<keyof DocumentEventMap> = [
      "pointerdown",
      "pointermove",
      "keydown",
      "scroll",
      "touchstart",
      "touchmove",
      "mousemove",
      "click",
      "wheel",
    ];
    for (const eventName of activityEvents) {
      document.addEventListener(eventName, markActivity, { passive: true, capture: true });
    }
    window.addEventListener("focus", markActivity);
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Delay first refresh slightly so initial page data isn't competing in dev.
    const startId = window.setTimeout(() => {
      void tick();
    }, 8_000);
    const keepAliveId = window.setInterval(() => {
      void tick();
    }, KEEP_ALIVE_MS);
    const idleCheckId = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current >= IDLE_LOGOUT_MS) {
        void logoutForIdle();
      }
    }, IDLE_CHECK_MS);

    return () => {
      mounted = false;
      window.clearTimeout(startId);
      window.clearInterval(keepAliveId);
      window.clearInterval(idleCheckId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", markActivity);
      for (const eventName of activityEvents) {
        document.removeEventListener(eventName, markActivity, { capture: true } as EventListenerOptions);
      }
    };
  }, [loginPath, refreshPin]);

  return null;
}
