"use client";

import { useId, useMemo, useState } from "react";
import AdminSectionCard from "@/components/admin/AdminSectionCard";

type GaHubAccordionSectionProps = {
  title: string;
  eyebrow?: string;
  defaultOpen?: boolean;
  helperText?: string;
  className?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
};

export default function GaHubAccordionSection({
  title,
  eyebrow,
  defaultOpen = false,
  helperText,
  className,
  action,
  children,
}: GaHubAccordionSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const panelId = useId();
  const triggerId = useMemo(() => `${panelId}-trigger`, [panelId]);

  return (
    <AdminSectionCard
      title={title}
      eyebrow={eyebrow}
      className={className}
      action={
        <div className="flex items-center gap-2">
          {action}
          <button
            type="button"
            onClick={() => setIsOpen((current) => !current)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-[11px] font-black uppercase tracking-wide text-slate-200"
            aria-controls={panelId}
            id={triggerId}
          >
            <svg
              aria-hidden="true"
              className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : "rotate-90"}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
            </svg>
            {isOpen ? "Collapse" : "Expand"}
          </button>
        </div>
      }
    >
      {helperText ? <p className="mb-3 text-xs text-slate-400">{helperText}</p> : null}
      <div id={panelId} role="region" aria-labelledby={triggerId} hidden={!isOpen}>
        {children}
      </div>
    </AdminSectionCard>
  );
}
