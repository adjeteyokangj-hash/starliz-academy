"use client";

import { ReactNode, useId, useState } from "react";

type Props = {
  title: string;
  count?: number | string | null;
  defaultOpen?: boolean;
  className?: string;
  bodyClassName?: string;
  id?: string;
  children: ReactNode;
};

export default function CollapsibleCard({
  title,
  count,
  defaultOpen = true,
  className = "",
  bodyClassName = "",
  id,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div
      id={id}
      className={`overflow-hidden rounded-xl border border-border bg-card ${className}`.trim()}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`flex w-full items-center justify-between gap-3 bg-muted/40 px-4 py-3 text-left transition-colors hover:bg-muted/55 ${
          open ? "border-b border-border" : ""
        }`}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
          <span className="truncate">{title}</span>
          {count !== undefined && count !== null ? (
            <span className="rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-foreground/60">
              {count}
            </span>
          ) : null}
        </span>
        <span
          className={`shrink-0 text-xs text-foreground/40 transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
          aria-hidden
        >
          ▾
        </span>
      </button>
      {open ? (
        <div id={panelId} className={bodyClassName}>
          {children}
        </div>
      ) : null}
    </div>
  );
}