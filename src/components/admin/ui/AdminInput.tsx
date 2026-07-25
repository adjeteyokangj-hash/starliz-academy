import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const fieldClass =
  "w-full rounded-[var(--admin-radius)] border border-[var(--admin-border-strong)] bg-[var(--admin-rail)] px-3.5 py-2.5 text-sm text-[var(--admin-text)] outline-none transition placeholder:text-[var(--admin-muted)] focus:border-[var(--admin-primary)] focus:ring-2 focus:ring-[var(--admin-primary)]/25";

export function AdminInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${fieldClass} ${className}`} {...props} />;
}

export function AdminSelect({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${fieldClass} ${className}`} {...props}>
      {children}
    </select>
  );
}

export function AdminTextarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${fieldClass} ${className}`} {...props} />;
}

export function AdminFieldLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-sm font-semibold text-[var(--admin-text)] ${className}`}>
      {children}
    </label>
  );
}
