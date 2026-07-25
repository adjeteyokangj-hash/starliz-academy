"use client";

import type { ReactNode } from "react";
import AdminButton from "@/components/admin/ui/AdminButton";

type AdminModalProps = {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  className?: string;
};

export default function AdminModal({
  open,
  title,
  description,
  children,
  onClose,
  footer,
  className = "max-w-md",
}: AdminModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/70 p-4 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-modal-title"
        className={`w-full rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)] p-6 ${className}`}
        style={{ background: "var(--admin-surface-raised)", boxShadow: "var(--admin-shadow)" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="admin-modal-title" className="admin-section-title">
              {title}
            </h2>
            {description ? <p className="admin-body mt-1.5">{description}</p> : null}
          </div>
          <AdminButton variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            Close
          </AdminButton>
        </div>
        <div className="mt-5">{children}</div>
        {footer ? <div className="mt-5 flex flex-wrap gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}
