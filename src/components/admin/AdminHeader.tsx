"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { adminNavItems } from "@/lib/admin-nav";

export default function AdminHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const current = adminNavItems.find((item) => item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href));

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/auth/login");
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/92 backdrop-blur-xl">
      <div className="flex min-h-20 flex-col gap-4 px-4 py-4 md:px-6 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-blue-300">StarLiz Admin</p>
          <h1 className="text-2xl font-black text-white">{current?.title ?? "Admin Portal"}</h1>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative min-w-0 sm:w-80">
            <span className="sr-only">Search admin portal</span>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">⌕</span>
            <input
              type="search"
              placeholder="Search parents, students, content"
              className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-9 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30"
            />
          </label>

          <Link href="/admin/inbox" aria-label="Notifications" className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 text-slate-300 hover:text-white">
            !
          </Link>
          <Link href="/admin/settings" className="flex h-11 items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-3 text-sm font-bold text-slate-200 hover:text-white">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500 text-xs text-white">A</span>
            Admin
          </Link>
          <Link href="/dashboard" className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-bold text-slate-200 hover:text-white">
            Back to App
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-2xl border border-red-800 bg-red-950/60 px-4 py-3 text-sm font-bold text-red-300 hover:bg-red-900/60 hover:text-red-100"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}

