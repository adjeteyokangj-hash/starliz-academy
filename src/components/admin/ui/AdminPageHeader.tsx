import type { ReactNode } from "react";

type AdminPageHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
};

export default function AdminPageHeader({
  eyebrow = "School Management",
  title,
  subtitle,
  actions,
  className = "",
}: AdminPageHeaderProps) {
  return (
    <div className={`mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${className}`}>
      <div className="min-w-0">
        {eyebrow ? <p className="admin-meta mb-2">{eyebrow}</p> : null}
        <h1 className="admin-page-title">{title}</h1>
        {subtitle ? <p className="admin-body mt-2 max-w-2xl">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
