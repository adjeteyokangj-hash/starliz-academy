"use client";

import { useEffect } from "react";

const RECOVERY_KEY = "starliz-chunk-load-recovered";

function isChunkLoadFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("ChunkLoadError") || message.includes("Loading chunk") || message.includes("chunk failed");
}

export default function ChunkLoadRecovery() {
  useEffect(() => {
    const recover = () => {
      if (typeof window === "undefined") return;
      if (window.sessionStorage.getItem(RECOVERY_KEY) === "1") return;
      window.sessionStorage.setItem(RECOVERY_KEY, "1");
      window.location.reload();
    };

    const handleError = (event: ErrorEvent) => {
      if (isChunkLoadFailure(event.error ?? event.message)) {
        recover();
      }
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      if (isChunkLoadFailure(event.reason)) {
        recover();
      }
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null;
}