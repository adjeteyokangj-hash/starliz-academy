"use client";

import { type ReactNode, useEffect, useId, useState } from "react";

type ParentCollapsibleCardProps = {
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
  defaultOpen?: boolean;
  /** Persist open/closed in localStorage under this key. */
  storageKey?: string;
  headerExtra?: ReactNode;
};

function readStoredOpen(storageKey: string | undefined, fallback: boolean): boolean {
  if (!storageKey || typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === "0") return false;
    if (raw === "1") return true;
  } catch {
    // ignore storage failures
  }
  return fallback;
}

export default function ParentCollapsibleCard({
  title,
  description,
  children,
  className = "",
  bodyClassName = "",
  defaultOpen = true,
  storageKey,
  headerExtra,
}: ParentCollapsibleCardProps) {
  const panelId = useId();
  const resolvedKey = storageKey ?? `parent-card:${title}`;
  const [open, setOpen] = useState(defaultOpen);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setOpen(readStoredOpen(resolvedKey, defaultOpen));
    setHydrated(true);
  }, [resolvedKey, defaultOpen]);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(resolvedKey, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  return (
    <section
      className={`rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-2xl shadow-slate-950/30 sm:p-5 lg:p-6 ${className}`}
    >
      <div className={`flex items-start gap-3 ${open && children ? "mb-4" : ""}`}>
        <button
          type="button"
          onClick={toggle}
          className="flex min-w-0 flex-1 items-start justify-between gap-3 text-left transition-opacity hover:opacity-90"
          aria-expanded={open}
          aria-controls={panelId}
        >
          <span className="min-w-0">
            <h2 className="text-xl font-bold text-white">{title}</h2>
            {description ? <p className="mt-1 text-sm text-slate-400">{description}</p> : null}
          </span>
          <span
            className={`mt-1 shrink-0 text-sm text-slate-400 transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
            aria-hidden
          >
            ▾
          </span>
        </button>
        {headerExtra ? <div className="shrink-0 pt-0.5">{headerExtra}</div> : null}
      </div>
      {open || !hydrated ? (
        <div id={panelId} hidden={!open && hydrated} className={bodyClassName}>
          {children}
        </div>
      ) : null}
    </section>
  );
}