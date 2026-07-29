"use client";

import type { ReactNode } from "react";
import AdminCollapsibleCard from "@/components/admin/ui/AdminCollapsibleCard";

type AdminCardProps = {
  children: ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg";
  raised?: boolean;
  /** When set, the card becomes a collapsible section across the admin portal. */
  title?: string;
  eyebrow?: string;
  subtitle?: string;
  action?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  count?: number | string | null;
};

const paddingClass = {
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

export default function AdminCard({
  children,
  className = "",
  padding = "md",
  raised = false,
  title,
  eyebrow,
  subtitle,
  action,
  collapsible,
  defaultOpen = true,
  count,
}: AdminCardProps) {
  const shouldCollapse = Boolean(title) && collapsible !== false;

  if (shouldCollapse && title) {
    return (
      <AdminCollapsibleCard
        title={title}
        eyebrow={eyebrow}
        subtitle={subtitle}
        action={action}
        className={className}
        padding={padding}
        raised={raised}
        defaultOpen={defaultOpen}
        count={count}
      >
        {children}
      </AdminCollapsibleCard>
    );
  }

  return (
    <section
      className={`rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)] ${paddingClass[padding]} ${className}`}
      style={{
        background: raised ? "var(--admin-surface-raised)" : "var(--admin-surface)",
        boxShadow: "var(--admin-shadow-sm)",
      }}
    >
      {title ? (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            {eyebrow ? <p className="admin-meta mb-1">{eyebrow}</p> : null}
            <h2 className="admin-section-title">{title}</h2>
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
