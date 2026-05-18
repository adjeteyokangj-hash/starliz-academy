import { redirect } from "next/navigation";
import { readSessionFromCookie } from "@/lib/auth";
import ProfileSelectionClient from "./ProfileSelectionClient";

export const dynamic = "force-dynamic";

export default async function ParentProfilesPage() {
  const session = await readSessionFromCookie();

  if (!session) {
    redirect("/auth/login");
  }

  if (session.role === "admin") {
    redirect("/admin");
  }

  if (session.role === "student") {
    redirect("/student/dashboard");
  }

  return <ProfileSelectionClient />;
}
