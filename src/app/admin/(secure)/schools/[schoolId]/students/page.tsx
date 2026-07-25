import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";
import { SchoolStudentsRegistry } from "@/components/admin/schools/SchoolRosterPanels";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolStudentsPage({ params }: PageProps) {
  const { schoolId } = await params;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="students"
      title="Student Enrolment & Import"
      subtitle="Student roster, enrolment operations, and CSV import workflows."
    >
      <SchoolStudentsRegistry schoolId={schoolId} />
    </SchoolDashboardShell>
  );
}
