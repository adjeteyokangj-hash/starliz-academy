"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { clearProfile, saveLastPage } from "@/lib/store";
import {
  ageGroupForYearGroup,
  keyStageForYearGroup,
} from "@/lib/curriculum";

type AuthMePayload = {
  authenticated?: boolean;
  user?: {
    role?: string;
  };
};

type ActiveChildPayload = {
  child?: {
    id: string;
    name: string;
    yearGroup?: string | null;
    keyStageLevel?: string | null;
    ageYears?: number | null;
  } | null;
};

type PrimaryNavLink = {
  href: string;
  label: string;
};

export function buildPrimaryNavLinks(input: {
  showParentAccess: boolean;
  isStudentContext: boolean;
  dashboardHref: string;
  profileHref: string;
  gaLearningHubHref: string;
}): PrimaryNavLink[] {
  if (input.showParentAccess) {
    return [
      { href: "/parent/dashboard", label: "Dashboard" },
      { href: "/dashboard", label: "Child Dashboard" },
      { href: "/student/today", label: "Today" },
      { href: "/student/attendance", label: "Attendance" },
      { href: "/parent/profiles?intent=parent", label: "Parent Area" },
    ];
  }

  const links: PrimaryNavLink[] = [
    { href: input.dashboardHref, label: input.isStudentContext ? "Home" : "Dashboard" },
  ];
  if (input.isStudentContext) {
    links.push({ href: "/student/today", label: "Today" });
    links.push({ href: "/student/attendance", label: "Attendance" });
    links.push({ href: input.gaLearningHubHref, label: "Ga Learning Hub" });
  }
  links.push({ href: input.profileHref, label: "My Profile" });
  return links;
}

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [activeChild, setActiveChild] = useState<ActiveChildPayload["child"] | null>(null);

  const isStudentPage = Boolean(
    pathname?.startsWith("/student") ||
    pathname?.startsWith("/games") ||
    pathname === "/dashboard" ||
    pathname?.startsWith("/dashboard/")
  );
  // Parent→child open keeps role "parent". Do not treat unresolved auth on /student/*
  // as a student, or Ga Learning Hub flashes before /api/auth/me returns.
  const isStudentRole = role === "student";
  const pendingStudentExperience = !authResolved && isStudentPage;
  const isStudentContext = isStudentRole;
  const dashboardHref = isStudentRole || pendingStudentExperience ? "/student/dashboard" : "/dashboard";
  const profileHref = isStudentRole || pendingStudentExperience ? "/student/profile" : "/my-profile";
  const gaLearningHubHref = "/ga-learning-hub";
  const showParentAccess = authResolved && role === "parent";
  const primaryNavLinks = buildPrimaryNavLinks({
    showParentAccess,
    isStudentContext,
    dashboardHref,
    profileHref,
    gaLearningHubHref,
  });
  const studentYearGroup = activeChild?.yearGroup ?? null;
  const studentKeyStage = activeChild?.keyStageLevel?.trim() || (studentYearGroup ? keyStageForYearGroup(studentYearGroup) : null);
  const studentAgeLabel = studentYearGroup ? ageGroupForYearGroup(studentYearGroup) : activeChild?.ageYears ? `${activeChild.ageYears}` : "-";
  const curriculumLabel = "National Curriculum UK";

  useEffect(() => {
    let active = true;

    const loadRole = async () => {
      try {
        const response = await fetch("/api/auth/me", { credentials: "include" });
        if (!active) return;
        if (!response.ok) {
          setRole(null);
          setAuthResolved(true);
          return;
        }
        const payload = (await response.json()) as AuthMePayload;
        setRole(payload.user?.role ?? null);
      } catch {
        if (!active) return;
        setRole(null);
      } finally {
        if (active) setAuthResolved(true);
      }
    };

    void loadRole();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isStudentContext) return;
    let active = true;

    const loadActiveChild = async () => {
      try {
        const response = await fetch("/api/children/active", { credentials: "include" });
        if (!active || !response.ok) return;
        const payload = (await response.json()) as ActiveChildPayload;
        if (!active) return;
        setActiveChild(payload.child ?? null);
      } catch {
        if (!active) return;
        setActiveChild(null);
      }
    };

    void loadActiveChild();

    return () => {
      active = false;
    };
  }, [isStudentContext]);

  useEffect(() => {
    // Track last child page so "Continue" can resume their session
    const CHILD_PAGES = ["/dashboard", "/student", "/games", "/spelling", "/maths", "/reading", "/student/profile", "/student/today", "/student/attendance", "/goals"];
    if (CHILD_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      saveLastPage(pathname);
    }
  }, [pathname]);

  function closeMobileMenu() {
    setMobileOpen(false);
  }

  async function logout() {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    }).catch(() => undefined);
    clearProfile();
    router.replace("/auth/login");
  }

  return (
    <header className="relative z-20 border-b border-(--ring-color) bg-(--surface) backdrop-blur">
      <div className="mx-auto max-w-6xl px-3 py-3 sm:px-4">
        <div className="flex items-center justify-between">
          <Logo href={dashboardHref} variant="wordmark" size={30} textClassName="text-slate-900 dark:text-white" />

          <button
            type="button"
            className="rounded-xl px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 md:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-controls="primary-mobile-nav"
            aria-label="Toggle menu"
          >
            {mobileOpen ? "Close" : "Menu"}
          </button>

          <nav className="hidden items-center gap-2 text-sm font-semibold text-slate-700 md:flex" aria-label="Primary">
            {primaryNavLinks.map((link) => (
              <Link key={link.href} className="rounded-xl px-3 py-2 hover:bg-slate-100" href={link.href}>
                {link.label}
              </Link>
            ))}
            <button
              type="button"
              className="rounded-xl px-3 py-2 font-bold text-rose-700 hover:bg-rose-50"
              onClick={() => void logout()}
            >
              Logout
            </button>
          </nav>
        </div>

        {isStudentContext && activeChild && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-semibold text-slate-700">
            <span>Age: {studentAgeLabel} years</span>
            <span className="text-slate-300">|</span>
            <span>Year Group: {studentYearGroup ?? "-"}</span>
            <span className="text-slate-300">|</span>
            <span>Key Stage: {studentKeyStage ?? "-"}</span>
            <span className="text-slate-300">|</span>
            <span>Curriculum: {curriculumLabel}</span>
          </div>
        )}
        <nav
          id="primary-mobile-nav"
          className={`${mobileOpen ? "mt-3 grid" : "hidden"} gap-1 text-sm font-semibold text-slate-700 md:hidden`}
          aria-label="Primary"
        >
          {primaryNavLinks.map((link) => (
            <Link key={link.href} className="rounded-xl px-3 py-2 hover:bg-slate-100" href={link.href} onClick={closeMobileMenu}>
              {link.label}
            </Link>
          ))}
          <button
            type="button"
            className="rounded-xl px-3 py-2 text-left font-bold text-rose-700 hover:bg-rose-50"
            onClick={() => {
              closeMobileMenu();
              void logout();
            }}
          >
            Logout
          </button>
        </nav>
      </div>
    </header>
  );
}
