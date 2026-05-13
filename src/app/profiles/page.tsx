import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { readSessionFromCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ProfilesPage() {
  const session = await readSessionFromCookie();
  if (!session) {
    console.info("[profiles.bridge] redirect", {
      role: null,
      hasParent: false,
      childCount: 0,
      consentStatus: "unknown",
      redirectTarget: "/login",
    });
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      role: true,
      consentAcceptedAt: true,
      parentProfile: { select: { id: true } },
    },
  });

  if (!user) {
    console.info("[profiles.bridge] redirect", {
      role: null,
      hasParent: false,
      childCount: 0,
      consentStatus: "unknown",
      redirectTarget: "/login",
    });
    redirect("/login");
  }

  const consentStatus = user.consentAcceptedAt ? "accepted" : "pending";
  const hasParent = user.role === "parent" || Boolean(user.parentProfile);

  if (user.role === "parent") {
    const childCount = await prisma.childProfile.count({
      where: { parentId: session.userId, archived: false },
    });
    const redirectTarget = childCount > 0 ? "/parent/dashboard" : "/parent/children?mode=add";
    console.info("[profiles.bridge] redirect", {
      role: user.role,
      hasParent,
      childCount,
      consentStatus,
      redirectTarget,
    });
    redirect(redirectTarget);
  }

  if (user.role === "student") {
    console.info("[profiles.bridge] redirect", {
      role: user.role,
      hasParent,
      childCount: 0,
      consentStatus,
      redirectTarget: "/student/dashboard",
    });
    redirect("/student/dashboard");
  }

  if (user.role === "admin") {
    console.info("[profiles.bridge] redirect", {
      role: user.role,
      hasParent,
      childCount: 0,
      consentStatus,
      redirectTarget: "/admin",
    });
    redirect("/admin");
  }

  console.info("[profiles.bridge] redirect", {
    role: user.role,
    hasParent,
    childCount: 0,
    consentStatus,
    redirectTarget: "/dashboard",
  });
  redirect("/dashboard");
}
