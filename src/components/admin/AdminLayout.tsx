import AdminHeader from "@/components/admin/AdminHeader";
import AdminSessionKeepAlive from "@/components/admin/AdminSessionKeepAlive";
import AdminSidebar from "@/components/admin/AdminSidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-admin-theme className="min-h-screen text-[var(--admin-text)]" style={{ background: "var(--admin-bg)" }}>
      <div className="flex min-h-screen">
        <AdminSessionKeepAlive />
        <AdminSidebar />
        {/* On mobile the sidebar is a fixed overlay, so main takes full width.
            On desktop (lg+) when sidebar is visible, leave room for it via lg:pl-72. */}
        <div className="min-w-0 flex-1 transition-all duration-300">
          <AdminHeader />
          <main className="relative z-10 w-full overflow-x-hidden px-4 pb-28 pt-8 sm:px-6 md:pb-12 md:pt-10 lg:px-8 xl:px-10 2xl:px-12">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
