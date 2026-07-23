import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";
import { SchoolTeachersRegistry } from "@/components/admin/schools/SchoolRosterPanels";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolStaffDirectoryPage({ params }: PageProps) {
  const { schoolId } = await params;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="staff"
      title="Staff Directory"
      subtitle="Live staff directory for this academy — roles, status, and last activity."
    >
      <SchoolTeachersRegistry schoolId={schoolId} />
    </SchoolDashboardShell>
  );
}
