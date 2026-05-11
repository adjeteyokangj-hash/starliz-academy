"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SchoolRole } from "@/lib/schools/permissions";
import { canDo } from "@/lib/schools/permissions";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  permission: Parameters<typeof canDo>[1];
};

const NAV_ITEMS: NavItem[] = [
  { href: "/teacher", label: "Dashboard", icon: "🏠", permission: "viewDashboard" },
  { href: "/teacher/classrooms", label: "Classrooms", icon: "🏫", permission: "viewClassrooms" },
  { href: "/teacher/students", label: "Students", icon: "👤", permission: "viewStudents" },
  { href: "/teacher/progress", label: "Progress", icon: "📊", permission: "viewProgress" },
  { href: "/teacher/operations", label: "Operations", icon: "🧭", permission: "viewProgress" },
  { href: "/teacher/assignments", label: "Assignments", icon: "📝", permission: "issueAssignment" },
  { href: "/teacher/audit", label: "Audit Log", icon: "🔍", permission: "viewAuditLog" },
  { href: "/teacher/governance", label: "Governance", icon: "🛡️", permission: "viewAuditLog" },
];

type Props = {
  schoolName: string;
  role: SchoolRole;
};

export default function TeacherNav({ schoolName, role }: Props) {
  const pathname = usePathname();

  const visible = NAV_ITEMS.filter((item) => canDo(role, item.permission));

  return (
    <aside className="hidden lg:flex w-56 shrink-0 flex-col border-r border-border bg-card">
      {/* School name */}
      <div className="border-b border-border px-4 py-5">
        <p className="text-xs text-foreground/40 uppercase tracking-wide mb-0.5">School Portal</p>
        <p className="font-semibold text-foreground text-sm leading-snug line-clamp-2">{schoolName}</p>
      </div>

      {/* Nav links */}
      <nav className="flex-1 space-y-0.5 p-2 py-4">
        {visible.map((item) => {
          const active = item.href === "/teacher"
            ? pathname === "/teacher"
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-foreground/70 hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3">
        <Link
          href="/api/auth/logout"
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors"
        >
          <span>🚪</span> Sign out
        </Link>
      </div>
    </aside>
  );
}
