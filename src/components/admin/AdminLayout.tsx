import AdminHeader from "@/components/admin/AdminHeader";
import AdminSidebar from "@/components/admin/AdminSidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#08111f] text-slate-100">
      <div className="flex min-h-screen">
        <AdminSidebar />
        <div className="min-w-0 flex-1">
          <AdminHeader />
          <main className="relative z-10 px-4 pb-6 pt-8 md:px-6 md:pt-10 xl:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}

