"use client";

import { useEffect, useState } from "react";
import { getOfflineQueueSnapshot, replayOfflineQueue } from "@/lib/offline_queue";

export default function OfflineBadge() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [sent, setSent] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const sync = async () => {
      const isOnline = window.navigator.onLine;
      if (isOnline && (pending > 0 || sent > 0)) {
        setSyncing(true);
        await replayOfflineQueue();
        setSyncing(false);
      }
      const snapshot = getOfflineQueueSnapshot();
      setOnline(isOnline);
      setPending(snapshot.pending + snapshot.failed);
      setSent(snapshot.sent);
    };
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.removeEventListener("storage", sync);
    };
  }, [pending, sent]);

  if (online && pending === 0 && sent === 0) return null;

  const statusIcon = !online 
    ? "📡" 
    : syncing 
      ? "⟳" 
      : sent > 0 
        ? "✓" 
        : "";

  return (
    <div className={`fixed bottom-6 right-6 z-30 rounded-2xl px-4 py-3 shadow-[0_20px_50px_rgba(0,0,0,0.28)] backdrop-blur-sm border ${
      !online 
        ? "border-orange-200/40 bg-gradient-to-br from-orange-50/95 to-amber-50/95 text-orange-900" 
        : syncing
          ? "border-cyan-200/40 bg-gradient-to-br from-cyan-50/95 to-blue-50/95 text-cyan-900"
          : "border-emerald-200/40 bg-gradient-to-br from-emerald-50/95 to-teal-50/95 text-emerald-900"
    }`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={`inline-flex h-6 w-6 items-center justify-center text-lg ${
            syncing ? "animate-spin" : ""
          }`}>
            {statusIcon}
          </span>
          <div className="flex flex-col gap-0.5">
            <p className="text-[0.85rem] font-bold tracking-[0.08em] uppercase">
              {!online 
                ? "📴 Offline Mode" 
                : syncing 
                  ? "⟳ Syncing Progress" 
                  : "✓ Connected"
              }
            </p>
            <p className="text-[0.7rem] font-semibold opacity-75">
              {!online
                ? pending > 0 ? `${pending} queued for sync` : "Will sync when online"
                : syncing
                  ? `Syncing ${pending} item${pending !== 1 ? "s" : ""}…`
                  : sent > 0 ? `${sent} item${sent !== 1 ? "s" : ""} synced` : "Up to date"
              }
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
