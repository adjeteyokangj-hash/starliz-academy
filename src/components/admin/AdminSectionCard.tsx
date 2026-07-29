"use client";

import AdminCollapsibleCard from "@/components/admin/ui/AdminCollapsibleCard";

type AdminSectionCardProps = {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  defaultOpen?: boolean;
  count?: number | string | null;
};

export default function AdminSectionCard({
  title,
  eyebrow,
  subtitle,
  action,
  children,
  className = "",
  defaultOpen = true,
  count,
}: AdminSectionCardProps) {
  return (
    <AdminCollapsibleCard
      title={title}
      eyebrow={eyebrow}
      subtitle={subtitle}
      action={action}
      className={className}
      defaultOpen={defaultOpen}
      count={count}
      padding="md"
    >
      {children}
    </AdminCollapsibleCard>
  );
}
