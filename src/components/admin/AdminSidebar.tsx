"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/Logo";
import type { AdminNavGroup, AdminNavItem } from "@/lib/admin-nav";

const VISIBILITY_STORAGE_KEY = "starliz.admin.sidebar.visible.v1";
const COLLAPSED_GROUPS_STORAGE_KEY = "starliz.admin.sidebar.collapsed-groups.v1";

function isActiveHref(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

function groupDomId(groupTitle: string): string {
  return `admin-nav-group-${groupTitle.toLowerCase().replaceAll(" ", "-").replaceAll("&", "and")}`;
}

export default function AdminSidebar() {
  const pathname = usePathname();
  const navRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [navGroups, setNavGroups] = useState<readonly AdminNavGroup[]>([]);

  useEffect(() => {
    try {
      const visibilityRaw = window.localStorage.getItem(VISIBILITY_STORAGE_KEY);
      if (visibilityRaw !== null) {
        const parsed = JSON.parse(visibilityRaw);
        if (typeof parsed === "boolean") {
          queueMicrotask(() => setIsVisible(parsed));
        }
      }
    } catch {
      // Ignore storage read errors.
    }

    try {
      const collapsedRaw = window.localStorage.getItem(COLLAPSED_GROUPS_STORAGE_KEY);
      if (collapsedRaw) {
        const parsed = JSON.parse(collapsedRaw);
        if (Array.isArray(parsed)) {
          const groups = parsed.filter((value): value is string => typeof value === "string");
          queueMicrotask(() => setCollapsedGroups(groups));
        }
      }
    } catch {
      // Ignore storage read errors.
    }

    const media = window.matchMedia("(min-width: 1024px)");

    function updateDesktopState() {
      setIsDesktop(media.matches);
    }

    updateDesktopState();
    media.addEventListener("change", updateDesktopState);

    return () => {
      media.removeEventListener("change", updateDesktopState);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/me", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.visibleNav)) {
          setNavGroups(data.visibleNav as AdminNavGroup[]);
        }
      } catch {
        // Fail closed: leave navigation empty if permission truth cannot load.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleVisibility() {
    const nextVisible = !isVisible;
    setIsVisible(nextVisible);
    try {
      window.localStorage.setItem(VISIBILITY_STORAGE_KEY, JSON.stringify(nextVisible));
    } catch {
      // Ignore storage write issues.
    }
  }

  useEffect(() => {
    if (activeItemRef.current && navRef.current) {
      activeItemRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [pathname, collapsedGroups]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    function updateScrollState() {
      if (!nav) return;
      setCanScrollUp(nav.scrollTop > 0);
      setCanScrollDown(nav.scrollTop < nav.scrollHeight - nav.clientHeight - 5);
    }

    updateScrollState();
    nav.addEventListener("scroll", updateScrollState);
    window.addEventListener("resize", updateScrollState);

    return () => {
      nav.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, []);

  function toggleGroup(groupTitle: string) {
    const nextCollapsed = collapsedGroups.includes(groupTitle)
      ? collapsedGroups.filter((title) => title !== groupTitle)
      : [...collapsedGroups, groupTitle];
    setCollapsedGroups(nextCollapsed);
    try {
      window.localStorage.setItem(COLLAPSED_GROUPS_STORAGE_KEY, JSON.stringify(nextCollapsed));
    } catch {
      // Ignore storage write issues.
    }
  }

  function expandAllGroups() {
    setCollapsedGroups([]);
    try {
      window.localStorage.removeItem(COLLAPSED_GROUPS_STORAGE_KEY);
    } catch {
      // Ignore storage write issues.
    }
  }

  function renderNavItem(item: AdminNavItem) {
    const active = isActiveHref(pathname, item.href);
    return (
      <div ref={active ? activeItemRef : null} key={item.href}>
        <Link
          href={item.href}
          className={`flex items-center gap-3 rounded-[var(--admin-radius)] px-3 py-2.5 text-sm font-semibold transition ${
            active
              ? "bg-[var(--admin-primary)] text-white shadow-[var(--admin-shadow-sm)]"
              : "text-[var(--admin-muted)] hover:bg-white/5 hover:text-[var(--admin-text)]"
          }`}
        >
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-lg text-[0.65rem] font-bold ${
              active ? "bg-white/15 text-white" : "bg-[var(--admin-surface)] text-[var(--admin-muted)]"
            }`}
          >
            {item.icon}
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{item.title}</span>
            {item.launchTag === "beta" ? (
              <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-amber-200">
                Beta
              </span>
            ) : null}
          </span>
        </Link>
      </div>
    );
  }

  const sidebarVisible = isVisible;

  return (
    <>
      {!sidebarVisible && (
        <button
          type="button"
          onClick={toggleVisibility}
          aria-label="Show admin sidebar"
          aria-expanded={false}
          className="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-[var(--admin-radius)] bg-[var(--admin-primary)] text-white shadow-[var(--admin-shadow-sm)] hover:bg-[var(--admin-primary-hover)]"
          title="Show sidebar"
        >
          <span aria-hidden="true">☰</span>
        </button>
      )}
      {sidebarVisible && !isDesktop && (
        <div
          className="fixed inset-0 z-30 bg-[#020617]/65 lg:pointer-events-none lg:hidden"
          aria-hidden="true"
          onClick={toggleVisibility}
        />
      )}
      <aside
        className={`${
          sidebarVisible
            ? "translate-x-0 lg:w-72 lg:border-r lg:px-4 lg:py-5 lg:opacity-100 lg:pointer-events-auto"
            : "pointer-events-none -translate-x-full lg:translate-x-0 lg:w-0 lg:border-r-0 lg:px-0 lg:py-0 lg:opacity-0 lg:pointer-events-none"
        } fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col overflow-hidden border-[var(--admin-border)] transition-all duration-300`}
        style={{ background: "var(--admin-rail)" }}
        aria-label="Admin sidebar"
        aria-hidden={!sidebarVisible}
      >
        <div className="relative px-1">
          <div className="flex items-center gap-3">
            <Logo href="/admin" variant="icon" size={44} animation={false} className="pointer-events-none" />
            <span>
              <span className="block text-base font-bold text-[var(--admin-text)]">StarLiz</span>
              <span className="text-xs font-semibold text-[var(--admin-muted)]">School Management</span>
            </span>
          </div>

          <button
            type="button"
            onClick={toggleVisibility}
            aria-label="Hide admin sidebar"
            aria-expanded={true}
            className="absolute right-0 top-1 rounded-lg p-1.5 text-[var(--admin-muted)] hover:bg-white/5 hover:text-[var(--admin-text)]"
            title="Hide sidebar"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div ref={navRef} className="relative mt-8 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {canScrollUp && (
            <div className="sticky top-0 z-10 flex justify-center py-2" style={{ background: "linear-gradient(to bottom, var(--admin-rail), transparent)" }}>
              <div className="text-xs text-[var(--admin-muted)]">Scroll up</div>
            </div>
          )}
          <nav aria-label="Admin navigation" className="space-y-3">
            {navGroups.map((group) => {
              const activeGroup = group.items.some((item) => isActiveHref(pathname, item.href));
              const collapsed = collapsedGroups.includes(group.title) && !activeGroup;
              return (
                <section
                  key={group.title}
                  className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] p-1.5"
                  style={{ background: "var(--admin-surface)" }}
                >
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.title)}
                    aria-controls={groupDomId(group.title)}
                    aria-expanded={!collapsed}
                    className={`flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-[11px] font-bold uppercase tracking-[0.12em] transition ${
                      activeGroup
                        ? "text-[var(--admin-primary-hover)]"
                        : "text-[var(--admin-muted)] hover:bg-white/5 hover:text-[var(--admin-text)]"
                    }`}
                  >
                    <span>{group.title}</span>
                    <span aria-hidden="true" className="text-sm">{collapsed ? "+" : "−"}</span>
                  </button>
                  <div id={groupDomId(group.title)} className="mt-1 space-y-1" hidden={collapsed}>
                    {group.items.map((item) => renderNavItem(item))}
                  </div>
                </section>
              );
            })}
          </nav>

          {canScrollDown && (
            <div className="sticky bottom-0 z-10 flex justify-center py-2" style={{ background: "linear-gradient(to top, var(--admin-rail), transparent)" }}>
              <div className="text-xs text-[var(--admin-muted)]">Scroll down</div>
            </div>
          )}
        </div>

        <div className="mt-4 px-1">
          <button
            type="button"
            onClick={expandAllGroups}
            className="w-full rounded-[var(--admin-radius)] border border-[var(--admin-border)] px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--admin-muted)] hover:bg-white/5 hover:text-[var(--admin-text)]"
          >
            Expand All Sections
          </button>
        </div>
      </aside>
    </>
  );
}
