import { redirect } from "next/navigation";
import { readSessionFromCookie } from "@/lib/auth";
import CodingWorld from "@/components/coding/world/CodingWorld";
export default async function CodingWorldPage() {
  if (!await readSessionFromCookie()) redirect("/auth/login?next=/student/coding/world");
  return <CodingWorld />;
}
