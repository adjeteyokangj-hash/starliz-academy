import type { ReactNode } from "react";

export function AdminTable({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)] ${className}`}>
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export function AdminTableHead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-[var(--admin-border)] bg-[var(--admin-rail)]">{children}</tr>
    </thead>
  );
}

export function AdminTh({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-3.5 text-xs font-bold uppercase tracking-[0.08em] text-[var(--admin-muted)] ${className}`}>
      {children}
    </th>
  );
}

export function AdminTableBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function AdminTr({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <tr className={`border-b border-[var(--admin-border)] last:border-b-0 hover:bg-white/[0.03] ${className}`}>
      {children}
    </tr>
  );
}

export function AdminTd({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-3.5 text-[var(--admin-text)] ${className}`}>{children}</td>;
}

export function AdminTableEmpty({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-[var(--admin-muted)]">
        {message}
      </td>
    </tr>
  );
}
