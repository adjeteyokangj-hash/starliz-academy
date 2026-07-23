import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";
import { SchoolClassroomsRegistry } from "@/components/admin/schools/SchoolRosterPanels";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolClassroomsPage({ params }: PageProps) {
  const { schoolId } = await params;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="classrooms"
      title="Classroom Management"
      subtitle="Live class registry with year groups, lead teachers, and capacity."
    >
      <SchoolClassroomsRegistry schoolId={schoolId} />
    </SchoolDashboardShell>
  );
}
