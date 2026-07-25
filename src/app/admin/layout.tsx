import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AdminLayout from "@/components/admin/AdminLayout";
import { prisma } from "@/lib/db";
import { readSessionFromCookie } from "@/lib/auth";

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

function isAdminLoginPath(pathname: string): boolean {
  return pathname === "/admin/login" || pathname.startsWith("/admin/login/");
}

export default async function Layout({ children }: { children: React.ReactNode }) {
  const headerStore = await headers();
  const pathname = headerStore.get("x-pathname")
    ?? headerStore.get("x-invoke-path")
    ?? "";
  const onLogin = isAdminLoginPath(pathname) || headerStore.get("x-admin-login") === "1";
  const session = await readSessionFromCookie();
  if (!session) {
    // When pathname headers are missing, do NOT redirect — that caused an infinite
    // /admin/login → /admin/login loop (stuck on the global "Loading page" screen).
    // Middleware remains the primary gate for unauthenticated /admin access.
    if (onLogin || !pathname) {
      return <>{children}</>;
    }
    redirect(`/admin/login?next=${encodeURIComponent(pathname)}`);
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

  const isActiveAdmin = Boolean(user && user.role === "admin" && user.adminProfile?.active !== false);

  if (!isActiveAdmin) {
    if (onLogin || !pathname) {
      return <>{children}</>;
    }
    redirect(`/admin/login?next=${encodeURIComponent(pathname)}&reason=switch`);
  }

  return <AdminLayout>{children}</AdminLayout>;
}
