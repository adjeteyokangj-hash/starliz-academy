"use client";

import { useEffect, useRef } from "react";
import { refreshAuthSession } from "@/lib/refresh_client";

const KEEP_ALIVE_MS = 2 * 60 * 1000;

async function refreshAdminSession() {
  await refreshAuthSession({ retryOnce: true });
}

export default function AdminSessionKeepAlive() {
  const runningRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function tick() {
      if (!mounted || runningRef.current) return;
      runningRef.current = true;
      try {
        await refreshAdminSession();
      } catch {
        // Keep-alive should be silent; middleware/login flow handles true expiry.
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
