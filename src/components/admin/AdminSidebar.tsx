"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminNavItems } from "@/lib/admin-nav";

const ORDER_STORAGE_KEY = "starliz.admin.sidebar.order.v1";
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
  const [savedOrder, setSavedOrder] = useState<AdminNavHref[] | null>(null);
  const [draggingHref, setDraggingHref] = useState<AdminNavHref | null>(null);
  const [overHref, setOverHref] = useState<AdminNavHref | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ORDER_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const normalized = parsed.filter((value): value is AdminNavHref => typeof value === "string" && isAdminNavHref(value));
      if (normalized.length) {
        window.setTimeout(() => setSavedOrder(normalized), 0);
      }
    } catch {
      // Ignore invalid local storage payloads.
    }
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
    <aside className="hidden w-72 shrink-0 border-r border-slate-800 bg-slate-950/92 px-4 py-5 lg:block">
      <Link href="/admin" className="flex items-center gap-3 px-2">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-linear-to-br from-indigo-500 to-sky-400 text-sm font-black text-white shadow-lg shadow-indigo-950/40">
          SL
        </span>
        <span>
          <span className="block text-base font-black text-white">StarLiz Admin</span>
          <span className="text-xs font-semibold text-slate-400">Admin Portal</span>
        </span>
      </Link>

      <nav className="mt-8 space-y-1" aria-label="Admin navigation">
        {navItems.map((item) => {
          const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          const dragOver = overHref === item.href && draggingHref !== item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
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
          );
        })}
      </nav>

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
  );
}
