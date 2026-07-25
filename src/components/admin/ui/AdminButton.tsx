import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";

type CommonProps = {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  className?: string;
};

const variantClass: Record<Variant, string> = {
  primary:
    "bg-[var(--admin-primary)] text-white hover:bg-[var(--admin-primary-hover)] shadow-[var(--admin-shadow-sm)]",
  secondary:
    "border border-[var(--admin-border-strong)] bg-[var(--admin-surface-raised)] text-[var(--admin-text)] hover:border-[var(--admin-primary)]/40",
  danger: "border border-rose-500/30 bg-rose-950/40 text-rose-200 hover:bg-rose-900/50",
  ghost: "text-[var(--admin-muted)] hover:bg-white/5 hover:text-[var(--admin-text)]",
};

const sizeClass: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2.5 text-sm",
};

function classes(variant: Variant, size: Size, className: string) {
  return `inline-flex items-center justify-center gap-2 rounded-[var(--admin-radius)] font-semibold transition disabled:cursor-not-allowed disabled:opacity-55 ${variantClass[variant]} ${sizeClass[size]} ${className}`;
}

type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement>;

export function AdminButton({
  children,
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={classes(variant, size, className)} {...props}>
      {children}
    </button>
  );
}

type LinkProps = CommonProps & {
  href: string;
  "aria-label"?: string;
};

export function AdminButtonLink({
  children,
  href,
  variant = "primary",
  size = "md",
  className = "",
  "aria-label": ariaLabel,
}: LinkProps) {
  return (
    <Link href={href} aria-label={ariaLabel} className={classes(variant, size, className)}>
      {children}
    </Link>
  );
}

export default AdminButton;
