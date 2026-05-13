import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { readSessionFromCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

function logBridgeRedirect(payload: {
  role: string | null;
  hasParent: boolean;
  childCount: number;
  consentStatus: "accepted" | "pending" | "unknown";
  redirectTarget: string;
}) {
  console.info("[profiles.bridge] redirect", payload);
}

export default async function ProfilesPage() {
  let session: Awaited<ReturnType<typeof readSessionFromCookie>>;
  let user: { role: string; consentAcceptedAt: Date | null } | null;
  let childCount = 0;

  try {
    session = await readSessionFromCookie();

    if (!session) {
      logBridgeRedirect({ role: null, hasParent: false, childCount: 0, consentStatus: "unknown", redirectTarget: "/login" });
      redirect("/login");
    }

    user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { role: true, consentAcceptedAt: true },
    });

    if (!user) {
      logBridgeRedirect({ role: null, hasParent: false, childCount: 0, consentStatus: "unknown", redirectTarget: "/login" });
      redirect("/login");
    }

    if (user.role === "parent") {
      childCount = await prisma.childProfile.count({
        where: { parentId: session.userId, archived: false },
      });
    }
  } catch (error) {
    // Re-throw Next.js redirect/notFound errors so they are handled correctly
    if (
      error !== null &&
      typeof (error as Record<string, unknown>).digest === "string" &&
      ((error as Record<string, unknown>).digest as string).startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    console.error("[profiles.bridge] failed", {
      message: error instanceof Error ? error.message : String(error),
      redirectTarget: "/login",
    });
    redirect("/login");
  }

  const consentStatus = user!.consentAcceptedAt ? "accepted" : "pending";
  const hasParent = user!.role === "parent";

  if (user!.role === "parent") {
    const redirectTarget = childCount > 0 ? "/parent/dashboard" : "/parent/children?mode=add";
    logBridgeRedirect({ role: user!.role, hasParent, childCount, consentStatus, redirectTarget });
    redirect(redirectTarget);
  }

  if (user!.role === "student") {
    logBridgeRedirect({ role: user!.role, hasParent, childCount: 0, consentStatus, redirectTarget: "/student/dashboard" });
    redirect("/student/dashboard");
  }

  if (user!.role === "admin") {
    logBridgeRedirect({ role: user!.role, hasParent, childCount: 0, consentStatus, redirectTarget: "/admin" });
    redirect("/admin");
  }

  logBridgeRedirect({ role: user!.role, hasParent, childCount: 0, consentStatus, redirectTarget: "/dashboard" });
  redirect("/dashboard");
}
