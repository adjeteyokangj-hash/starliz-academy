import AdminLayout from "@/components/admin/AdminLayout";
import { prisma } from "@/lib/db";
import { readSessionFromCookie } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await readSessionFromCookie();
  // Don't check authentication here - middleware already handles routing
  // For /admin without session, middleware redirects to /admin/login
  // For /admin/login, middleware allows unauthenticated access
  if (!session) {
    // Just render children for /admin/login - no redirect needed
    // Middleware ensures unauthenticated requests to /admin go to /admin/login
    return <>{children}</>;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { role: true, adminProfile: { select: { active: true } } },
  });

  if (!user || user.role !== "admin" || user.adminProfile?.active === false) {
    redirect("/dashboard");
  }

  return <AdminLayout>{children}</AdminLayout>;
}
