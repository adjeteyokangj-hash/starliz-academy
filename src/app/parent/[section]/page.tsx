import { notFound } from "next/navigation";
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
  "notifications",
  "support",
  "security",
]);

export default async function ParentSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.has(section)) {
    notFound();
  }

  return <ParentPortalShell section={section as Parameters<typeof ParentPortalShell>[0]["section"]} />;
}