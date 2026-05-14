"use client";

import { useEffect, useRef } from "react";

const KEEP_ALIVE_MS = 2 * 60 * 1000;

async function refreshParentSession() {
  await fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
  });

  await fetch("/api/pin/refresh", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
  });
}

export default function ParentSessionKeepAlive() {
  const runningRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function tick() {
      if (!mounted || runningRef.current) return;
      runningRef.current = true;
      try {
        await refreshParentSession();
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
