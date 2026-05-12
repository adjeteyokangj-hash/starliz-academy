import { readSessionFromCookie } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  const session = await readSessionFromCookie();
  if (session?.role === "admin") {
    redirect("/admin");
  }
  return <>{children}</>;
}
