import AdminLayout from "@/components/admin/AdminLayout";
import { prisma } from "@/lib/db";
import { readSessionFromCookie } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function isTransientDbSaturationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("EMAXCONNSESSION")
    || message.includes("too many connections")
    || message.includes("PrismaClientInitializationError")
    || message.includes("PrismaClientUnknownRequestError")
  );
}

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

  let user: { role: string; adminProfile: { active: boolean } | null } | null = null;
  try {
    user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { role: true, adminProfile: { select: { active: true } } },
    });
  } catch (error) {
    if (isTransientDbSaturationError(error)) {
      return (
        <div className="mx-auto mt-14 w-full max-w-xl rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-amber-100">
          <h1 className="text-xl font-black">Admin Temporarily Unavailable</h1>
          <p className="mt-2 text-sm text-amber-50/90">
            The database is under heavy load. Please retry in a few seconds.
          </p>
        </div>
      );
    }
    throw error;
  }

  if (!user || user.role !== "admin" || user.adminProfile?.active === false) {
    redirect("/dashboard");
  }

  return <AdminLayout>{children}</AdminLayout>;
}
