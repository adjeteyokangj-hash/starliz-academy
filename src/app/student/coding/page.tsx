import { redirect } from "next/navigation";
import CodingHome from "@/components/coding/CodingHome";
import { readSessionFromCookie } from "@/lib/auth";

export default async function StudentCodingPage() {
  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/student/coding");
  return <CodingHome />;
}
