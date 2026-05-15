import { redirect } from "next/navigation";
import ParentSessionKeepAlive from "@/components/parent/ParentSessionKeepAlive";
import { readSessionFromCookie } from "@/lib/auth";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const session = await readSessionFromCookie();

  if (!session) {
    redirect("/login");
  }

  if (session.role !== "parent") {
    redirect(session.role === "admin" ? "/admin" : "/student/dashboard");
  }

  return (
    <>
      <ParentSessionKeepAlive />
      {children}
    </>
  );
}
