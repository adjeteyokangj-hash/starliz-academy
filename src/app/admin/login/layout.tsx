import { readSessionFromCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

export default async function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  const session = await readSessionFromCookie();
  if (session?.role === "admin") {
    const profile = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { adminProfile: { select: { active: true } } },
    });
    // Only skip the login form when this is a fully active admin session.
    if (profile?.adminProfile?.active !== false) {
      redirect("/admin");
    }
  }
  return <>{children}</>;
}
