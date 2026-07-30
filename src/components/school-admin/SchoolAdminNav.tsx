"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { getSchoolRoleLabel } from "@/lib/schools/permissions";

type NavLink = { href: string; label: string; exact?: boolean };

type NavSection = {
  id: string;
  label: string;
  href?: string;
  exact?: boolean;
  children?: NavLink[];
};

const NAV_SECTIONS: NavSection[] = [
  { id: "overview", label: "Overview", href: "/school-admin", exact: true },
  {
    id: "day-school",
    label: "Day School",
    children: [
      { href: "/school-admin/day-school/timetable", label: "Timetable" },
      { href: "/school-admin/day-school/classes", label: "Classes" },
      { href: "/school-admin/day-school/students", label: "Students" },
      { href: "/school-admin/day-school/teachers", label: "Staff" },
      { href: "/school-admin/day-school/attendance", label: "Attendance" },
      { href: "/school-admin/day-school/lessons", label: "Lessons" },
      { href: "/school-admin/day-school/lesson-review", label: "Lesson Review" },
      { href: "/school-admin/day-school/reports", label: "Reports" },
    ],
  },
  {
    id: "short-learning",
    label: "Short Learning",
    children: [
      { href: "/school-admin/short-learning", label: "Overview", exact: true },
      { href: "/school-admin/short-learning/bookings", label: "Bookings" },
      { href: "/school-admin/short-learning/forecast", label: "Demand Forecast" },
      { href: "/school-admin/short-learning/shifts", label: "Tutor Shifts" },
      { href: "/school-admin/short-learning/coverage", label: "Coverage" },
      { href: "/school-admin/short-learning/policies", label: "Policies & Settings" },
      { href: "/school-admin/short-learning/reliability", label: "Reliability" },
    ],
  },
  { id: "knowledge", label: "Knowledge Library", href: "/school-admin/knowledge-library" },
  { id: "settings", label: "School Settings", href: "/school-admin/settings" },
];

function linkActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function activeSectionIds(pathname: string): Set<string> {
  const open = new Set<string>();
  for (const section of NAV_SECTIONS) {
    if (!section.children) continue;
    if (section.children.some((child) => linkActive(pathname, child.href, child.exact))) {
      open.add(section.id);
    }
  }
  if (pathname.startsWith("/school-admin/short-learning")) open.add("short-learning");
  if (pathname.startsWith("/school-admin/day-school")) open.add("day-school");
  return open;
}

type Props = {
  schoolName: string;
  role: string;
};

export default function SchoolAdminNav({ schoolName, role }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const roleLabel = getSchoolRoleLabel(role);
  // Manual accordion override for the current route only; inactive route cards stay collapsed.
  const [override, setOverride] = useState<{ path: string; openId: string | null } | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const openId =
    override?.path === pathname
      ? override.openId
      : ([...activeSectionIds(pathname)][0] ?? null);

  function toggleSection(id: string) {
    setOverride({
      path: pathname,
      openId: openId === id ? null : id,
    });
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => undefined);
    } finally {
      router.replace("/auth/login");
      setSigningOut(false);
    }
  }

  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-border bg-card">
      <div className="border-b border-border px-4 py-5">
        <p className="mb-0.5 text-xs uppercase tracking-wide text-foreground/40">School portal</p>
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{schoolName}</p>
        <p className="mt-1 text-xs text-foreground/50">{roleLabel}</p>
      </div>

      <nav className="flex-1 space-y-2 overflow-y-auto p-2 py-4">
        {NAV_SECTIONS.map((section) => {
          if (!section.children) {
            const active = section.href
              ? linkActive(pathname, section.href, section.exact)
              : false;
            return (
              <Link
                key={section.id}
                href={section.href ?? "/school-admin"}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-primary/10 font-semibold text-primary"
                    : "text-foreground/70 hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                {section.label}
              </Link>
            );
          }

          const expanded = openId === section.id;
          const sectionActive = section.children.some((child) =>
            linkActive(pathname, child.href, child.exact),
          );

          return (
            <div
              key={section.id}
              className={`overflow-hidden rounded-xl border transition-colors ${
                sectionActive || expanded
                  ? "border-border bg-muted/20"
                  : "border-transparent hover:border-border/70"
              }`}
            >
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                  sectionActive
                    ? "font-semibold text-foreground"
                    : "text-foreground/70 hover:text-foreground"
                }`}
                aria-expanded={expanded}
                aria-controls={`nav-section-${section.id}`}
              >
                <span>{section.label}</span>
                <span
                  className={`text-xs text-foreground/40 transition-transform ${expanded ? "rotate-0" : "-rotate-90"}`}
                  aria-hidden
                >
                  ▾
                </span>
              </button>
              {expanded ? (
                <div
                  id={`nav-section-${section.id}`}
                  className="space-y-0.5 border-t border-border/70 px-2 pb-2 pt-1"
                >
                  {section.children.map((child) => {
                    const active = linkActive(pathname, child.href, child.exact);
                    return (
                      <Link
                        key={`${section.id}-${child.label}-${child.href}`}
                        href={child.href}
                        className={`flex items-center rounded-lg px-3 py-1.5 text-sm transition-colors ${
                          active
                            ? "bg-primary/10 font-semibold text-primary"
                            : "text-foreground/65 hover:bg-muted/50 hover:text-foreground"
                        }`}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
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
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={signingOut}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-foreground/50 transition-colors hover:bg-muted/40 hover:text-foreground disabled:opacity-60"
        >
          {signingOut ? "Signing out..." : "Sign out"}
        </button>
      </div>
    </aside>
  );
}