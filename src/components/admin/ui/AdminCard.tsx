import type { ReactNode } from "react";

type AdminCardProps = {
  children: ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg";
  raised?: boolean;
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
}: AdminCardProps) {
  return (
    <section
      className={`rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)] ${paddingClass[padding]} ${className}`}
      style={{
        background: raised ? "var(--admin-surface-raised)" : "var(--admin-surface)",
        boxShadow: "var(--admin-shadow-sm)",
      }}
    >
      {children}
    </section>
  );
}
