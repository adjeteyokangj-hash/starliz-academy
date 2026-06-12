"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/Logo";
import { adminNavGroups, type AdminNavItem } from "@/lib/admin-nav";

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
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(COLLAPSED_GROUPS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((value): value is string => typeof value === "string");
    } catch {
      return [];
    }
  });
  const [isVisible, setIsVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const raw = window.localStorage.getItem(VISIBILITY_STORAGE_KEY);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (typeof parsed === "boolean") return parsed;
      }
    } catch {
      // Ignore storage read errors.
    }
    return false;
  });
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
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

  function toggleVisibility() {
    const nextVisible = !isVisible;
    setIsVisible(nextVisible);
    try {
      window.localStorage.setItem(VISIBILITY_STORAGE_KEY, JSON.stringify(nextVisible));
    } catch {
      // Ignore storage write issues.
    }
  }

  // Scroll active item into view.
  useEffect(() => {
    if (activeItemRef.current && navRef.current) {
      activeItemRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [pathname, collapsedGroups]);

  // Track scroll position for up/down indicators.
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
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
            active
              ? "bg-indigo-500 text-white shadow-lg shadow-indigo-950/30"
              : "text-slate-400 hover:bg-slate-900 hover:text-white"
          }`}
        >
          <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-[0.65rem] font-black ${
            active ? "bg-white/16 text-white" : "bg-slate-900 text-slate-500"
          }`}>
            {item.icon}
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{item.title}</span>
            {item.launchTag === "beta" ? (
              <span className="rounded-full border border-amber-500/50 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-amber-300">
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
          onClick={toggleVisibility}
          className="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-500"
          title="Show sidebar"
        >
          ☰
        </button>
      )}
      {sidebarVisible && !isDesktop && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/60 lg:hidden lg:pointer-events-none"
          aria-hidden="true"
          onClick={toggleVisibility}
        />
      )}
      <aside
        className={`${
          sidebarVisible
            ? "translate-x-0 lg:w-72 lg:px-4 lg:py-5 lg:border-r lg:opacity-100 lg:pointer-events-auto"
            : "-translate-x-full pointer-events-none lg:translate-x-0 lg:w-0 lg:px-0 lg:py-0 lg:border-r-0 lg:opacity-0 lg:pointer-events-none"
        } fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col overflow-hidden border-slate-800 bg-slate-950/92 transition-all duration-300`}
      >
        <div className="relative">
          <div className="flex items-center gap-3 px-2">
            <Logo href="/admin" variant="icon" size={44} animation={false} className="pointer-events-none" />
            <span>
              <span className="block text-base font-black text-white">StarLiz Admin</span>
              <span className="text-xs font-semibold text-slate-400">Admin Portal</span>
            </span>
          </div>

          <button
            onClick={toggleVisibility}
            className="absolute right-2 top-1 rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            title="Hide sidebar"
          >
            x
          </button>
        </div>

        <div ref={navRef} className="relative mt-8 min-h-0 flex-1 space-y-1 overflow-y-auto pr-2">
          {canScrollUp && (
            <div className="sticky top-0 z-10 -mx-2 flex justify-center bg-linear-to-b from-slate-950 to-transparent py-2">
              <div className="text-xs text-slate-500">Scroll up</div>
            </div>
          )}
          <nav aria-label="Admin navigation" className="space-y-3">
            {adminNavGroups.map((group) => {
              const activeGroup = group.items.some((item) => isActiveHref(pathname, item.href));
              const collapsed = collapsedGroups.includes(group.title) && !activeGroup;
              return (
                <section key={group.title} className="rounded-xl border border-slate-900 bg-slate-950/50 p-1.5">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.title)}
                    aria-controls={groupDomId(group.title)}
                    className={`flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-[11px] font-black uppercase tracking-[0.14em] transition ${
                      activeGroup ? "text-indigo-200" : "text-slate-500 hover:bg-slate-900 hover:text-slate-300"
                    }`}
                  >
                    <span>{group.title}</span>
                    <span aria-hidden="true" className="text-sm">{collapsed ? "+" : "-"}</span>
                  </button>
                  <div id={groupDomId(group.title)} className="mt-1 space-y-1" hidden={collapsed}>
                    {group.items.map((item) => renderNavItem(item))}
                  </div>
                </section>
              );
            })}
          </nav>

          {canScrollDown && (
            <div className="sticky bottom-0 z-10 -mx-2 flex justify-center bg-linear-to-t from-slate-950 to-transparent py-2">
              <div className="text-xs text-slate-500">Scroll down</div>
            </div>
          )}
        </div>

        <div className="mt-4 px-1">
          <button
            type="button"
            onClick={expandAllGroups}
            className="w-full rounded-lg border border-slate-800 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400 hover:bg-slate-900 hover:text-white"
          >
            Expand All Sections
          </button>
        </div>
      </aside>
    </>
  );
}
