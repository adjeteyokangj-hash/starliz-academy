import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AdminLayout from "@/components/admin/AdminLayout";
import { prisma } from "@/lib/db";
import { readSessionFromCookie } from "@/lib/auth";
import { buildAdminLoginUrl } from "@/lib/admin-auth-gate";

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

function resolveRequestedAdminPath(headerStore: Headers): string {
  const candidates = [
    headerStore.get("x-pathname"),
    headerStore.get("x-invoke-path"),
    headerStore.get("next-url"),
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const path = raw.startsWith("http") ? new URL(raw).pathname : raw.split("?")[0];
    if (path.startsWith("/admin") && !path.startsWith("/admin/login")) {
      return path;
    }
  }
  return "/admin";
}

/**
 * Platform admin console gate.
 * Unauthenticated and non-admin sessions redirect before any console UI renders
 * (including Unauthorized cards on client pages).
 *
 * Login lives outside this route group at `/admin/login` (`(public)/login`),
 * so this layout never wraps the login form and cannot loop.
 */
export default async function SecureAdminLayout({ children }: { children: React.ReactNode }) {
  const headerStore = await headers();
  const requestedPath = resolveRequestedAdminPath(headerStore);
  const session = await readSessionFromCookie();
  if (!session) {
    redirect(buildAdminLoginUrl(requestedPath));
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
    redirect(buildAdminLoginUrl(requestedPath, "", "switch"));
  }

  return <AdminLayout>{children}</AdminLayout>;
}
