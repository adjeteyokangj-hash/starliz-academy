import AdminHeader from "@/components/admin/AdminHeader";
import AdminSessionKeepAlive from "@/components/admin/AdminSessionKeepAlive";
import AdminSidebar from "@/components/admin/AdminSidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#08111f] text-slate-100">
      <div className="flex min-h-screen">
        <AdminSessionKeepAlive />
        <AdminSidebar />
        <div className="min-w-0 flex-1">
          <AdminHeader />
          <main className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-32 pt-8 sm:px-6 md:pb-12 md:pt-10 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}

