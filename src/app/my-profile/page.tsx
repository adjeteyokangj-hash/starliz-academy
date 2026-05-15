import { redirect } from "next/navigation";
import { readSessionFromCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function MyProfilePage() {
  const session = await readSessionFromCookie();

  if (!session) {
    redirect("/login");
  }

  if (session.role === "student") {
    redirect("/student/profile");
  }

  if (session.role === "admin") {
    redirect("/admin");
  }

  redirect("/parent/profile");
}
