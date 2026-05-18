import { notFound, redirect } from "next/navigation";
import ParentPortalShell from "@/components/parent/ParentPortalShell";

const sections = new Set([
  "dashboard",
  "children",
  "billing",
  "progress",
  "tutor-history",
  "rewards",
  "consent",
  "messages",
  "support",
]);

const retiredToDashboard = new Set(["notifications", "security", "profile"]);

export default async function ParentSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (retiredToDashboard.has(section)) {
    redirect("/parent/dashboard");
  }
  if (!sections.has(section)) {
    notFound();
  }

  return <ParentPortalShell section={section as Parameters<typeof ParentPortalShell>[0]["section"]} />;
}