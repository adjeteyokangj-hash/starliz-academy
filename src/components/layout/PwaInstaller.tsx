"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

const DISMISS_KEY = "starliz-pwa-install-dismissed-at";
const DISMISS_DURATION_MS = 1000 * 60 * 60 * 24 * 7;

export default function PwaInstaller() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);

  useEffect(() => {
    const initTimer = window.setTimeout(() => {
      const dismissedAt = window.localStorage.getItem(DISMISS_KEY);
      if (dismissedAt) {
        const isDismissed = Date.now() - Number(dismissedAt) < DISMISS_DURATION_MS;
        if (isDismissed) {
          setDismissed(true);
        } else {
          window.localStorage.removeItem(DISMISS_KEY);
        }
      }

      const standaloneMatch = window.matchMedia("(display-mode: standalone)").matches;
      const navigatorWithStandalone = window.navigator as NavigatorWithStandalone;
      const isStandalone = standaloneMatch || Boolean(navigatorWithStandalone.standalone);
      const userAgent = window.navigator.userAgent.toLowerCase();
      const isIos = /iphone|ipad|ipod/.test(userAgent);
      const isSafari = /safari/.test(userAgent) && !/crios|fxios|edgios/.test(userAgent);

      setShowIosInstructions(isIos && isSafari && !isStandalone);
    }, 0);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setDeferredPrompt(null);
      setShowIosInstructions(false);
      setDismissed(true);
      window.localStorage.removeItem(DISMISS_KEY);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.clearTimeout(initTimer);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const hidePrompt = () => {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  };

  const canPromptInstall = Boolean(deferredPrompt);

  if (dismissed || (!canPromptInstall && !showIosInstructions)) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 flex justify-center sm:inset-x-auto sm:right-5 sm:max-w-104">
      <section className="relative w-full overflow-hidden rounded-4xl border border-white/60 bg-[linear-gradient(160deg,rgba(12,19,45,0.96),rgba(37,99,235,0.88))] p-5 text-white shadow-[0_30px_80px_rgba(15,23,42,0.45)] backdrop-blur xl:max-w-104">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.24),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(129,140,248,0.34),transparent_38%)]" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-white/75">
              {canPromptInstall ? "Ready to install" : "Install guide"}
            </p>
            <h2 className="mt-3 max-w-[16ch] text-2xl font-black leading-tight sm:text-[2rem]">
              {canPromptInstall ? "Turn StarLiz Academy into a one-tap app." : "Add StarLiz Academy to your home screen."}
            </h2>
          </div>
          <button
            type="button"
            onClick={hidePrompt}
            className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80 transition hover:bg-white/18 hover:text-white"
            aria-label="Dismiss install prompt"
          >
            Not now
          </button>
        </div>

        <p className="relative mt-4 text-sm leading-6 text-white/78 sm:text-[0.95rem]">
          {canPromptInstall
            ? "Pin lessons, rewards, and parent progress to the home screen for faster launch, cleaner full-screen focus, and smoother return visits."
            : "On iPhone and iPad, open the Share menu in Safari and choose Add to Home Screen to launch StarLiz Academy like a real app."}
        </p>

        <div className="relative mt-5 grid gap-2.5 sm:grid-cols-3">
          {(canPromptInstall
            ? ["Faster launch", "Full-screen focus", "Offline-ready shell"]
            : ["Open in Safari", "Tap Share", "Add to Home Screen"]
          ).map((item) => (
            <div
              key={item}
              className="rounded-2xl border border-white/12 bg-white/10 px-3 py-3 text-center text-xs font-semibold tracking-[0.08em] text-white/86"
            >
              {item}
            </div>
          ))}
        </div>

        <div className="relative mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          {canPromptInstall ? (
            <Button
              className="w-full justify-center text-center sm:flex-1"
              onClick={async () => {
                if (!deferredPrompt) return;

                await deferredPrompt.prompt();
                const choice = await deferredPrompt.userChoice;
                setDeferredPrompt(null);

                if (choice.outcome === "dismissed") {
                  hidePrompt();
                }
              }}
            >
              Install app
            </Button>
          ) : (
            <div className="w-full rounded-2xl border border-cyan-200/20 bg-cyan-300/10 px-4 py-3 text-sm font-medium text-cyan-50 sm:flex-1">
              Use Safari&apos;s Share button, then tap Add to Home Screen.
            </div>
          )}

          <button
            type="button"
            onClick={hidePrompt}
            className="w-full rounded-2xl border border-white/16 bg-white/8 px-4 py-3 text-sm font-semibold text-white/82 transition hover:bg-white/14 hover:text-white sm:w-auto"
          >
            {canPromptInstall ? "Maybe later" : "Hide guide"}
          </button>
        </div>
      </section>
    </div>
  );
}
