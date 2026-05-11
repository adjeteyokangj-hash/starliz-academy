"use client";

import { useEffect, useState } from "react";
import Logo from "@/components/Logo";

export default function AppSplash() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const navigatorWithStandalone = window.navigator as Navigator & {
      standalone?: boolean;
    };
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean(navigatorWithStandalone.standalone);

    if (isStandalone) {
      const showTimer = window.setTimeout(() => {
        setIsVisible(true);
      }, 0);
      const hideTimer = window.setTimeout(() => {
        setIsVisible(false);
      }, 2000);
      return () => {
        window.clearTimeout(showTimer);
        window.clearTimeout(hideTimer);
      };
    }
  }, []);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-9999 flex flex-col items-center justify-center bg-[linear-gradient(160deg,rgba(12,19,45,0.98),rgba(37,99,235,0.92))] animate-out fade-out duration-1000">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.1),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(129,140,248,0.2),transparent_45%)]" />

      <div className="relative space-y-6 text-center">
        <div className="flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 animate-pulse rounded-3xl bg-white/20 blur-2xl" />
            <div className="relative rounded-3xl border border-white/20 bg-white/10 p-6 backdrop-blur-sm">
              <Logo variant="icon" size={96} />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-4xl font-black text-white">StarLiz Academy</h1>
          <p className="text-lg font-semibold text-white/70">Learn. Play. Grow.</p>
        </div>

        <div className="mt-4 flex justify-center gap-2">
          <div className="app-splash-dot-1 h-2 w-2 animate-bounce rounded-full bg-white/80" />
          <div className="app-splash-dot-2 h-2 w-2 animate-bounce rounded-full bg-white/80" />
          <div className="app-splash-dot-3 h-2 w-2 animate-bounce rounded-full bg-white/80" />
        </div>
      </div>

      <p className="absolute bottom-8 text-xs font-semibold text-white/40 uppercase tracking-widest">
        Loading your learning journey\u2026
      </p>
    </div>
  );
}
