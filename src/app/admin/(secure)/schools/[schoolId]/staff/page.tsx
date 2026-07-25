import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";
import { SchoolTeachersRegistry } from "@/components/admin/schools/SchoolRosterPanels";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolStaffPage({ params }: PageProps) {
  const { schoolId } = await params;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="staff"
      title="Teachers & Staff"
      subtitle="Live teacher directory, roles, and invite workflows for this academy."
    >
      <SchoolTeachersRegistry schoolId={schoolId} />
    </SchoolDashboardShell>
  );
}
