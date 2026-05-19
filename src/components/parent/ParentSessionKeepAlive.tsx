"use client";

import { useEffect, useRef } from "react";
import { refreshAuthSession } from "@/lib/refresh_client";

const KEEP_ALIVE_MS = 2 * 60 * 1000;

export default function ParentSessionKeepAlive() {
  const runningRef = useRef(false);
  const pinRefreshDisabledRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function tick() {
      if (!mounted || runningRef.current) return;
      runningRef.current = true;
      try {
        const refreshed = await refreshAuthSession({ retryOnce: true });
        if (!refreshed.ok) {
          return;
        }

        if (!pinRefreshDisabledRef.current) {
          const pinResponse = await fetch("/api/pin/refresh", {
            method: "POST",
            credentials: "include",
            cache: "no-store",
          });
          if (pinResponse.status === 401 || pinResponse.status === 403) {
            pinRefreshDisabledRef.current = true;
          }
        }
      } catch {
        // Keep-alive is best-effort and should not interrupt the parent UI.
      } finally {
        runningRef.current = false;
      }
    }

    void tick();
    const intervalId = window.setInterval(() => {
      void tick();
    }, KEEP_ALIVE_MS);

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void tick();
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      mounted = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
