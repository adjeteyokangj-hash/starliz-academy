"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminNavItems } from "@/lib/admin-nav";

const ORDER_STORAGE_KEY = "starliz.admin.sidebar.order.v1";
const VISIBILITY_STORAGE_KEY = "starliz.admin.sidebar.visible.v1";
type AdminNavHref = (typeof adminNavItems)[number]["href"];

function isAdminNavHref(value: string): value is AdminNavHref {
  return adminNavItems.some((item) => item.href === value);
}

function reorderByHref(items: readonly { href: AdminNavHref }[], fromHref: AdminNavHref, toHref: AdminNavHref): AdminNavHref[] {
  const hrefs = items.map((item) => item.href);
  const fromIndex = hrefs.indexOf(fromHref);
  const toIndex = hrefs.indexOf(toHref);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return hrefs;

  const next = [...hrefs];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export default function AdminSidebar() {
  const pathname = usePathname();
  const [savedOrder, setSavedOrder] = useState<AdminNavHref[] | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(ORDER_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      const filtered = parsed.filter((value): value is AdminNavHref => typeof value === "string" && isAdminNavHref(value));
      return filtered.length ? filtered : null;
    } catch {
      return null;
    }
  });
  const [draggingHref, setDraggingHref] = useState<AdminNavHref | null>(null);
  const [overHref, setOverHref] = useState<AdminNavHref | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const [isVisible, setIsVisible] = useState(() => {
    if (typeof window === "undefined") return true;
    if (window.matchMedia("(min-width: 1024px)").matches) return true;
    try {
      const raw = window.localStorage.getItem(VISIBILITY_STORAGE_KEY);
      return raw !== null ? (JSON.parse(raw) as boolean) : true;
    } catch {
      return true;
    }
  });
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : false,
  );

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

  useEffect(() => {
    if (!isDesktop) return;

    const id = window.requestAnimationFrame(() => {
      setIsVisible(true);
    });

    return () => window.cancelAnimationFrame(id);
  }, [isDesktop]);

  function toggleVisibility() {
    const nextVisible = !isVisible;
    setIsVisible(nextVisible);
    try {
      window.localStorage.setItem(VISIBILITY_STORAGE_KEY, JSON.stringify(nextVisible));
    } catch {
      // Ignore storage write issues.
    }
  }

  // Scroll active item into view
  useEffect(() => {
    if (activeItemRef.current && navRef.current) {
      activeItemRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [pathname]);

  // Track scroll position for up/down indicators
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

  const navItems = useMemo(() => {
    if (!savedOrder?.length) return [...adminNavItems];

    const byHref = new Map(adminNavItems.map((item) => [item.href, item]));
    const ordered = savedOrder
      .map((href) => byHref.get(href))
      .filter((item): item is (typeof adminNavItems)[number] => Boolean(item));

    for (const item of adminNavItems) {
      if (!savedOrder.includes(item.href)) {
        ordered.push(item);
      }
    }

    return ordered;
  }, [savedOrder]);

  function persistOrder(nextOrder: AdminNavHref[]) {
    setSavedOrder(nextOrder);
    try {
      window.localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(nextOrder));
    } catch {
      // Ignore storage write issues.
    }
  }

  function resetOrder() {
    setSavedOrder(null);
    try {
      window.localStorage.removeItem(ORDER_STORAGE_KEY);
    } catch {
      // Ignore storage write issues.
    }
  }

  return (
    <>
      {!isVisible && (
        <button
          onClick={toggleVisibility}
          className="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-500"
          title="Show sidebar"
        >
          ☰
        </button>
      )}
      <aside
        className={`${
          isVisible
            ? "translate-x-0 lg:w-72 lg:px-4 lg:py-5 lg:border-r lg:opacity-100"
            : "-translate-x-full lg:translate-x-0 lg:w-0 lg:px-0 lg:py-0 lg:border-r-0 lg:opacity-0"
        } fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col overflow-hidden border-slate-800 bg-slate-950/92 transition-all duration-300 lg:relative lg:z-auto`}
      >
        <div className="relative">
          <Link href="/admin" className="flex items-center gap-3 px-2">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-linear-to-br from-indigo-500 to-sky-400 text-sm font-black text-white shadow-lg shadow-indigo-950/40">
              SL
            </span>
            <span>
              <span className="block text-base font-black text-white">StarLiz Admin</span>
              <span className="text-xs font-semibold text-slate-400">Admin Portal</span>
            </span>
          </Link>

          <button
            onClick={toggleVisibility}
            className="absolute right-2 top-1 rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            title="Hide sidebar"
          >
            ✕
          </button>
        </div>

      <div ref={navRef} className="relative mt-8 flex-1 min-h-0 space-y-1 overflow-y-auto pr-2">
        {canScrollUp && (
          <div className="sticky top-0 z-10 -mx-2 flex justify-center bg-gradient-to-b from-slate-950 to-transparent py-2">
            <div className="text-slate-500 text-xs">↑ Scroll up</div>
          </div>
        )}
        <nav aria-label="Admin navigation">
          {navItems.map((item) => {
            const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            const dragOver = overHref === item.href && draggingHref !== item.href;
            return (
              <div
                ref={active ? activeItemRef : null}
                key={item.href}
                draggable
                onDragStart={() => {
                  setDraggingHref(item.href);
                  setOverHref(null);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!draggingHref || draggingHref === item.href) return;
                  setOverHref(item.href);
                }}
                onDragLeave={() => {
                  if (overHref === item.href) setOverHref(null);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (!draggingHref || draggingHref === item.href) return;
                  const nextOrder = reorderByHref(navItems, draggingHref, item.href);
                  persistOrder(nextOrder);
                  setDraggingHref(null);
                  setOverHref(null);
                }}
                onDragEnd={() => {
                  setDraggingHref(null);
                  setOverHref(null);
                }}
              >
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                    active
                      ? "bg-indigo-500 text-white shadow-lg shadow-indigo-950/30"
                      : "text-slate-400 hover:bg-slate-900 hover:text-white"
                  } ${dragOver ? "ring-2 ring-indigo-400/70" : ""}`}
                  title="Drag to rearrange"
                >
                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-[0.65rem] font-black ${
                    active ? "bg-white/16 text-white" : "bg-slate-900 text-slate-500"
                  }`}>
                    {item.icon}
                  </span>
                  {item.title}
                </Link>
              </div>
            );
          })}
        </nav>

        {canScrollDown && (
          <div className="sticky bottom-0 z-10 -mx-2 flex justify-center bg-gradient-to-t from-slate-950 to-transparent py-2">
            <div className="text-slate-500 text-xs">↓ Scroll down</div>
          </div>
        )}
      </div>

      <div className="mt-4 px-1">
        <button
          type="button"
          onClick={resetOrder}
          className="w-full rounded-lg border border-slate-800 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400 hover:bg-slate-900 hover:text-white"
        >
          Reset Sidebar Order
        </button>
      </div>
      </aside>
    </>
  );
}
