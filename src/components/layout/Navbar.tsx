"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { clearProfile, saveLastPage } from "@/lib/store";

type AuthMePayload = {
  authenticated?: boolean;
  user?: {
    role?: string;
  };
};

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [authResolved, setAuthResolved] = useState(false);

  const isStudentPage = Boolean(
    pathname?.startsWith("/student") ||
    pathname?.startsWith("/games") ||
    pathname === "/dashboard" ||
    pathname?.startsWith("/dashboard/")
  );
  const isStudentContext = role === "student" || (!authResolved && isStudentPage);
  const dashboardHref = isStudentContext ? "/student/dashboard" : "/dashboard";
  const profileHref = isStudentContext ? "/student/profile" : role === "parent" ? "/parent/profile" : "/my-profile";
  const showParentAccess = authResolved && role === "parent";

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
    // Close mobile menu after navigation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileOpen(false);
    // Track last child page so "Continue" can resume their session
    const CHILD_PAGES = ["/dashboard", "/student", "/games", "/spelling", "/maths", "/reading", "/student/profile", "/goals"];
    if (CHILD_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      saveLastPage(pathname);
    }
  }, [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    }).catch(() => undefined);
    clearProfile();
    router.replace("/auth/login");
  }

  return (
    <header className="sticky top-0 z-10 border-b border-(--ring-color) bg-(--surface) backdrop-blur">
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
            <Link className="rounded-xl px-3 py-2 hover:bg-slate-100" href={dashboardHref}>
              Dashboard
            </Link>
            <Link className="rounded-xl px-3 py-2 hover:bg-slate-100" href={profileHref}>
              My Profile
            </Link>
            <Link className="rounded-xl px-3 py-2 hover:bg-slate-100" href="/games/spelling">
              Spelling
            </Link>
            <Link className="rounded-xl px-3 py-2 hover:bg-slate-100" href="/games/math">
              Maths
            </Link>
            <Link className="rounded-xl px-3 py-2 hover:bg-slate-100" href="/games/reading">
              Reading
            </Link>
            {showParentAccess && (isStudentPage ? (
              <Link className="rounded-xl px-3 py-2 text-slate-500 hover:bg-slate-100" href="/parent-pin">
                Parent View
              </Link>
            ) : (
              <Link className="rounded-xl px-3 py-2 hover:bg-slate-100" href="/parent-pin">
                Parent Area
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

        <nav
          id="primary-mobile-nav"
          className={`${mobileOpen ? "mt-3 grid" : "hidden"} gap-1 text-sm font-semibold text-slate-700 md:hidden`}
          aria-label="Primary"
        >
          <Link className="rounded-xl px-3 py-2 hover:bg-slate-100" href={dashboardHref}>
            Dashboard
          </Link>
          <Link className="rounded-xl px-3 py-2 hover:bg-slate-100" href={profileHref}>
            My Profile
          </Link>
          <Link className="rounded-xl px-3 py-2 hover:bg-slate-100" href="/games/spelling">
            Spelling
          </Link>
          <Link className="rounded-xl px-3 py-2 hover:bg-slate-100" href="/games/math">
            Maths
          </Link>
          <Link className="rounded-xl px-3 py-2 hover:bg-slate-100" href="/games/reading">
            Reading
          </Link>
          {showParentAccess && (isStudentPage ? (
            <Link className="rounded-xl px-3 py-2 text-slate-500 hover:bg-slate-100" href="/parent-pin">
              Parent View
            </Link>
          ) : (
            <Link className="rounded-xl px-3 py-2 hover:bg-slate-100" href="/parent-pin">
              Parent Area
            </Link>
          ))}
          <button
            type="button"
            className="rounded-xl px-3 py-2 text-left font-bold text-rose-700 hover:bg-rose-50"
            onClick={() => void logout()}
          >
            Logout
          </button>
        </nav>
      </div>
    </header>
  );
}
