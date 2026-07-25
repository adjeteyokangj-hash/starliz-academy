import Link from "next/link";
import { AdminButton } from "@/components/admin/ui";

type AdminEmptyStateProps = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  href?: string;
};

export default function AdminEmptyState({ title, description, actionLabel, onAction, href }: AdminEmptyStateProps) {
  const action = actionLabel ? (
    href ? (
      <Link
        href={href}
        className="inline-flex rounded-[var(--admin-radius)] bg-[var(--admin-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--admin-primary-hover)]"
      >
        {actionLabel}
      </Link>
    ) : (
      <AdminButton type="button" onClick={onAction}>
        {actionLabel}
      </AdminButton>
    )
  ) : null;

  return (
    <div
      className="rounded-[var(--admin-radius-lg)] border border-dashed border-[var(--admin-border-strong)] px-6 py-8 text-center"
      style={{ background: "color-mix(in srgb, var(--admin-surface) 70%, transparent)" }}
    >
      <p className="admin-section-title">{title}</p>
      <p className="admin-body mx-auto mt-2 max-w-md">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
