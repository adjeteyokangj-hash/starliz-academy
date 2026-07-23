import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";
import SchoolAssignmentsBoard from "@/components/admin/schools/SchoolAssignmentsBoard";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolAssignmentsPage({ params }: PageProps) {
  const { schoolId } = await params;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="assignments"
      title="Assignments"
      subtitle="School assignment planning, release tracking, and lesson delivery operations."
    >
      <SchoolAssignmentsBoard schoolId={schoolId} />
    </SchoolDashboardShell>
  );
}
