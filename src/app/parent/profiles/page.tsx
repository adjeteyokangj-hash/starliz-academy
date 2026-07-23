import { Suspense } from "react";
import { redirect } from "next/navigation";
import { readSessionFromCookie } from "@/lib/auth";
import { loadParentProfilesPayload } from "@/lib/parent-profiles";
import ProfileSelectionClient from "./ProfileSelectionClient";
import ParentProfilesLoading from "./loading";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ParentProfilesPage({ searchParams }: PageProps) {
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

  const params = await searchParams;
  const intent = typeof params.intent === "string" ? params.intent : null;
  const nextPath = typeof params.next === "string" ? params.next : null;
  const initialPayload = await loadParentProfilesPayload(session);

  return (
    <Suspense fallback={<ParentProfilesLoading />}>
      <ProfileSelectionClient
        intent={intent}
        nextPath={nextPath}
        initialPayload={initialPayload}
      />
    </Suspense>
  );
}
