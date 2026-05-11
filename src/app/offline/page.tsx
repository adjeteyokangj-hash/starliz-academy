"use client";

import { useEffect, useState } from "react";
import Logo from "@/components/Logo";

export default function OfflinePage() {
  const [cachedPages, setCachedPages] = useState<string[]>([]);

  useEffect(() => {
    const getCachedPages = async () => {
      if (!('caches' in window)) return;
      try {
        const cacheNames = await window.caches.keys();
        const pages: string[] = [];
        for (const name of cacheNames) {
          const cache = await window.caches.open(name);
          const requests = await cache.keys();
          pages.push(...requests.map(r => {
            try {
              const url = new URL(r.url);
              const path = url.pathname;
              if (path.includes('/games/')) return 'Games';
              if (path.includes('/dashboard')) return 'Dashboard';
              if (path.includes('/rewards')) return 'Rewards';
              if (path.includes('/pet')) return 'Virtual Pet';
              return null;
            } catch {
              return null;
            }
          }).filter(Boolean) as string[]);
        }
        setCachedPages([...new Set(pages)]);
      } catch (e) {
        console.error('Error reading cache:', e);
      }
    };
    getCachedPages();
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[linear-gradient(160deg,rgba(12,19,45,0.96),rgba(37,99,235,0.88))] px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <div className="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
            <Logo variant="icon" size={64} />
          </div>
        </div>

        <div className="rounded-3xl border border-white/20 bg-white/10 p-8 text-center backdrop-blur-md">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-white/60">Offline Mode</p>
          <h1 className="mt-3 text-4xl font-black leading-tight text-white">No Internet Connection</h1>
          <p className="mt-4 text-base leading-relaxed text-white/75">
            StarLiz is working in offline mode. Your progress is being saved locally and will sync automatically when you reconnect.
          </p>

          {cachedPages.length > 0 && (
            <div className="mt-6 rounded-2xl border border-cyan-200/30 bg-cyan-400/15 p-4 text-left">
              <p className="text-xs font-semibold uppercase tracking-widest text-cyan-200">📦 Available Offline</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {cachedPages.map(page => (
                  <span key={page} className="inline-flex rounded-full bg-cyan-500/30 px-3 py-1.5 text-sm font-semibold text-cyan-100">
                    {page}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 space-y-3">
            <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
              <span className="shrink-0 text-xl">💾</span>
              <div className="text-left">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-white/90">Local Storage</p>
                <p className="text-[0.85rem] text-white/70">Your learning progress is saved on this device.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
              <span className="shrink-0 text-xl">🔄</span>
              <div className="text-left">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-white/90">Auto Sync</p>
                <p className="text-[0.85rem] text-white/70">Changes will sync to the cloud when you reconnect.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
              <span className="shrink-0 text-xl">🚀</span>
              <div className="text-left">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-white/90">Keep Learning</p>
                <p className="text-[0.85rem] text-white/70">Use cached content to continue your lesson.</p>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs font-semibold text-white/50 uppercase tracking-widest">
          🌐 Waiting for connection…
        </p>
      </div>
    </main>
  );
}
