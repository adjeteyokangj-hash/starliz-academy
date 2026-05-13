import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { readSessionFromCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ProfilesPage() {
  const session = await readSessionFromCookie();
  if (!session) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { role: true },
  });

  if (!user) {
    redirect("/login");
  }

  if (user.role === "parent") {
    redirect("/parent/children");
  }

  if (user.role === "student") {
    redirect("/student/dashboard");
  }

  if (user.role === "admin") {
    redirect("/admin");
  }

  redirect("/dashboard");
}
