"use client";

import { type ReactNode, useId, useState } from "react";

type AdminCollapsibleCardProps = {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  padding?: "sm" | "md" | "lg";
  raised?: boolean;
  defaultOpen?: boolean;
  count?: number | string | null;
};

const paddingClass = {
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

export default function AdminCollapsibleCard({
  title,
  eyebrow,
  subtitle,
  action,
  children,
  className = "",
  bodyClassName = "",
  padding = "md",
  raised = false,
  defaultOpen = true,
  count,
}: AdminCollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <section
      className={`overflow-hidden rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)] ${className}`}
      style={{
        background: raised ? "var(--admin-surface-raised)" : "var(--admin-surface)",
        boxShadow: "var(--admin-shadow-sm)",
      }}
    >
      <div
        className={`flex items-start gap-3 ${paddingClass[padding]} ${open ? "pb-3" : ""}`}
      >
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-start justify-between gap-3 text-left transition-opacity hover:opacity-90"
          aria-expanded={open}
          aria-controls={panelId}
        >
          <span className="min-w-0">
            {eyebrow ? <p className="admin-meta mb-1">{eyebrow}</p> : null}
            <span className="flex flex-wrap items-center gap-2">
              <h2 className="admin-section-title">{title}</h2>
              {count !== undefined && count !== null ? (
                <span className="rounded-full border border-[var(--admin-border)] bg-[var(--admin-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--admin-muted)]">
                  {count}
                </span>
              ) : null}
            </span>
            {subtitle ? <p className="mt-1 text-sm text-[var(--admin-muted)]">{subtitle}</p> : null}
          </span>
          <span
            className={`mt-1 shrink-0 text-sm text-[var(--admin-muted)] transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
            aria-hidden
          >
            ▾
          </span>
        </button>
        {action ? <div className="shrink-0 pt-0.5">{action}</div> : null}
      </div>
      {open ? (
        <div
          id={panelId}
          className={`${paddingClass[padding]} pt-0 ${bodyClassName}`.trim()}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}
