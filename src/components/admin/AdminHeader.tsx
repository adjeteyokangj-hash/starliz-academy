"use client";

import { usePathname, useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { adminNavItems } from "@/lib/admin-nav";
import { AdminButton, AdminButtonLink, AdminInput } from "@/components/admin/ui";

export default function AdminHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const current = adminNavItems.find((item) =>
    item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href),
  );

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    router.push("/auth/login");
  }

  return (
    <header
      className="relative z-20 border-b border-[var(--admin-border)] backdrop-blur-xl"
      style={{ background: "color-mix(in srgb, var(--admin-rail) 92%, transparent)", boxShadow: "var(--admin-shadow-sm)" }}
    >
      <div className="flex min-h-[4.75rem] flex-col gap-4 px-4 py-4 pl-24 md:px-6 md:pl-28 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <Logo variant="icon" size={36} animation={false} className="pointer-events-none" />
          <div>
            <p className="admin-meta">Operations console</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--admin-text)] sm:text-[1.75rem]">
              {current?.title ?? "Admin Portal"}
              {current?.launchTag === "beta" ? " (Beta)" : ""}
            </h1>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative min-w-0 sm:w-80">
            <span className="sr-only">Search admin portal</span>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--admin-muted)]">⌕</span>
            <AdminInput
              type="search"
              placeholder="Search parents, students, content"
              className="pl-9"
            />
          </label>

          <AdminButtonLink href="/admin/inbox" variant="secondary" size="sm" className="h-11 w-11 px-0" aria-label="Notifications">
            !
          </AdminButtonLink>
          <AdminButtonLink href="/admin/settings" variant="secondary" size="sm" className="h-11 gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--admin-primary)] text-xs text-white">A</span>
            Admin
          </AdminButtonLink>
          <AdminButtonLink href="/dashboard" variant="secondary" size="sm" className="h-11">
            Back to App
          </AdminButtonLink>
          <AdminButton variant="danger" size="sm" className="h-11" onClick={handleLogout}>
            Logout
          </AdminButton>
        </div>
      </div>
    </header>
  );
}
