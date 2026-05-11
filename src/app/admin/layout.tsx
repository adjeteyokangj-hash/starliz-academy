import AdminLayout from "@/components/admin/AdminLayout";
import { prisma } from "@/lib/db";
import { readSessionFromCookie } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await readSessionFromCookie();
  if (!session) {
    redirect("/auth/login?next=/admin");
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
