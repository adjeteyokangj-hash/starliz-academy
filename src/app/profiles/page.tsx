import { redirect } from "next/navigation";
import { readSessionFromCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ProfilesPage() {
  let session: Awaited<ReturnType<typeof readSessionFromCookie>>;
  let user: { role: string } | null;

  try {
    session = await readSessionFromCookie();

    if (!session) {
      redirect("/login");
    }

    user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { role: true },
    });

    if (!user) {
      redirect("/login");
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
    redirect("/login");
  }

  if (user!.role === "parent") {
    redirect("/parent/profiles");
  }

  if (user!.role === "student") {
    redirect("/student/dashboard");
  }

  if (user!.role === "admin") {
    redirect("/admin");
  }

  redirect("/dashboard");
}
