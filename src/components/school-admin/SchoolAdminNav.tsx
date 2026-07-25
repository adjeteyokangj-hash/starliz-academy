"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/school-admin", label: "Overview", exact: true },
  { href: "/school-admin/short-learning", label: "Short Learning", exact: true },
  { href: "/school-admin/short-learning/bookings", label: "Bookings", exact: true },
  { href: "/school-admin/short-learning/forecast", label: "Demand Forecast", exact: true },
  { href: "/school-admin/short-learning/shifts", label: "Tutor Shifts", exact: true },
  { href: "/school-admin/short-learning/coverage", label: "Coverage", exact: true },
  { href: "/school-admin/short-learning/policies", label: "Policies/Settings", exact: true },
  { href: "/school-admin/short-learning/reliability", label: "Reliability", exact: true },
  { href: "/school-admin/knowledge-library", label: "Knowledge library", exact: true },
];

type Props = {
  schoolName: string;
  role: string;
};

export default function SchoolAdminNav({ schoolName, role }: Props) {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex w-56 shrink-0 flex-col border-r border-border bg-card">
      <div className="border-b border-border px-4 py-5">
        <p className="mb-0.5 text-xs uppercase tracking-wide text-foreground/40">School admin</p>
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{schoolName}</p>
        <p className="mt-1 text-xs capitalize text-foreground/50">{role}</p>
      </div>

      <nav className="flex-1 space-y-0.5 p-2 py-4">
        {NAV_ITEMS.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-primary/10 font-semibold text-primary"
                  : "text-foreground/70 hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-border p-3">
        <Link
          href="/api/portal/mode?mode=teaching"
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10"
        >
          Switch to Teaching
        </Link>
        <Link
          href="/api/auth/logout"
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-foreground/50 transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          Sign out
        </Link>
      </div>
    </aside>
  );
}
