"use client";

import type { ReactNode } from "react";
import AdminButton from "@/components/admin/ui/AdminButton";

type AdminSidePanelProps = {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  widthClassName?: string;
};

export default function AdminSidePanel({
  open,
  title,
  description,
  children,
  onClose,
  widthClassName = "max-w-md",
}: AdminSidePanelProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#020617]/60">
      <button type="button" className="flex-1 cursor-default" aria-label="Close panel" onClick={onClose} />
      <aside
        className={`flex h-full w-full ${widthClassName} flex-col border-l border-[var(--admin-border)]`}
        style={{ background: "var(--admin-surface-raised)", boxShadow: "var(--admin-shadow)" }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--admin-border)] px-5 py-4">
          <div>
            <h2 className="admin-section-title">{title}</h2>
            {description ? <p className="admin-body mt-1">{description}</p> : null}
          </div>
          <AdminButton variant="ghost" size="sm" onClick={onClose}>
            Close
          </AdminButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </aside>
    </div>
  );
}
